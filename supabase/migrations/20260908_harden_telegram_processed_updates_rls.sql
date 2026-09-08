-- Make the server-only intent explicit for security tooling as well as grants.
-- service_role bypasses RLS and remains the only role granted table privileges.

drop policy if exists telegram_processed_updates_deny_browser
  on public.telegram_processed_updates;

create policy telegram_processed_updates_deny_browser
  on public.telegram_processed_updates
  for all
  to anon, authenticated
  using (false)
  with check (false);
