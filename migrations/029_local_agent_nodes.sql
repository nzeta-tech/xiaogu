create table if not exists local_agent_nodes (
  agent_id text primary key,
  status text not null default 'offline',
  version text not null default '',
  capabilities jsonb not null default '{}'::jsonb,
  health jsonb not null default '{}'::jsonb,
  active_task_count integer not null default 0,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint local_agent_nodes_status_check check (status in ('ready', 'busy', 'degraded', 'offline')),
  constraint local_agent_nodes_active_tasks_check check (active_task_count >= 0)
);

create index if not exists idx_local_agent_nodes_recent
  on local_agent_nodes(last_seen_at desc)
  where status in ('ready', 'busy');
