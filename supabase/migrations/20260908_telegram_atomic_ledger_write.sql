-- Forward-compatible Telegram ledger primitive.
-- Safe to apply before the webhook uses it: this adds service-role-only helpers
-- and idempotency state without changing existing browser RLS policies.

create table if not exists public.telegram_processed_updates (
  user_id uuid not null references auth.users(id) on delete cascade,
  update_id bigint not null,
  result jsonb not null,
  processed_at timestamptz not null default now(),
  primary key (user_id, update_id)
);

alter table public.telegram_processed_updates enable row level security;

-- No browser policies. Telegram idempotency state is server-only.
revoke all on table public.telegram_processed_updates from public, anon, authenticated;
grant select, insert, update, delete on table public.telegram_processed_updates to service_role;

create or replace function public.taptrack_calculated_balance(
  target_user_id uuid,
  target_currency text,
  target_method text
)
returns numeric
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  checkpoint_amount numeric := 0;
  checkpoint_date text;
  checkpoint_effective_at timestamptz;
  has_checkpoint boolean := false;
  ambiguous_count bigint := 0;
  transaction_delta numeric := 0;
  conversion_delta numeric := 0;
begin
  if target_currency not in ('TRY', 'USD', 'EUR') then
    raise exception 'Unsupported TapTrack currency: %', target_currency;
  end if;
  if target_method not in ('cash', 'card') then
    raise exception 'Unsupported TapTrack method: %', target_method;
  end if;

  select c.observed_amount, c.date, c.effective_at
    into checkpoint_amount, checkpoint_date, checkpoint_effective_at
  from public.balance_checkpoints c
  where c.user_id = target_user_id
    and c.currency = target_currency
    and c.method = target_method
    and c.deleted_at is null
  order by c.effective_at desc, c.id desc
  limit 1;

  has_checkpoint := found;
  if not has_checkpoint then
    checkpoint_amount := 0;
  end if;

  if has_checkpoint then
    select
      (select count(*)
       from public.transactions t
       where t.user_id = target_user_id
         and t.currency = target_currency
         and t.method = target_method
         and t.deleted_at is null
         and t.occurred_at is null
         and t.created_at > checkpoint_effective_at
         and t.date = checkpoint_date)
      +
      (select count(*)
       from public.conversions c
       where c.user_id = target_user_id
         and c.deleted_at is null
         and c.occurred_at is null
         and c.created_at > checkpoint_effective_at
         and c.date = checkpoint_date
         and (
           (c.from_currency = target_currency and c.from_method = target_method)
           or (c.to_currency = target_currency and c.to_method = target_method)
         ))
      into ambiguous_count;

    if ambiguous_count > 0 then
      raise exception 'TapTrack ledger contains unresolved same-day ordering for % %',
        target_currency, target_method;
    end if;
  end if;

  select coalesce(sum(case when t.type = 'income' then t.amount else -t.amount end), 0)
    into transaction_delta
  from public.transactions t
  where t.user_id = target_user_id
    and t.currency = target_currency
    and t.method = target_method
    and t.deleted_at is null
    and (
      not has_checkpoint
      or (t.occurred_at is not null and t.occurred_at > checkpoint_effective_at)
      or (
        t.occurred_at is null
        and t.created_at > checkpoint_effective_at
        and t.date > checkpoint_date
      )
    );

  select coalesce(sum(
    (case
      when c.to_currency = target_currency and c.to_method = target_method then c.to_amount
      else 0
    end)
    -
    (case
      when c.from_currency = target_currency and c.from_method = target_method then c.from_amount
      else 0
    end)
  ), 0)
    into conversion_delta
  from public.conversions c
  where c.user_id = target_user_id
    and c.deleted_at is null
    and (
      (c.from_currency = target_currency and c.from_method = target_method)
      or (c.to_currency = target_currency and c.to_method = target_method)
    )
    and (
      not has_checkpoint
      or (c.occurred_at is not null and c.occurred_at > checkpoint_effective_at)
      or (
        c.occurred_at is null
        and c.created_at > checkpoint_effective_at
        and c.date > checkpoint_date
      )
    );

  return checkpoint_amount + transaction_delta + conversion_delta;
end;
$$;

