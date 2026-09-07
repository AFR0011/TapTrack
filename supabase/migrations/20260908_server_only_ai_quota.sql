-- Keep AI quota accounting server-only. The application route authenticates the
-- caller first, then consumes quota with the service-role client. Browser users
-- must not be able to invoke this SECURITY DEFINER function directly.

drop function if exists public.consume_ai_categorization_quota();

create or replace function public.consume_ai_categorization_quota(target_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  current_bucket timestamptz := date_trunc('minute', now());
  current_count integer;
begin
  if target_user_id is null then
    return false;
  end if;

  insert into public.ai_categorization_rate_limits (user_id, bucket_start, request_count)
  values (target_user_id, current_bucket, 1)
  on conflict (user_id, bucket_start)
  do update
    set request_count = public.ai_categorization_rate_limits.request_count + 1
  returning request_count into current_count;

  return current_count <= 30;
end;
$$;

revoke all on function public.consume_ai_categorization_quota(uuid)
  from public, anon, authenticated;
grant execute on function public.consume_ai_categorization_quota(uuid)
  to service_role;

-- RLS remains enabled even though table grants are already revoked. An explicit
-- deny policy documents and enforces that no browser role may access quota rows.
drop policy if exists ai_categorization_rate_limits_no_client_access
  on public.ai_categorization_rate_limits;
create policy ai_categorization_rate_limits_no_client_access
  on public.ai_categorization_rate_limits
  for all
  to anon, authenticated
  using (false)
  with check (false);
