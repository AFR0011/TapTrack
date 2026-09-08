-- TT-B003: revocable create-only capture tokens and atomic Shortcut writes.
-- This migration adds server-only primitives. It does not expose finance writes
-- to browser roles and is safe to stage before the application routes use it.

create table if not exists public.capture_tokens (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  label text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  check (char_length(label) between 1 and 80),
  check (char_length(token_hash) = 64)
);

create index if not exists capture_tokens_user_created_idx
  on public.capture_tokens (user_id, created_at desc);
create index if not exists capture_tokens_user_active_idx
  on public.capture_tokens (user_id)
  where revoked_at is null;

alter table public.capture_tokens enable row level security;
revoke all on table public.capture_tokens from public, anon, authenticated;
grant select, insert, update, delete on table public.capture_tokens to service_role;

create table if not exists public.capture_processed_requests (
  user_id uuid not null references auth.users(id) on delete cascade,
  token_id uuid not null references public.capture_tokens(id) on delete cascade,
  request_id uuid not null,
  result jsonb not null,
  processed_at timestamptz not null default now(),
  primary key (token_id, request_id)
);

alter table public.capture_processed_requests enable row level security;
revoke all on table public.capture_processed_requests from public, anon, authenticated;
grant select, insert, update, delete on table public.capture_processed_requests to service_role;

create table if not exists public.capture_rate_limits (
  token_id uuid not null references public.capture_tokens(id) on delete cascade,
  bucket_start timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  primary key (token_id, bucket_start)
);

alter table public.capture_rate_limits enable row level security;
revoke all on table public.capture_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on table public.capture_rate_limits to service_role;

create or replace function public.apply_taptrack_capture(
  target_user_id uuid,
  capture_token_id uuid,
  request_id uuid,
  ledger_date text,
  draft jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  existing_result jsonb;
  now_at timestamptz := now();
  current_bucket timestamptz := date_trunc('minute', now());
  current_count integer;
  available_amount numeric;
  row_id text := 'capture-' || request_id::text;
  category_name text;
  result_payload jsonb;
begin
  if ledger_date !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'Invalid TapTrack capture date';
  end if;
  if draft is null or jsonb_typeof(draft) <> 'object' then
    raise exception 'Invalid TapTrack capture draft';
  end if;

  -- Serialize with protected sync, restore, Telegram, and other capture writes.
  insert into public.ledger_versions (user_id)
  values (target_user_id)
  on conflict (user_id) do nothing;

  perform 1
  from public.ledger_versions lv
  where lv.user_id = target_user_id
  for update;

  perform 1
  from public.capture_tokens token
  where token.id = capture_token_id
    and token.user_id = target_user_id
    and token.revoked_at is null
  for update;

  if not found then
    return jsonb_build_object('applied', false, 'errorCode', 'invalid-token');
  end if;

  select processed.result
    into existing_result
  from public.capture_processed_requests processed
  where processed.token_id = capture_token_id
    and processed.request_id = apply_taptrack_capture.request_id;

  if found then
    return existing_result || jsonb_build_object('duplicate', true);
  end if;

  insert into public.capture_rate_limits (token_id, bucket_start, request_count)
  values (capture_token_id, current_bucket, 1)
  on conflict (token_id, bucket_start)
  do update set request_count = public.capture_rate_limits.request_count + 1
  returning request_count into current_count;

  if current_count > 60 then
    return jsonb_build_object('applied', false, 'errorCode', 'rate-limit');
  end if;

  if draft->>'type' not in ('income', 'expense') then
    raise exception 'Invalid TapTrack capture type';
  end if;
  if coalesce((draft->>'amount')::numeric, 0) <= 0 then
    raise exception 'Invalid TapTrack capture amount';
  end if;
  if draft->>'currency' not in ('TRY', 'USD', 'EUR') then
    raise exception 'Invalid TapTrack capture currency';
  end if;
  if draft->>'method' not in ('cash', 'card') then
    raise exception 'Invalid TapTrack capture method';
  end if;
  if nullif(btrim(draft->>'title'), '') is null then
    raise exception 'Invalid TapTrack capture title';
  end if;
  if nullif(btrim(draft->>'category_id'), '') is null then
    raise exception 'Invalid TapTrack capture category';
  end if;

  if not exists (
    select 1
    from public.settings s
    where s.user_id = target_user_id
      and s.id = 'default'
      and s.setup_completed = true
      and s.deleted_at is null
  ) then
    return jsonb_build_object('applied', false, 'errorCode', 'ledger-not-ready');
  end if;

  select c.name
    into category_name
  from public.categories c
  where c.user_id = target_user_id
    and c.id = draft->>'category_id'
    and c.type = draft->>'type'
    and c.deleted_at is null
  limit 1;

  if category_name is null then
    return jsonb_build_object('applied', false, 'errorCode', 'invalid-category');
  end if;

  available_amount := public.taptrack_calculated_balance(
    target_user_id,
    draft->>'currency',
    draft->>'method'
  );

  if draft->>'type' = 'expense'
     and available_amount - (draft->>'amount')::numeric < 0 then
    return jsonb_build_object(
      'applied', false,
      'errorCode', 'insufficient-balance',
      'currency', draft->>'currency',
      'method', draft->>'method',
      'availableAmount', available_amount
    );
  end if;

  insert into public.transactions (
    user_id, id, type, amount, currency, title, category_id, method, date,
    note, recurring_source_id, created_at, updated_at, occurred_at, deleted_at
  ) values (
    target_user_id,
    row_id,
    draft->>'type',
    (draft->>'amount')::numeric,
    draft->>'currency',
    btrim(draft->>'title'),
    draft->>'category_id',
    draft->>'method',
    ledger_date,
    nullif(btrim(draft->>'note'), ''),
    null,
    now_at,
    now_at,
    now_at,
    null
  );

  update public.settings
  set last_used_method = draft->>'method',
      updated_at = now_at
  where user_id = target_user_id
    and id = 'default'
    and deleted_at is null;

  update public.capture_tokens
  set last_used_at = now_at
  where id = capture_token_id;

  result_payload := jsonb_build_object(
    'applied', true,
    'duplicate', false,
    'transaction', jsonb_build_object(
      'id', row_id,
      'type', draft->>'type',
      'amount', (draft->>'amount')::numeric,
      'currency', draft->>'currency',
      'title', btrim(draft->>'title'),
      'categoryId', draft->>'category_id',
      'categoryName', category_name,
      'categorySource', coalesce(nullif(draft->>'category_source', ''), 'local'),
      'method', draft->>'method',
      'date', ledger_date
    )
  );

  insert into public.capture_processed_requests (
    user_id, token_id, request_id, result, processed_at
  ) values (
    target_user_id, capture_token_id, request_id, result_payload, now_at
  );

  return result_payload;
end;
$$;

revoke all on function public.apply_taptrack_capture(uuid, uuid, uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.apply_taptrack_capture(uuid, uuid, uuid, text, jsonb)
  to service_role;
