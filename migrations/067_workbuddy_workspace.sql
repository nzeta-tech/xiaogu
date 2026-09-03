create table if not exists workbuddy_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  title text not null,
  objective text not null,
  scenario text not null default 'general',
  status text not null default 'planning' check (status in ('planning','running','waiting_approval','completed','failed','cancelled')),
  priority text not null default 'normal' check (priority in ('low','normal','high')),
  progress integer not null default 0 check (progress between 0 and 100),
  context_json jsonb not null default '{}'::jsonb,
  summary text not null default '',
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists workbuddy_task_steps (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references workbuddy_tasks(id) on delete cascade,
  position integer not null,
  title text not null,
  description text not null default '',
  expert_key text not null,
  skill_key text not null,
  status text not null default 'pending' check (status in ('pending','running','waiting_approval','completed','failed','skipped')),
  output_summary text not null default '',
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(task_id, position)
);

create table if not exists workbuddy_task_messages (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references workbuddy_tasks(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  role text not null check (role in ('user','assistant','system')),
  message_type text not null default 'message',
  content text not null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists workbuddy_artifacts (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references workbuddy_tasks(id) on delete cascade,
  step_id uuid references workbuddy_task_steps(id) on delete set null,
  artifact_type text not null default 'document',
  title text not null,
  content text not null default '',
  content_json jsonb not null default '{}'::jsonb,
  status text not null default 'ready' check (status in ('draft','ready','approved','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists workbuddy_approvals (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references workbuddy_tasks(id) on delete cascade,
  artifact_id uuid references workbuddy_artifacts(id) on delete cascade,
  approval_type text not null default 'delivery',
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  note text not null default '',
  resolved_by uuid references users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists workbuddy_customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  display_name text not null,
  stage text not null default 'lead',
  tags text[] not null default '{}',
  needs_summary text not null default '',
  next_action text not null default '',
  next_action_at timestamptz,
  sensitive_data_notice boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists workbuddy_automations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  trigger_type text not null,
  instruction text not null,
  schedule_text text not null default '',
  enabled boolean not null default true,
  last_run_at timestamptz,
  next_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists workbuddy_audit_events (
  id bigserial primary key,
  user_id uuid references users(id) on delete set null,
  task_id uuid references workbuddy_tasks(id) on delete cascade,
  event_type text not null,
  detail_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_workbuddy_tasks_user_updated on workbuddy_tasks(user_id, updated_at desc);
create index if not exists idx_workbuddy_steps_task_position on workbuddy_task_steps(task_id, position);
create index if not exists idx_workbuddy_messages_task_created on workbuddy_task_messages(task_id, created_at);
create index if not exists idx_workbuddy_artifacts_task_created on workbuddy_artifacts(task_id, created_at);
create index if not exists idx_workbuddy_customers_user_updated on workbuddy_customers(user_id, updated_at desc);
create index if not exists idx_workbuddy_automations_user_enabled on workbuddy_automations(user_id, enabled);
