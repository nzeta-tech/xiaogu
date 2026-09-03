create table if not exists workbuddy_capability_invocations (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references workbuddy_tasks(id) on delete cascade,
  step_id uuid references workbuddy_task_steps(id) on delete set null,
  user_id uuid not null references users(id) on delete cascade,
  capability_id text not null,
  capability_kind text not null check (capability_kind in ('app','skill','mcp','connector','agent')),
  app_slug text,
  status text not null default 'pending' check (status in ('pending','running','waiting_approval','completed','failed','cancelled')),
  input_json jsonb not null default '{}'::jsonb,
  output_json jsonb not null default '{}'::jsonb,
  work_id uuid references works(id) on delete set null,
  app_run_id uuid references app_runs(id) on delete set null,
  points_cost integer not null default 0,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_workbuddy_invocations_task_created on workbuddy_capability_invocations(task_id, created_at);
create index if not exists idx_workbuddy_invocations_user_status on workbuddy_capability_invocations(user_id, status);
