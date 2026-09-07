create table if not exists public.ai_categorization_rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  bucket_start timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  primary key (user_id, bucket_start)
);

alter table public.ai_categorization_rate_limits enable row level security;

revoke all on table public.ai_categorization_rate_limits from anon, authenticated;

create or replace function public.consume_ai_categorization_quota(max_requests integer default 30)
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

  return current_count <= greatest(1, max_requests);
end;
$$;

revoke all on function public.consume_ai_categorization_quota(integer) from public, anon;
grant execute on function public.consume_ai_categorization_quota(integer) to authenticated;
