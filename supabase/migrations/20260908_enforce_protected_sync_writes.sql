-- RELEASE-COORDINATED MIGRATION: DO NOT APPLY before the generation-aware
-- server-mediated sync client is deployed to production.
--
-- The forward-compatible ledger_restore_generation migration intentionally
-- leaves these owner mutation policies in place so the current production app
-- continues to work. This migration is the later enforcement switch: browser
-- clients retain owner SELECT access, while all finance mutations must pass
-- through authenticated Next.js routes and service-role-only RPCs.

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'transactions',
    'balances',
    'balance_checkpoints',
    'categories',
    'monthly_budgets',
    'category_budgets',
    'recurring_transactions',
    'conversions',
    'settings'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', table_name || '_owner_insert', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_owner_update', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_owner_delete', table_name);
  end loop;
end $$;

-- ledger_versions deliberately keeps owner SELECT + revision-1 INSERT so a
-- freshly linked browser can initialize/read its immutable first generation.
-- It has no owner UPDATE or DELETE policy; generation rotation remains
-- service-role-only through replace_taptrack_account_ledger().
