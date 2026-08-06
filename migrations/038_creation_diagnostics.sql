create table if not exists creation_diagnostics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  trace_id text not null,
  request_id text,
  app_slug text not null default '',
  event_type text not null,
  outcome text not null default '',
  error_code text not null default '',
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_creation_diagnostics_user_created on creation_diagnostics(user_id, created_at desc);
create index if not exists idx_creation_diagnostics_trace_created on creation_diagnostics(trace_id, created_at);
create index if not exists idx_creation_diagnostics_app_created on creation_diagnostics(app_slug, created_at desc);
