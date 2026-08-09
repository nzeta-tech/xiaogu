create table if not exists avatar_training_tasks (
  id uuid primary key default gen_random_uuid(),
  training_run_id uuid not null references avatar_training_runs(id) on delete cascade,
  local_agent_task_id uuid not null references local_agent_tasks(id) on delete cascade,
  source_url text not null,
  platform text not null default 'short_video',
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed')),
  title text not null default '',
  transcript text not null default '',
  error_message text not null default '',
  result_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(training_run_id, local_agent_task_id)
);
create index if not exists idx_avatar_training_tasks_run on avatar_training_tasks(training_run_id, created_at);
create index if not exists idx_avatar_training_tasks_agent_task on avatar_training_tasks(local_agent_task_id);
