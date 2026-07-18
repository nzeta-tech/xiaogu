alter table users add column if not exists email_verified_at timestamptz;
alter table users add column if not exists terms_accepted_version text not null default '2026-07-16';
alter table users add column if not exists terms_accepted_at timestamptz;

update users set email_verified_at = coalesce(email_verified_at, created_at),
                 terms_accepted_at = coalesce(terms_accepted_at, created_at);

create table if not exists auth_action_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_type text not null check (token_type in ('verify_email', 'reset_password')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_auth_action_tokens_user_type
on auth_action_tokens(user_id, token_type, created_at desc);

create table if not exists login_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  email text not null,
  success boolean not null,
  client_ip text not null default '',
  user_agent text not null default '',
  failure_reason text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_login_events_email_created on login_events(lower(email), created_at desc);
create index if not exists idx_login_events_user_created on login_events(user_id, created_at desc);

create table if not exists database_backups (
  id uuid primary key default gen_random_uuid(),
  filename text not null unique,
  status text not null default 'creating' check (status in ('creating', 'ready', 'failed', 'restored')),
  size_bytes bigint not null default 0,
  table_count integer not null default 0,
  row_count bigint not null default 0,
  checksum text not null default '',
  error_message text,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  restored_at timestamptz
);

create index if not exists idx_database_backups_created on database_backups(created_at desc);
