-- Preserve legacy current balances as canonical opening checkpoints before the
-- new client stops reading remote `balances` rows.
insert into public.balance_checkpoints (
  user_id, id, balance_id, currency, method, kind,
  observed_amount, delta_amount, date, effective_at, month,
  created_at, updated_at, deleted_at
)
select
  b.user_id,
  'opening-' || b.id,
  b.id,
  b.currency,
  b.method,
  'opening',
  b.amount,
  b.amount,
  to_char(now() at time zone 'UTC', 'YYYY-MM-DD'),
  now(),
  to_char(now() at time zone 'UTC', 'YYYY-MM'),
  now(),
  now(),
  null
from public.balances b
on conflict (user_id, id) do nothing;
