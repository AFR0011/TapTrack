-- TapTrack canonical-ledger multi-device sync migration.
-- Safe for the legacy production schema and for databases created from the
-- earlier local-first migration.

create extension if not exists pgcrypto;

-- Canonical rows use soft deletes so deletion is one conflict-resolved server
-- write rather than a non-atomic hard delete + tombstone pair.
alter table public.transactions add column if not exists occurred_at timestamptz;
alter table public.transactions add column if not exists deleted_at timestamptz;
alter table public.categories add column if not exists deleted_at timestamptz;
alter table public.monthly_budgets add column if not exists deleted_at timestamptz;
alter table public.category_budgets add column if not exists deleted_at timestamptz;
alter table public.recurring_transactions add column if not exists deleted_at timestamptz;
alter table public.conversions add column if not exists occurred_at timestamptz;
alter table public.conversions add column if not exists deleted_at timestamptz;
alter table public.settings add column if not exists deleted_at timestamptz;

-- Bring the legacy conversion schema forward from one `method` column to
-- explicit source/destination methods. Existing rows preserve their method.
alter table public.conversions add column if not exists from_method text;
alter table public.conversions add column if not exists to_method text;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'conversions'
      and column_name = 'method'
  ) then
    execute 'update public.conversions
             set from_method = coalesce(from_method, method),
                 to_method = coalesce(to_method, method)
             where from_method is null or to_method is null';
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from public.conversions
    where from_method is null or to_method is null
  ) then
    raise exception 'Cannot migrate conversions with missing source/destination method';
  end if;
end $$;

alter table public.conversions alter column from_method set not null;
alter table public.conversions alter column to_method set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.conversions'::regclass
      and conname = 'conversions_from_method_check'
  ) then
    alter table public.conversions
      add constraint conversions_from_method_check check (from_method in ('cash', 'card'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.conversions'::regclass
      and conname = 'conversions_to_method_check'
  ) then
    alter table public.conversions
      add constraint conversions_to_method_check check (to_method in ('cash', 'card'));
  end if;
end $$;

alter table public.conversions drop column if exists method;

-- Settings fields already used by the client but absent from older databases.
alter table public.settings add column if not exists ai_categorization_enabled boolean;
alter table public.settings add column if not exists dark_mode_enabled boolean;
alter table public.settings add column if not exists last_sync_at timestamptz;

-- Absolute opening/reconciliation observations are authoritative balance state.
create table if not exists public.balance_checkpoints (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  balance_id text not null,
  currency text not null check (currency in ('TRY', 'USD', 'EUR')),
  method text not null check (method in ('cash', 'card')),
  kind text not null check (kind in ('opening', 'reconciliation')),
  observed_amount numeric not null,
  delta_amount numeric not null,
  date text not null,
  effective_at timestamptz not null,
  month text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, id)
);

-- Legacy production tables used PRIMARY KEY(id), which prevents deterministic
-- IDs (categories, balances, settings, budgets) from existing for two users.
-- Replace only PKs that are not already (user_id,id), preserving all rows.
do $$
declare
  table_name text;
  pk_name text;
  pk_columns text[];
begin
  foreach table_name in array array[
    'transactions',
    'balances',
    'categories',
    'monthly_budgets',
    'category_budgets',
    'recurring_transactions',
    'conversions',
    'settings',
    'balance_checkpoints'
  ]
  loop
    pk_name := null;
    pk_columns := null;

    select c.conname,
           array_agg(a.attname::text order by key_columns.ordinality)
      into pk_name, pk_columns
    from pg_constraint c
    cross join lateral unnest(c.conkey) with ordinality as key_columns(attnum, ordinality)
    join pg_attribute a
      on a.attrelid = c.conrelid
     and a.attnum = key_columns.attnum
    where c.conrelid = format('public.%I', table_name)::regclass
      and c.contype = 'p'
    group by c.conname;

    if pk_name is null then
      execute format(
        'alter table public.%I add constraint %I primary key (user_id, id)',
        table_name,
        table_name || '_pkey'
      );
    elsif pk_columns is distinct from array['user_id', 'id']::text[] then
      execute format('alter table public.%I drop constraint %I', table_name, pk_name);
      execute format(
        'alter table public.%I add constraint %I primary key (user_id, id)',
        table_name,
        table_name || '_pkey'
      );
    end if;
  end loop;
