-- Operational access overrides never create payment records or credit grants.
create table if not exists exclusive_app_access_overrides (
  user_id uuid primary key references users(id) on delete cascade,
  mode text not null check (mode in ('auto','granted','blocked')),
  expires_at timestamptz,
  reason text not null check (length(btrim(reason)) between 1 and 500),
  revision integer not null default 1 check (revision > 0),
  updated_by uuid references users(id) on delete set null,
  updated_at timestamptz not null default now(),
  check (mode='granted' or expires_at is null)
);
create index if not exists admin_audit_exclusive_access_target
  on admin_audit_logs(target_id,created_at desc)
  where action='user.exclusive_app_access.update';