revoke all on function public.taptrack_calculated_balance(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.taptrack_calculated_balance(uuid, text, text)
  to service_role;

create or replace function public.apply_taptrack_telegram_update(
  target_user_id uuid,
  telegram_update_id bigint,
  ledger_date text,
  drafts jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  existing_result jsonb;
  item jsonb;
  bucket record;
  available_amount numeric;
  total_delta numeric;
  now_at timestamptz := now();
  inserted_rows jsonb := '[]'::jsonb;
  row_id text;
  ordinal_index bigint;
  result_payload jsonb;
begin
  if telegram_update_id < 0 then
    raise exception 'Invalid Telegram update id';
  end if;
  if ledger_date !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'Invalid TapTrack ledger date';
  end if;
  if jsonb_typeof(drafts) <> 'array' or jsonb_array_length(drafts) = 0 then
    raise exception 'Telegram update must contain at least one transaction';
  end if;
  if jsonb_array_length(drafts) > 25 then
    raise exception 'Telegram update contains too many transactions';
  end if;

  -- Same lock order as protected browser sync and account restore.
  insert into public.ledger_versions (user_id)
  values (target_user_id)
  on conflict (user_id) do nothing;

  perform 1
  from public.ledger_versions lv
  where lv.user_id = target_user_id
  for update;

  select p.result into existing_result
  from public.telegram_processed_updates p
  where p.user_id = target_user_id
    and p.update_id = telegram_update_id;

  if found then
    return existing_result || jsonb_build_object('duplicate', true);
  end if;

  for item in select value from jsonb_array_elements(drafts)
  loop
    if item->>'type' not in ('income', 'expense') then
      raise exception 'Invalid Telegram transaction type';
    end if;
    if coalesce((item->>'amount')::numeric, 0) <= 0 then
      raise exception 'Invalid Telegram transaction amount';
    end if;
    if item->>'currency' not in ('TRY', 'USD', 'EUR') then
      raise exception 'Invalid Telegram transaction currency';
    end if;
    if item->>'method' not in ('cash', 'card') then
      raise exception 'Invalid Telegram transaction method';
    end if;
    if nullif(btrim(item->>'title'), '') is null then
      raise exception 'Invalid Telegram transaction title';
    end if;
    if nullif(btrim(item->>'category_id'), '') is null then
      raise exception 'Invalid Telegram transaction category';
    end if;
  end loop;

  for bucket in
    select
      value->>'currency' as currency,
      value->>'method' as method,
      sum(
        case
          when value->>'type' = 'income' then (value->>'amount')::numeric
          else -(value->>'amount')::numeric
        end
      ) as delta
    from jsonb_array_elements(drafts)
    group by value->>'currency', value->>'method'
  loop
    available_amount := public.taptrack_calculated_balance(
      target_user_id,
      bucket.currency,
      bucket.method
    );
    total_delta := bucket.delta;

    if available_amount + total_delta < 0 then
      result_payload := jsonb_build_object(
        'applied', false,
        'duplicate', false,
        'errorCode', 'insufficient-balance',
        'currency', bucket.currency,
        'method', bucket.method,
        'availableAmount', available_amount
      );

      insert into public.telegram_processed_updates (user_id, update_id, result, processed_at)
      values (target_user_id, telegram_update_id, result_payload, now_at);
      return result_payload;
    end if;
  end loop;

  for item, ordinal_index in
    select value, ordinality
    from jsonb_array_elements(drafts) with ordinality
  loop
    row_id := format('telegram-%s-%s', telegram_update_id, ordinal_index);

    insert into public.transactions (
      user_id, id, type, amount, currency, title, category_id, method, date,
      note, recurring_source_id, created_at, updated_at, occurred_at, deleted_at
    ) values (
      target_user_id,
      row_id,
      item->>'type',
      (item->>'amount')::numeric,
      item->>'currency',
      btrim(item->>'title'),
      item->>'category_id',
      item->>'method',
      ledger_date,
      nullif(btrim(item->>'note'), ''),
      null,
      now_at,
      now_at,
      now_at,
      null
    )
    on conflict (user_id, id) do nothing;

    inserted_rows := inserted_rows || jsonb_build_array(jsonb_build_object(
      'id', row_id,
      'type', item->>'type',
      'amount', (item->>'amount')::numeric,
      'currency', item->>'currency',
      'title', btrim(item->>'title'),
      'method', item->>'method'
    ));
  end loop;

  result_payload := jsonb_build_object(
    'applied', true,
    'duplicate', false,
    'transactions', inserted_rows
  );

  insert into public.telegram_processed_updates (user_id, update_id, result, processed_at)
  values (target_user_id, telegram_update_id, result_payload, now_at);

  return result_payload;
end;
$$;

revoke all on function public.apply_taptrack_telegram_update(uuid, bigint, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.apply_taptrack_telegram_update(uuid, bigint, text, jsonb)
  to service_role;
