from pathlib import Path

path = Path('supabase/migrations/20260908_ledger_restore_generation.sql')
text = path.read_text()

# Supabase installs gen_random_uuid in pg_catalog/extensions, not public.
text = text.replace('public.gen_random_uuid()', 'pg_catalog.gen_random_uuid()')

# Authenticated clients may initialize only the first revision; later rotations
# remain service-role-only through the restore RPC.
text = text.replace(
    "create policy ledger_versions_owner_insert\n  on public.ledger_versions for insert\n  with check (auth.uid() = user_id);",
    "create policy ledger_versions_owner_insert\n  on public.ledger_versions for insert\n  with check (auth.uid() = user_id and revision = 1);",
)

# Live TapTrack schema stores canonical user-selected dates as text. Preserve
# validated YYYY-MM-DD strings rather than round-tripping through SQL date casts.
text = text.replace("(record->>'date')::date,", "record->>'date',")
text = text.replace("(record->>'start_date')::date,", "record->>'start_date',")
text = text.replace("nullif(record->>'end_date', '')::date,", "nullif(record->>'end_date', ''),")
text = text.replace("(record->>'next_run_date')::date,", "record->>'next_run_date',")

# A sync mutation must lock the generation row before deciding that an expected
# generation is current. Otherwise a restore can commit between the check and
# the canonical write, allowing a stale operation to land after the restore.
old_apply = """begin
  select v.revision, v.generation
    into current_revision, current_generation
  from public.get_or_create_ledger_version(target_user_id) v;

  if current_revision <> expected_revision or current_generation <> expected_generation then
"""
new_apply = """begin
  insert into public.ledger_versions (user_id)
  values (target_user_id)
  on conflict (user_id) do nothing;

  select lv.revision, lv.generation
    into current_revision, current_generation
  from public.ledger_versions lv
  where lv.user_id = target_user_id
  for update;

  if current_revision <> expected_revision or current_generation <> expected_generation then
"""
if old_apply not in text:
    raise SystemExit('apply_taptrack_sync_operation generation block not found')
text = text.replace(old_apply, new_apply, 1)

# Lock ordering is ledger-version row first, canonical tables second. New sync
# RPCs take the same order, preventing deadlocks and making restore/write races
# serialize deterministically. Legacy direct table writes are still serialized
# by the table locks while the forward-compatible migration coexists with main.
old_restore = """begin
  -- Serialize restore against current canonical mutations as far as PostgreSQL
  -- can. The generation check in the sync mutation RPC rejects stale clients
  -- once this transaction commits.
  lock table public.transactions in share row exclusive mode;
  lock table public.balance_checkpoints in share row exclusive mode;
  lock table public.categories in share row exclusive mode;
  lock table public.monthly_budgets in share row exclusive mode;
  lock table public.category_budgets in share row exclusive mode;
  lock table public.recurring_transactions in share row exclusive mode;
  lock table public.conversions in share row exclusive mode;
  lock table public.settings in share row exclusive mode;

  insert into public.ledger_versions (user_id, revision, generation, updated_at)
  values (target_user_id, 2, pg_catalog.gen_random_uuid(), restored_at)
  on conflict (user_id) do update set
    revision = public.ledger_versions.revision + 1,
    generation = pg_catalog.gen_random_uuid(),
    updated_at = restored_at
  returning public.ledger_versions.revision, public.ledger_versions.generation
    into new_revision, new_generation;

  update public.transactions set deleted_at = restored_at where user_id = target_user_id;
"""
new_restore = """begin
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
"""
if old_restore not in text:
    raise SystemExit('replace_taptrack_account_ledger lock block not found')
text = text.replace(old_restore, new_restore, 1)

path.write_text(text)
