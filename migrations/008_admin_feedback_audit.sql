create table if not exists feedback_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  title text not null,
  content text not null,
  category text not null default 'general',
  status text not null default 'open',
  priority text not null default 'normal',
  admin_reply text not null default '',
  assigned_admin_id uuid references users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references users(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text not null default '',
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_feedback_tickets_status_updated_at on feedback_tickets(status, updated_at desc);
create index if not exists idx_feedback_tickets_user_created_at on feedback_tickets(user_id, created_at desc);
create index if not exists idx_admin_audit_logs_created_at on admin_audit_logs(created_at desc);
create index if not exists idx_admin_audit_logs_admin_created_at on admin_audit_logs(admin_user_id, created_at desc);
