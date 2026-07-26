create index if not exists idx_local_agent_task_events_retention
  on local_agent_task_events(created_at);
