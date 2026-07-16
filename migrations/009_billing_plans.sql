create table if not exists billing_plans (
  code text primary key,
  name text not null,
  quota_amount integer not null,
  amount_cents integer not null,
  currency text not null default 'CNY',
  description text not null default '',
  recommended boolean not null default false,
  status text not null default 'active',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_billing_plans_status_sort on billing_plans(status, sort_order);
