-- Account-wide restore generation + server-side sync mutation primitives.
-- Safe to apply before the remediation client is deployed: existing owner RLS
-- mutation policies remain in place until the coordinated enforcement migration.

create table if not exists public.ledger_versions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 1 check (revision >= 1),
  generation uuid not null default pg_catalog.gen_random_uuid(),
  updated_at timestamptz not null default now()
);

alter table public.ledger_versions enable row level security;

drop policy if exists ledger_versions_owner_select on public.ledger_versions;
drop policy if exists ledger_versions_owner_insert on public.ledger_versions;
drop policy if exists ledger_versions_owner_update on public.ledger_versions;
drop policy if exists ledger_versions_owner_delete on public.ledger_versions;

create policy ledger_versions_owner_select
  on public.ledger_versions for select
  using (auth.uid() = user_id);
create policy ledger_versions_owner_insert
  on public.ledger_versions for insert
  with check (auth.uid() = user_id and revision = 1);

insert into public.ledger_versions (user_id)
select id from auth.users
on conflict (user_id) do nothing;

create or replace function public.get_or_create_ledger_version(target_user_id uuid)
returns table(revision bigint, generation uuid, updated_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  insert into public.ledger_versions (user_id)
  values (target_user_id)
  on conflict (user_id) do nothing;

  return query
  select lv.revision, lv.generation, lv.updated_at
  from public.ledger_versions lv
  where lv.user_id = target_user_id;
end;
$$;

revoke all on function public.get_or_create_ledger_version(uuid) from public, anon, authenticated;
grant execute on function public.get_or_create_ledger_version(uuid) to service_role;

create or replace function public.taptrack_upsert_canonical_record(
  target_user_id uuid,
  target_table text,
  record jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  case target_table
    when 'transactions' then
      insert into public.transactions (
        user_id, id, type, amount, currency, title, category_id, method, date,
        note, recurring_source_id, created_at, updated_at, occurred_at, deleted_at
      ) values (
        target_user_id,
        record->>'id',
        record->>'type',
        (record->>'amount')::numeric,
        record->>'currency',
        record->>'title',
        record->>'category_id',
        record->>'method',
        record->>'date',
        record->>'note',
        record->>'recurring_source_id',
        (record->>'created_at')::timestamptz,
        (record->>'updated_at')::timestamptz,
        nullif(record->>'occurred_at', '')::timestamptz,
        null
      )
      on conflict (user_id, id) do update set
        type = excluded.type,
        amount = excluded.amount,
        currency = excluded.currency,
        title = excluded.title,
        category_id = excluded.category_id,
        method = excluded.method,
        date = excluded.date,
        note = excluded.note,
        recurring_source_id = excluded.recurring_source_id,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        occurred_at = excluded.occurred_at,
        deleted_at = null;

    when 'balance_checkpoints' then
      insert into public.balance_checkpoints (
        user_id, id, balance_id, currency, method, kind, observed_amount,
        delta_amount, date, effective_at, month, created_at, updated_at, deleted_at
      ) values (
        target_user_id,
        record->>'id',
        record->>'balance_id',
        record->>'currency',
        record->>'method',
        record->>'kind',
        (record->>'observed_amount')::numeric,
        (record->>'delta_amount')::numeric,
        record->>'date',
        (record->>'effective_at')::timestamptz,
        record->>'month',
        (record->>'created_at')::timestamptz,
        (record->>'updated_at')::timestamptz,
        null
      )
      on conflict (user_id, id) do update set
        balance_id = excluded.balance_id,
        currency = excluded.currency,
        method = excluded.method,
        kind = excluded.kind,
        observed_amount = excluded.observed_amount,
        delta_amount = excluded.delta_amount,
        date = excluded.date,
        effective_at = excluded.effective_at,
        month = excluded.month,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        deleted_at = null;

    when 'categories' then
      insert into public.categories (
        user_id, id, name, icon, color, is_default, type, created_at, updated_at, deleted_at
      ) values (
        target_user_id,
        record->>'id',
        record->>'name',
        record->>'icon',
        record->>'color',
        (record->>'is_default')::boolean,
        record->>'type',
        (record->>'created_at')::timestamptz,
        (record->>'updated_at')::timestamptz,
        null
      )
      on conflict (user_id, id) do update set
        name = excluded.name,
        icon = excluded.icon,
        color = excluded.color,
        is_default = excluded.is_default,
        type = excluded.type,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        deleted_at = null;

    when 'monthly_budgets' then
      insert into public.monthly_budgets (
        user_id, id, month, total_budget, rollover_from_previous_month,
        currency, created_at, updated_at, deleted_at
      ) values (
        target_user_id,
        record->>'id',
        record->>'month',
        (record->>'total_budget')::numeric,
        (record->>'rollover_from_previous_month')::numeric,
        record->>'currency',
        (record->>'created_at')::timestamptz,
        (record->>'updated_at')::timestamptz,
        null
      )
      on conflict (user_id, id) do update set
        month = excluded.month,
        total_budget = excluded.total_budget,
        rollover_from_previous_month = excluded.rollover_from_previous_month,
        currency = excluded.currency,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        deleted_at = null;

    when 'category_budgets' then
      insert into public.category_budgets (
        user_id, id, month, category_id, amount, currency, created_at, updated_at, deleted_at
      ) values (
        target_user_id,
        record->>'id',
        record->>'month',
        record->>'category_id',
        (record->>'amount')::numeric,
        record->>'currency',
        (record->>'created_at')::timestamptz,
        (record->>'updated_at')::timestamptz,
        null
      )
      on conflict (user_id, id) do update set
        month = excluded.month,
        category_id = excluded.category_id,
        amount = excluded.amount,
        currency = excluded.currency,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        deleted_at = null;

    when 'recurring_transactions' then
      insert into public.recurring_transactions (
        user_id, id, type, amount, currency, title, category_id, method, frequency,
        start_date, end_date, next_run_date, is_active, created_at, updated_at, deleted_at
      ) values (
        target_user_id,
        record->>'id',
        record->>'type',
        (record->>'amount')::numeric,
        record->>'currency',
        record->>'title',
        record->>'category_id',
        record->>'method',
        record->>'frequency',
        record->>'start_date',
        nullif(record->>'end_date', ''),
        record->>'next_run_date',
        (record->>'is_active')::boolean,
        (record->>'created_at')::timestamptz,
        (record->>'updated_at')::timestamptz,
        null
      )
      on conflict (user_id, id) do update set
        type = excluded.type,
        amount = excluded.amount,
        currency = excluded.currency,
        title = excluded.title,
        category_id = excluded.category_id,
        method = excluded.method,
        frequency = excluded.frequency,
        start_date = excluded.start_date,
        end_date = excluded.end_date,
        next_run_date = excluded.next_run_date,
        is_active = excluded.is_active,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        deleted_at = null;

    when 'conversions' then
      insert into public.conversions (
        user_id, id, from_currency, to_currency, from_method, to_method,
        from_amount, to_amount, date, note, created_at, updated_at, occurred_at, deleted_at
      ) values (
        target_user_id,
        record->>'id',
        record->>'from_currency',
        record->>'to_currency',
        record->>'from_method',
        record->>'to_method',
        (record->>'from_amount')::numeric,
        (record->>'to_amount')::numeric,
        record->>'date',
        record->>'note',
        (record->>'created_at')::timestamptz,
        coalesce(nullif(record->>'updated_at', '')::timestamptz, (record->>'created_at')::timestamptz),
        nullif(record->>'occurred_at', '')::timestamptz,
        null
      )
      on conflict (user_id, id) do update set
        from_currency = excluded.from_currency,
        to_currency = excluded.to_currency,
        from_method = excluded.from_method,
        to_method = excluded.to_method,
        from_amount = excluded.from_amount,
        to_amount = excluded.to_amount,
        date = excluded.date,
        note = excluded.note,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        occurred_at = excluded.occurred_at,
        deleted_at = null;

    when 'settings' then
      insert into public.settings (
        user_id, id, default_currency, last_used_method, setup_completed,
        ai_categorization_enabled, dark_mode_enabled, last_sync_at,
        created_at, updated_at, deleted_at
      ) values (
        target_user_id,
        record->>'id',
        record->>'default_currency',
        record->>'last_used_method',
        (record->>'setup_completed')::boolean,
        nullif(record->>'ai_categorization_enabled', '')::boolean,
        nullif(record->>'dark_mode_enabled', '')::boolean,
        nullif(record->>'last_sync_at', '')::timestamptz,
        (record->>'created_at')::timestamptz,
        (record->>'updated_at')::timestamptz,
        null
      )
      on conflict (user_id, id) do update set
        default_currency = excluded.default_currency,
        last_used_method = excluded.last_used_method,
        setup_completed = excluded.setup_completed,
        ai_categorization_enabled = excluded.ai_categorization_enabled,
        dark_mode_enabled = excluded.dark_mode_enabled,
        last_sync_at = excluded.last_sync_at,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        deleted_at = null;

    else
      raise exception 'Unsupported TapTrack canonical table: %', target_table;
  end case;
end;
$$;

revoke all on function public.taptrack_upsert_canonical_record(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.taptrack_upsert_canonical_record(uuid, text, jsonb) to service_role;

create or replace function public.apply_taptrack_sync_operation(
  target_user_id uuid,
  expected_revision bigint,
  expected_generation uuid,
  target_table text,
  operation text,
  record_id text,
  record jsonb default null
)
returns table(applied boolean, revision bigint, generation uuid)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  current_revision bigint;
  current_generation uuid;
begin
  insert into public.ledger_versions (user_id)
  values (target_user_id)
  on conflict (user_id) do nothing;

  select lv.revision, lv.generation
    into current_revision, current_generation
  from public.ledger_versions lv
  where lv.user_id = target_user_id
  for update;

  if current_revision <> expected_revision or current_generation <> expected_generation then
    return query select false, current_revision, current_generation;
    return;
  end if;

  if target_table not in (
    'transactions', 'balance_checkpoints', 'categories', 'monthly_budgets',
    'category_budgets', 'recurring_transactions', 'conversions', 'settings'
  ) then
    raise exception 'Unsupported TapTrack canonical table: %', target_table;
  end if;

  if operation = 'upsert' then
    if record is null or record->>'id' is distinct from record_id then
      raise exception 'Invalid TapTrack upsert record';
    end if;
    perform public.taptrack_upsert_canonical_record(target_user_id, target_table, record);
  elsif operation = 'delete' then
    execute format(
      'update public.%I set deleted_at = now() where user_id = $1 and id = $2',
      target_table
    ) using target_user_id, record_id;
  else
    raise exception 'Unsupported TapTrack sync operation: %', operation;
  end if;

  return query select true, current_revision, current_generation;
end;
$$;

revoke all on function public.apply_taptrack_sync_operation(uuid, bigint, uuid, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.apply_taptrack_sync_operation(uuid, bigint, uuid, text, text, text, jsonb) to service_role;

create or replace function public.replace_taptrack_account_ledger(
  target_user_id uuid,
  backup jsonb
)
returns table(revision bigint, generation uuid)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  new_revision bigint;
  new_generation uuid;
  item jsonb;
  table_name text;
  restored_at timestamptz := now();
begin
  -- Acquire the account generation row first. Protected sync mutations take the
  -- same lock before checking their expected generation, so a write either
  -- commits entirely before this restore or observes the new generation after it.
  insert into public.ledger_versions (user_id, revision, generation, updated_at)
  values (target_user_id, 2, pg_catalog.gen_random_uuid(), restored_at)
  on conflict (user_id) do update set
    revision = public.ledger_versions.revision + 1,
    generation = pg_catalog.gen_random_uuid(),
    updated_at = restored_at
  returning public.ledger_versions.revision, public.ledger_versions.generation
    into new_revision, new_generation;

  -- Keep canonical table locks while the legacy direct-write policies still
  -- coexist with production main. The later enforcement migration can remove
  -- that bypass once every deployed writer uses the protected operation route.
  lock table public.transactions in share row exclusive mode;
  lock table public.balance_checkpoints in share row exclusive mode;
  lock table public.categories in share row exclusive mode;
  lock table public.monthly_budgets in share row exclusive mode;
  lock table public.category_budgets in share row exclusive mode;
  lock table public.recurring_transactions in share row exclusive mode;
  lock table public.conversions in share row exclusive mode;
  lock table public.settings in share row exclusive mode;

  update public.transactions set deleted_at = restored_at where user_id = target_user_id;
  update public.balance_checkpoints set deleted_at = restored_at where user_id = target_user_id;
  update public.categories set deleted_at = restored_at where user_id = target_user_id;
  update public.monthly_budgets set deleted_at = restored_at where user_id = target_user_id;
  update public.category_budgets set deleted_at = restored_at where user_id = target_user_id;
  update public.recurring_transactions set deleted_at = restored_at where user_id = target_user_id;
  update public.conversions set deleted_at = restored_at where user_id = target_user_id;
  update public.settings set deleted_at = restored_at where user_id = target_user_id;

  foreach table_name in array array[
    'transactions', 'balance_checkpoints', 'categories', 'monthly_budgets',
    'category_budgets', 'recurring_transactions', 'conversions', 'settings'
  ]
  loop
    for item in
      select value from jsonb_array_elements(coalesce(backup->table_name, '[]'::jsonb))
    loop
      perform public.taptrack_upsert_canonical_record(target_user_id, table_name, item);
    end loop;
  end loop;

  return query select new_revision, new_generation;
end;
$$;

revoke all on function public.replace_taptrack_account_ledger(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.replace_taptrack_account_ledger(uuid, jsonb) to service_role;
