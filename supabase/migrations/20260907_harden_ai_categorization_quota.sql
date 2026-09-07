drop function if exists public.consume_ai_categorization_quota(integer);

create or replace function public.consume_ai_categorization_quota()
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  current_bucket timestamptz := date_trunc('minute', now());
  current_count integer;
begin
  if current_user_id is null then
    return false;
  end if;

  insert into public.ai_categorization_rate_limits (user_id, bucket_start, request_count)
  values (current_user_id, current_bucket, 1)
  on conflict (user_id, bucket_start)
  do update set request_count = public.ai_categorization_rate_limits.request_count + 1
  returning request_count into current_count;

  return current_count <= 30;
end;
$$;

revoke all on function public.consume_ai_categorization_quota() from public, anon;
grant execute on function public.consume_ai_categorization_quota() to authenticated;
