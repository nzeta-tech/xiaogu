create table if not exists affiliate_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  notification_type text not null,
  event_key text not null,
  title text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, event_key)
);

create index if not exists idx_affiliate_notifications_user_created_at
on affiliate_notifications(user_id, created_at desc);
