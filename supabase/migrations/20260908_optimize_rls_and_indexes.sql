-- Post-release database cleanup: preserve policy semantics while avoiding
-- per-row auth.uid() evaluation, and remove unique indexes that duplicate
-- identical primary-key indexes.

alter policy transactions_owner_select on public.transactions
  using ((select auth.uid()) = user_id);
alter policy balances_owner_select on public.balances
  using ((select auth.uid()) = user_id);
alter policy balance_checkpoints_owner_select on public.balance_checkpoints
  using ((select auth.uid()) = user_id);
alter policy categories_owner_select on public.categories
  using ((select auth.uid()) = user_id);
alter policy monthly_budgets_owner_select on public.monthly_budgets
  using ((select auth.uid()) = user_id);
alter policy category_budgets_owner_select on public.category_budgets
  using ((select auth.uid()) = user_id);
alter policy recurring_transactions_owner_select on public.recurring_transactions
  using ((select auth.uid()) = user_id);
alter policy conversions_owner_select on public.conversions
  using ((select auth.uid()) = user_id);
alter policy settings_owner_select on public.settings
  using ((select auth.uid()) = user_id);

alter policy sync_tombstones_owner_select on public.sync_tombstones
  using ((select auth.uid()) = user_id);
alter policy sync_tombstones_owner_insert on public.sync_tombstones
  with check ((select auth.uid()) = user_id);
alter policy sync_tombstones_owner_update on public.sync_tombstones
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
alter policy sync_tombstones_owner_delete on public.sync_tombstones
  using ((select auth.uid()) = user_id);

alter policy ledger_versions_owner_select on public.ledger_versions
  using ((select auth.uid()) = user_id);
alter policy ledger_versions_owner_insert on public.ledger_versions
  with check ((select auth.uid()) = user_id and revision = 1);

drop index if exists public.balance_checkpoints_user_id_id_uq;
drop index if exists public.balances_user_id_id_uq;
drop index if exists public.categories_user_id_id_uq;
drop index if exists public.category_budgets_user_id_id_uq;
drop index if exists public.conversions_user_id_id_uq;
drop index if exists public.monthly_budgets_user_id_id_uq;
drop index if exists public.recurring_transactions_user_id_id_uq;
drop index if exists public.settings_user_id_id_uq;
drop index if exists public.transactions_user_id_id_uq;
