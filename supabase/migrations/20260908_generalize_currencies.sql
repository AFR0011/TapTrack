-- TT-B004: allow any validated three-letter currency code. Application support
-- is discovered from Frankfurter; historical rows are never rewritten.

do $$
begin
  alter table public.transactions drop constraint if exists transactions_currency_check;
  alter table public.balances drop constraint if exists balances_currency_check;
  alter table public.balance_checkpoints drop constraint if exists balance_checkpoints_currency_check;
  alter table public.recurring_transactions drop constraint if exists recurring_transactions_currency_check;
  alter table public.conversions drop constraint if exists conversions_from_currency_check;
  alter table public.conversions drop constraint if exists conversions_to_currency_check;
  alter table public.monthly_budgets drop constraint if exists monthly_budgets_currency_check;
  alter table public.category_budgets drop constraint if exists category_budgets_currency_check;
  alter table public.settings drop constraint if exists settings_default_currency_check;
end $$;

alter table public.transactions add constraint transactions_currency_check check (currency ~ '^[A-Z]{3}$');
alter table public.balances add constraint balances_currency_check check (currency ~ '^[A-Z]{3}$');
alter table public.balance_checkpoints add constraint balance_checkpoints_currency_check check (currency ~ '^[A-Z]{3}$');
alter table public.recurring_transactions add constraint recurring_transactions_currency_check check (currency ~ '^[A-Z]{3}$');
alter table public.conversions add constraint conversions_from_currency_check check (from_currency ~ '^[A-Z]{3}$');
alter table public.conversions add constraint conversions_to_currency_check check (to_currency ~ '^[A-Z]{3}$');
alter table public.monthly_budgets add constraint monthly_budgets_currency_check check (currency ~ '^[A-Z]{3}$');
alter table public.category_budgets add constraint category_budgets_currency_check check (currency ~ '^[A-Z]{3}$');
alter table public.settings add constraint settings_default_currency_check check (default_currency ~ '^[A-Z]{3}$');

create or replace function public.apply_taptrack_capture(
  target_user_id uuid,
  capture_token_id uuid,
  capture_request_id uuid,
  ledger_date text,
  draft jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  existing_result jsonb;
  now_at timestamptz := now();
  current_bucket timestamptz := date_trunc('minute', now());
  current_count integer;
  available_amount numeric;
  row_id text := 'capture-' || capture_request_id::text;
  category_name text;
  result_payload jsonb;
begin
  if ledger_date !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'Invalid TapTrack capture date';
  end if;
  if draft is null or jsonb_typeof(draft) <> 'object' then
    raise exception 'Invalid TapTrack capture draft';
  end if;

  insert into public.ledger_versions (user_id)
  values (target_user_id)
  on conflict (user_id) do nothing;

  perform 1
  from public.ledger_versions lv
  where lv.user_id = target_user_id
  for update;

  perform 1
  from public.capture_tokens token
  where token.id = capture_token_id
    and token.user_id = target_user_id
    and token.revoked_at is null
  for update;

  if not found then
    return jsonb_build_object('applied', false, 'errorCode', 'invalid-token');
  end if;

  select processed.result into existing_result
  from public.capture_processed_requests processed
  where processed.token_id = capture_token_id
    and processed.request_id = capture_request_id;

  if found then
    return existing_result || jsonb_build_object('duplicate', true);
  end if;

  insert into public.capture_rate_limits (token_id, bucket_start, request_count)
  values (capture_token_id, current_bucket, 1)
  on conflict (token_id, bucket_start)
  do update set request_count = public.capture_rate_limits.request_count + 1
  returning request_count into current_count;

  if current_count > 60 then
    return jsonb_build_object('applied', false, 'errorCode', 'rate-limit');
  end if;

  if draft->>'type' not in ('income', 'expense') then
    raise exception 'Invalid TapTrack capture type';
  end if;
  if coalesce((draft->>'amount')::numeric, 0) <= 0 then
    raise exception 'Invalid TapTrack capture amount';
  end if;
  if draft->>'currency' !~ '^[A-Z]{3}$' then
    raise exception 'Invalid TapTrack capture currency';
  end if;
  if draft->>'method' not in ('cash', 'card') then
    raise exception 'Invalid TapTrack capture method';
  end if;
  if nullif(btrim(draft->>'title'), '') is null then
    raise exception 'Invalid TapTrack capture title';
  end if;
  if nullif(btrim(draft->>'category_id'), '') is null then
    raise exception 'Invalid TapTrack capture category';
  end if;

  if not exists (
    select 1 from public.settings s
    where s.user_id = target_user_id
      and s.id = 'default'
      and s.setup_completed = true
      and s.deleted_at is null
  ) then
    return jsonb_build_object('applied', false, 'errorCode', 'ledger-not-ready');
  end if;

  select c.name into category_name
  from public.categories c
  where c.user_id = target_user_id
    and c.id = draft->>'category_id'
    and c.type = draft->>'type'
    and c.deleted_at is null
  limit 1;

  if category_name is null then
    return jsonb_build_object('applied', false, 'errorCode', 'invalid-category');
  end if;

  available_amount := public.taptrack_calculated_balance(target_user_id, draft->>'currency', draft->>'method');
  if draft->>'type' = 'expense' and available_amount - (draft->>'amount')::numeric < 0 then
    return jsonb_build_object('applied', false, 'errorCode', 'insufficient-balance', 'currency', draft->>'currency', 'method', draft->>'method', 'availableAmount', available_amount);
  end if;

  insert into public.transactions (
    user_id, id, type, amount, currency, title, category_id, method, date,
    note, recurring_source_id, created_at, updated_at, occurred_at, deleted_at
  ) values (
    target_user_id, row_id, draft->>'type', (draft->>'amount')::numeric,
    draft->>'currency', btrim(draft->>'title'), draft->>'category_id',
    draft->>'method', ledger_date, nullif(btrim(draft->>'note'), ''), null,
    now_at, now_at, now_at, null
  );

  update public.settings
  set last_used_method = draft->>'method', updated_at = now_at
  where user_id = target_user_id and id = 'default' and deleted_at is null;

  update public.capture_tokens set last_used_at = now_at where id = capture_token_id;

  result_payload := jsonb_build_object(
    'applied', true,
    'duplicate', false,
    'transaction', jsonb_build_object(
      'id', row_id,
      'type', draft->>'type',
      'amount', (draft->>'amount')::numeric,
      'currency', draft->>'currency',
      'title', btrim(draft->>'title'),
      'categoryId', draft->>'category_id',
      'categoryName', category_name,
      'categorySource', coalesce(nullif(draft->>'category_source', ''), 'local'),
      'method', draft->>'method',
      'date', ledger_date
    )
  );

  insert into public.capture_processed_requests (user_id, token_id, request_id, result, processed_at)
  values (target_user_id, capture_token_id, capture_request_id, result_payload, now_at);

  return result_payload;
end;
$$;

revoke all on function public.apply_taptrack_capture(uuid, uuid, uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.apply_taptrack_capture(uuid, uuid, uuid, text, jsonb)
  to service_role;
