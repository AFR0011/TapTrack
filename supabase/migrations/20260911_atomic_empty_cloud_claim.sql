-- TT-R15: atomically claim and seed an empty cloud ledger.
-- Every protected finance writer takes the per-account ledger_versions row lock first.
-- Holding that same lock while rechecking emptiness and seeding prevents two first
-- devices from both observing an empty account and independently becoming its seed.

create or replace function public.claim_empty_taptrack_ledger(
  target_user_id uuid,
  backup jsonb
)
returns table(claimed boolean, revision bigint, generation uuid)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  current_revision bigint;
  current_generation uuid;
  has_active_data boolean;
  table_name text;
  item jsonb;
begin
  if backup is null or jsonb_typeof(backup) <> 'object' then
    raise exception 'Invalid TapTrack initial ledger backup';
  end if;

  insert into public.ledger_versions (user_id)
  values (target_user_id)
  on conflict (user_id) do nothing;

  select lv.revision, lv.generation
    into current_revision, current_generation
  from public.ledger_versions lv
  where lv.user_id = target_user_id
  for update;

  -- Match the canonical lock order used by account replacement. The version-row
  -- lock serializes protected writers; the table locks also close the door on
  -- any privileged writer that does not participate in the client protocol.
  lock table public.transactions in share row exclusive mode;
  lock table public.balance_checkpoints in share row exclusive mode;
  lock table public.categories in share row exclusive mode;
  lock table public.monthly_budgets in share row exclusive mode;
  lock table public.category_budgets in share row exclusive mode;
  lock table public.recurring_transactions in share row exclusive mode;
  lock table public.conversions in share row exclusive mode;
  lock table public.settings in share row exclusive mode;

  select
    exists(select 1 from public.transactions where user_id = target_user_id and deleted_at is null)
    or exists(select 1 from public.balance_checkpoints where user_id = target_user_id and deleted_at is null)
    or exists(select 1 from public.categories where user_id = target_user_id and deleted_at is null)
    or exists(select 1 from public.monthly_budgets where user_id = target_user_id and deleted_at is null)
    or exists(select 1 from public.category_budgets where user_id = target_user_id and deleted_at is null)
    or exists(select 1 from public.recurring_transactions where user_id = target_user_id and deleted_at is null)
    or exists(select 1 from public.conversions where user_id = target_user_id and deleted_at is null)
    or exists(select 1 from public.settings where user_id = target_user_id and deleted_at is null)
    into has_active_data;

  if has_active_data then
    return query select false, current_revision, current_generation;
    return;
  end if;

  foreach table_name in array array[
    'transactions', 'balance_checkpoints', 'categories', 'monthly_budgets',
    'category_budgets', 'recurring_transactions', 'conversions', 'settings'
  ]
  loop
    for item in
      select value
      from jsonb_array_elements(coalesce(backup->table_name, '[]'::jsonb))
    loop
      perform public.taptrack_upsert_canonical_record(target_user_id, table_name, item);
    end loop;
  end loop;

  return query select true, current_revision, current_generation;
end;
$$;

revoke all on function public.claim_empty_taptrack_ledger(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.claim_empty_taptrack_ledger(uuid, jsonb)
  to service_role;
