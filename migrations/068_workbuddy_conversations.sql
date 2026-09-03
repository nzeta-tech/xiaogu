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

create index if not exists idx_workbuddy_messages_task_created
  on workbuddy_task_messages(task_id, created_at);
