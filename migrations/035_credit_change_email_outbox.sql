create table if not exists credit_change_email_outbox (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  user_id uuid not null references users(id) on delete cascade,
  order_id uuid references orders(id) on delete set null,
  change_kind text not null,
  change_label text not null default '',
  subject_override text not null default '',
  body_override text not null default '',
  delta_credits integer not null,
  balance_after integer not null,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  sent_at timestamptz,
  last_error text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_credit_change_email_outbox_dispatch
  on credit_change_email_outbox(status, next_attempt_at, created_at);
