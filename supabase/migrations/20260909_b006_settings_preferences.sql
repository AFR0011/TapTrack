-- TT-B006: persist active-currency choices and Smart Categories sub-preferences.
-- This migration is backward-compatible with older clients: if an older client
-- sends a settings record without the new fields, existing values are preserved.

alter table public.settings
  add column if not exists active_currencies text[],
  add column if not exists ai_auto_categorization_enabled boolean not null default true,
  add column if not exists ai_recommend_new_categories_enabled boolean not null default true;

update public.settings
set active_currencies = array[default_currency]
where active_currencies is null or cardinality(active_currencies) = 0;

update public.settings
set active_currencies = array_prepend(default_currency, active_currencies)
where array_position(active_currencies, default_currency) is null;

alter table public.settings
  alter column active_currencies set default array['TRY']::text[],
  alter column active_currencies set not null;

alter table public.settings drop constraint if exists settings_active_currencies_nonempty_check;
alter table public.settings add constraint settings_active_currencies_nonempty_check
  check (cardinality(active_currencies) > 0);

alter table public.settings drop constraint if exists settings_default_currency_active_check;
alter table public.settings add constraint settings_default_currency_active_check
  check (array_position(active_currencies, default_currency) is not null);

-- Keep the prior canonical writer available for all non-settings tables instead
-- of duplicating its large table-by-table implementation in this migration.
do $$
begin
  if to_regprocedure('public.taptrack_upsert_canonical_record_b005(uuid,text,jsonb)') is null then
    if to_regprocedure('public.taptrack_upsert_canonical_record(uuid,text,jsonb)') is null then
      raise exception 'TapTrack canonical writer is missing';
    end if;
    execute 'alter function public.taptrack_upsert_canonical_record(uuid,text,jsonb) rename to taptrack_upsert_canonical_record_b005';
  end if;
end $$;

create or replace function public.taptrack_upsert_canonical_record(
  target_user_id uuid,
  target_table text,
  record jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  resolved_default_currency text;
  resolved_active_currencies text[];
  currency_code text;
begin
  if target_table <> 'settings' then
    perform public.taptrack_upsert_canonical_record_b005(target_user_id, target_table, record);
    return;
  end if;

  resolved_default_currency := upper(record->>'default_currency');
  if resolved_default_currency is null or resolved_default_currency !~ '^[A-Z]{3}$' then
    raise exception 'Invalid TapTrack default currency';
  end if;

  if record ? 'active_currencies' and jsonb_typeof(record->'active_currencies') = 'array' then
    select array_agg(distinct upper(value) order by upper(value))
      into resolved_active_currencies
    from jsonb_array_elements_text(record->'active_currencies');
  end if;

  if resolved_active_currencies is null or cardinality(resolved_active_currencies) = 0 then
    resolved_active_currencies := array[resolved_default_currency];
  end if;

  foreach currency_code in array resolved_active_currencies
  loop
    if currency_code !~ '^[A-Z]{3}$' then
      raise exception 'Invalid TapTrack active currency: %', currency_code;
    end if;
  end loop;

  if array_position(resolved_active_currencies, resolved_default_currency) is null then
    resolved_active_currencies := array_prepend(resolved_default_currency, resolved_active_currencies);
  end if;

  insert into public.settings (
    user_id,
    id,
    default_currency,
    active_currencies,
    last_used_method,
    setup_completed,
    ai_categorization_enabled,
    ai_auto_categorization_enabled,
    ai_recommend_new_categories_enabled,
    dark_mode_enabled,
    last_sync_at,
    created_at,
    updated_at,
    deleted_at
  ) values (
    target_user_id,
    record->>'id',
    resolved_default_currency,
    resolved_active_currencies,
    record->>'last_used_method',
    (record->>'setup_completed')::boolean,
    nullif(record->>'ai_categorization_enabled', '')::boolean,
    coalesce(nullif(record->>'ai_auto_categorization_enabled', '')::boolean, true),
    coalesce(nullif(record->>'ai_recommend_new_categories_enabled', '')::boolean, true),
    nullif(record->>'dark_mode_enabled', '')::boolean,
    nullif(record->>'last_sync_at', '')::timestamptz,
    (record->>'created_at')::timestamptz,
    (record->>'updated_at')::timestamptz,
    null
  )
  on conflict (user_id, id) do update set
    default_currency = excluded.default_currency,
    active_currencies = case
      when record ? 'active_currencies' then excluded.active_currencies
      else public.settings.active_currencies
    end,
    last_used_method = excluded.last_used_method,
    setup_completed = excluded.setup_completed,
    ai_categorization_enabled = excluded.ai_categorization_enabled,
    ai_auto_categorization_enabled = case
      when record ? 'ai_auto_categorization_enabled' then excluded.ai_auto_categorization_enabled
      else public.settings.ai_auto_categorization_enabled
    end,
    ai_recommend_new_categories_enabled = case
      when record ? 'ai_recommend_new_categories_enabled' then excluded.ai_recommend_new_categories_enabled
      else public.settings.ai_recommend_new_categories_enabled
    end,
    dark_mode_enabled = excluded.dark_mode_enabled,
    last_sync_at = excluded.last_sync_at,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at,
    deleted_at = null;
end;
$$;

revoke all on function public.taptrack_upsert_canonical_record(uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.taptrack_upsert_canonical_record(uuid, text, jsonb)
  to service_role;
