create table if not exists local_agent_task_events (
  id bigserial primary key,
  task_id uuid not null references local_agent_tasks(id) on delete cascade,
  attempt_count integer not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint local_agent_task_events_type_check check (event_type in ('reset', 'status', 'delta')),
  constraint local_agent_task_events_attempt_check check (attempt_count > 0)
);

create index if not exists idx_local_agent_task_events_stream
  on local_agent_task_events(task_id, id);
