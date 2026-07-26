create table if not exists payment_provider_instances (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  provider_key text not null check (provider_key in ('stripe', 'airwallex', 'easypay', 'alipay', 'wxpay')),
  enabled boolean not null default false,
  sort_order integer not null default 0,
  supported_methods jsonb not null default '[]'::jsonb,
  config_encrypted text not null default '',
  min_amount_cents integer not null default 0,
  max_amount_cents integer not null default 0,
  daily_limit_cents bigint not null default 0,
  refund_enabled boolean not null default false,
  last_health_status text not null default 'unknown',
  last_health_checked_at timestamptz,
  last_webhook_at timestamptz,
  last_error text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_payment_provider_instances_enabled
  on payment_provider_instances(enabled, provider_key, sort_order);

alter table orders add column if not exists provider_instance_id uuid references payment_provider_instances(id) on delete set null;
alter table orders add column if not exists payment_method text;
alter table orders add column if not exists completed_at timestamptz;
alter table orders add column if not exists failure_code text;
alter table orders add column if not exists failure_message text;
alter table orders add column if not exists idempotency_key text;
create unique index if not exists idx_orders_idempotency_key on orders(idempotency_key) where idempotency_key is not null;

create table if not exists payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider_key text not null,
  provider_instance_id uuid references payment_provider_instances(id) on delete set null,
  event_id text not null,
  event_type text not null default '',
  order_id uuid references orders(id) on delete set null,
  status text not null default 'received',
  payload_hash text not null default '',
  error_message text not null default '',
  attempts integer not null default 1,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique(provider_key, event_id)
);
