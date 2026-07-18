create table if not exists affiliate_accounts (
  user_id uuid primary key references users(id) on delete cascade,
  referral_code text not null unique,
  inviter_id uuid references users(id) on delete set null,
  invited_at timestamptz,
  available_credits integer not null default 0 check (available_credits >= 0),
  frozen_credits integer not null default 0 check (frozen_credits >= 0),
  lifetime_credits integer not null default 0 check (lifetime_credits >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (inviter_id is null or inviter_id <> user_id)
);

create table if not exists affiliate_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  action text not null check (action in ('accrue', 'transfer', 'reverse')),
  credits integer not null check (credits > 0),
  source_user_id uuid references users(id) on delete set null,
  source_order_id uuid references orders(id) on delete set null,
  frozen_until timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_affiliate_ledger_order_accrue
on affiliate_ledger(source_order_id) where action = 'accrue' and source_order_id is not null;

create unique index if not exists idx_affiliate_ledger_order_reverse
on affiliate_ledger(source_order_id) where action = 'reverse' and source_order_id is not null;

create index if not exists idx_affiliate_accounts_inviter on affiliate_accounts(inviter_id, created_at desc);
create index if not exists idx_affiliate_ledger_user on affiliate_ledger(user_id, created_at desc);
create index if not exists idx_affiliate_ledger_frozen on affiliate_ledger(user_id, frozen_until)
where action = 'accrue' and frozen_until is not null;
