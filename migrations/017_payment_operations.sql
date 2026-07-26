alter table orders add column if not exists expired_at timestamptz;
alter table orders add column if not exists cancelled_at timestamptz;
alter table orders add column if not exists refund_requested_at timestamptz;
alter table orders add column if not exists provider_status text not null default '';
alter table orders add column if not exists credit_granted_at timestamptz;
alter table orders add column if not exists manual_review_note text not null default '';

create table if not exists payment_manual_reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references orders(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  receipt_url text not null default '',
  user_note text not null default '',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_payment_manual_reviews_status on payment_manual_reviews(status, created_at desc);