end $$;

-- Keep explicit upsert targets/indexes available regardless of schema history.
create unique index if not exists transactions_user_id_id_uq on public.transactions (user_id, id);
create unique index if not exists balances_user_id_id_uq on public.balances (user_id, id);
create unique index if not exists categories_user_id_id_uq on public.categories (user_id, id);
create unique index if not exists monthly_budgets_user_id_id_uq on public.monthly_budgets (user_id, id);
create unique index if not exists category_budgets_user_id_id_uq on public.category_budgets (user_id, id);
create unique index if not exists recurring_transactions_user_id_id_uq on public.recurring_transactions (user_id, id);
create unique index if not exists conversions_user_id_id_uq on public.conversions (user_id, id);
create unique index if not exists settings_user_id_id_uq on public.settings (user_id, id);
create unique index if not exists balance_checkpoints_user_id_id_uq on public.balance_checkpoints (user_id, id);

create index if not exists transactions_user_updated_idx on public.transactions (user_id, updated_at);
create index if not exists categories_user_updated_idx on public.categories (user_id, updated_at);
create index if not exists monthly_budgets_user_updated_idx on public.monthly_budgets (user_id, updated_at);
create index if not exists category_budgets_user_updated_idx on public.category_budgets (user_id, updated_at);
create index if not exists recurring_transactions_user_updated_idx on public.recurring_transactions (user_id, updated_at);
create index if not exists conversions_user_updated_idx on public.conversions (user_id, updated_at);
create index if not exists settings_user_updated_idx on public.settings (user_id, updated_at);
create index if not exists balance_checkpoints_user_updated_idx on public.balance_checkpoints (user_id, updated_at);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  table_name text;
  trigger_name text;
begin
  foreach table_name in array array[
    'transactions',
    'categories',
    'monthly_budgets',
    'category_budgets',
    'recurring_transactions',
    'conversions',
    'settings',
    'balance_checkpoints'
  ]
  loop
    trigger_name := 'touch_' || table_name || '_updated_at';
    execute format('drop trigger if exists %I on public.%I', trigger_name, table_name);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.touch_updated_at()',
      trigger_name,
      table_name
    );
  end loop;
end $$;

alter table public.balance_checkpoints enable row level security;

-- Remove redundant older ALL policies. The explicit owner CRUD policies remain.
do $$
declare
  table_name text;
  policy_name text;
begin
  foreach table_name in array array[
    'transactions',
    'balances',
    'categories',
    'monthly_budgets',
    'category_budgets',
    'recurring_transactions',
    'conversions',
    'settings'
  ]
  loop
    policy_name := 'users_' || table_name;
    execute format('drop policy if exists %I on public.%I', policy_name, table_name);
  end loop;
end $$;

drop policy if exists balance_checkpoints_owner_select on public.balance_checkpoints;
drop policy if exists balance_checkpoints_owner_insert on public.balance_checkpoints;
drop policy if exists balance_checkpoints_owner_update on public.balance_checkpoints;
drop policy if exists balance_checkpoints_owner_delete on public.balance_checkpoints;

create policy balance_checkpoints_owner_select
  on public.balance_checkpoints for select
  using (auth.uid() = user_id);
create policy balance_checkpoints_owner_insert
  on public.balance_checkpoints for insert
  with check (auth.uid() = user_id);
create policy balance_checkpoints_owner_update
  on public.balance_checkpoints for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy balance_checkpoints_owner_delete
  on public.balance_checkpoints for delete
  using (auth.uid() = user_id);
