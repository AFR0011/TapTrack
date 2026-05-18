-- TapTrack local-first sync schema for Supabase
-- Run this in the Supabase SQL editor, or through `supabase db push` if you use the CLI.
-- Design notes:
--   - Every mirrored table is scoped by (user_id, id), not id alone.
--   - RLS allows each authenticated user to access only their own rows.
--   - sync_tombstones makes deletes visible to other devices.

create extension if not exists pgcrypto;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.transactions (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  type text not null check (type in ('income', 'expense')),
  amount numeric not null default 0,
  currency text not null check (currency in ('TRY', 'USD', 'EUR')),
  title text not null,
  category_id text not null,
  method text not null check (method in ('cash', 'card')),
  date date not null,
  note text,
  recurring_source_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.balances (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  currency text not null check (currency in ('TRY', 'USD', 'EUR')),
  method text not null check (method in ('cash', 'card')),
  amount numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.categories (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  name text not null,
  icon text,
  color text,
  is_default boolean not null default false,
  type text not null check (type in ('income', 'expense')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.monthly_budgets (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  month text not null,
  total_budget numeric not null default 0,
  rollover_from_previous_month numeric not null default 0,
  currency text not null default 'TRY' check (currency in ('TRY')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.category_budgets (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  month text not null,
  category_id text not null,
  amount numeric not null default 0,
  currency text not null default 'TRY' check (currency in ('TRY')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.recurring_transactions (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  type text not null check (type in ('income', 'expense')),
  amount numeric not null default 0,
  currency text not null check (currency in ('TRY', 'USD', 'EUR')),
  title text not null,
  category_id text not null,
  method text not null check (method in ('cash', 'card')),
  frequency text not null check (frequency in ('daily', 'weekly', 'monthly', 'yearly')),
  start_date date not null,
  end_date date,
  next_run_date date not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.conversions (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  from_currency text not null check (from_currency in ('TRY', 'USD', 'EUR')),
  to_currency text not null check (to_currency in ('TRY', 'USD', 'EUR')),
  from_method text not null check (from_method in ('cash', 'card')),
  to_method text not null check (to_method in ('cash', 'card')),
  from_amount numeric not null default 0,
  to_amount numeric not null default 0,
  date date not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.settings (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  default_currency text not null default 'TRY' check (default_currency in ('TRY')),
  last_used_method text not null default 'card' check (last_used_method in ('cash', 'card')),
  setup_completed boolean not null default false,
  ai_categorization_enabled boolean,
  dark_mode_enabled boolean,
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.sync_tombstones (
  user_id uuid not null references auth.users(id) on delete cascade,
  table_name text not null,
  record_id text not null,
  deleted_at timestamptz not null default now(),
  primary key (user_id, table_name, record_id)
);

-- Existing projects may already have tables whose primary key is only id.
-- The sync client uses onConflict: 'user_id,id', so these unique indexes are
-- required even when the tables were created before this migration existed.
create unique index if not exists transactions_user_id_id_uq on public.transactions (user_id, id);
create unique index if not exists balances_user_id_id_uq on public.balances (user_id, id);
create unique index if not exists categories_user_id_id_uq on public.categories (user_id, id);
create unique index if not exists monthly_budgets_user_id_id_uq on public.monthly_budgets (user_id, id);
create unique index if not exists category_budgets_user_id_id_uq on public.category_budgets (user_id, id);
create unique index if not exists recurring_transactions_user_id_id_uq on public.recurring_transactions (user_id, id);
create unique index if not exists conversions_user_id_id_uq on public.conversions (user_id, id);
create unique index if not exists settings_user_id_id_uq on public.settings (user_id, id);

create index if not exists transactions_user_updated_idx on public.transactions (user_id, updated_at);
create index if not exists balances_user_updated_idx on public.balances (user_id, updated_at);
create index if not exists categories_user_updated_idx on public.categories (user_id, updated_at);
create index if not exists monthly_budgets_user_updated_idx on public.monthly_budgets (user_id, updated_at);
create index if not exists category_budgets_user_updated_idx on public.category_budgets (user_id, updated_at);
create index if not exists recurring_transactions_user_updated_idx on public.recurring_transactions (user_id, updated_at);
create index if not exists conversions_user_updated_idx on public.conversions (user_id, updated_at);
create index if not exists settings_user_updated_idx on public.settings (user_id, updated_at);
create index if not exists sync_tombstones_user_deleted_idx on public.sync_tombstones (user_id, deleted_at);

-- Attach updated_at triggers. DROP first keeps reruns idempotent.
do $$
declare
  table_name text;
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
    execute format('drop trigger if exists touch_%I_updated_at on public.%I', table_name, table_name);
    execute format(
      'create trigger touch_%I_updated_at before update on public.%I for each row execute function public.touch_updated_at()',
      table_name,
      table_name
    );
  end loop;
end $$;

alter table public.transactions enable row level security;
alter table public.balances enable row level security;
alter table public.categories enable row level security;
alter table public.monthly_budgets enable row level security;
alter table public.category_budgets enable row level security;
alter table public.recurring_transactions enable row level security;
alter table public.conversions enable row level security;
alter table public.settings enable row level security;
alter table public.sync_tombstones enable row level security;

-- Recreate simple owner-only policies idempotently.
do $$
declare
  table_name text;
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
    'sync_tombstones'
  ]
  loop
    execute format('drop policy if exists %I_owner_select on public.%I', table_name, table_name);
    execute format('drop policy if exists %I_owner_insert on public.%I', table_name, table_name);
    execute format('drop policy if exists %I_owner_update on public.%I', table_name, table_name);
    execute format('drop policy if exists %I_owner_delete on public.%I', table_name, table_name);

    execute format(
      'create policy %I_owner_select on public.%I for select using (auth.uid() = user_id)',
      table_name,
      table_name
    );
    execute format(
      'create policy %I_owner_insert on public.%I for insert with check (auth.uid() = user_id)',
      table_name,
      table_name
    );
    execute format(
      'create policy %I_owner_update on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      table_name,
      table_name
    );
    execute format(
      'create policy %I_owner_delete on public.%I for delete using (auth.uid() = user_id)',
      table_name,
      table_name
    );
  end loop;
end $$;
