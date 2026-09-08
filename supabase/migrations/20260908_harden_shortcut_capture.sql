-- TT-B003 follow-up hardening for the server-only Quick Capture tables.
-- Explicit deny policies document the browser boundary while service_role
-- continues to access the tables through its server credentials.

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'capture_tokens',
    'capture_processed_requests',
    'capture_rate_limits'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', table_name || '_deny_browser', table_name);
    execute format(
      'create policy %I on public.%I for all to anon, authenticated using (false) with check (false)',
      table_name || '_deny_browser',
      table_name
    );
  end loop;
end $$;

-- Covers the auth.users(user_id) cascade lookup on account deletion. The
-- primary key begins with token_id, so it does not cover this foreign key.
create index if not exists capture_processed_requests_user_idx
  on public.capture_processed_requests (user_id);
