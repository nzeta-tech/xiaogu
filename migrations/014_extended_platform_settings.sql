alter table orders add column if not exists base_amount_cents integer;
alter table orders add column if not exists fee_cents integer not null default 0;
alter table orders add column if not exists refunded_at timestamptz;
update orders set base_amount_cents = amount_cents where base_amount_cents is null;
alter table orders alter column base_amount_cents set not null;
alter table orders alter column base_amount_cents set default 0;

alter table users add column if not exists totp_enabled boolean not null default false;
alter table users add column if not exists totp_secret_encrypted text not null default '';
alter table users add column if not exists totp_recovery_codes jsonb not null default '[]'::jsonb;

alter table affiliate_accounts add column if not exists custom_rebate_rate_percent numeric(5,2);

alter table database_backups add column if not exists remote_key text;
alter table database_backups add column if not exists remote_status text not null default 'local';
alter table database_backups add column if not exists expires_at timestamptz;
alter table database_backups add column if not exists trigger_type text not null default 'manual';

create table if not exists credit_notification_state (
  user_id uuid primary key references users(id) on delete cascade,
  last_low_balance_at timestamptz,
  last_notified_balance integer,
  updated_at timestamptz not null default now()
);

create table if not exists model_runtime_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'primary',
  model text not null default '',
  outcome text not null check (outcome in ('success', 'error', 'timeout', 'fallback')),
  latency_ms integer not null default 0,
  error_message text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_model_runtime_events_created on model_runtime_events(created_at desc);
create index if not exists idx_orders_paid_amount on orders(user_id, paid_at desc) where status = 'paid';
