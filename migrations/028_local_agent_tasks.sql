create table if not exists local_agent_tasks (
  id uuid primary key default gen_random_uuid(),
  task_type text not null,
  priority integer not null default 0,
  status text not null default 'pending',
  owner_user_id uuid references users(id) on delete cascade,
  dedupe_key text,
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  error_message text,
  agent_id text,
  lease_token_hash text,
  lease_expires_at timestamptz,
  attempt_count integer not null default 0,
  max_attempts integer not null default 3,
  available_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint local_agent_tasks_status_check
    check (status in ('pending', 'leased', 'succeeded', 'failed', 'cancelled')),
  constraint local_agent_tasks_attempts_check
    check (attempt_count >= 0 and max_attempts > 0),
  constraint local_agent_tasks_type_check
    check (task_type in (
      'source.inspect',
      'creator.discover',
      'creator.refresh',
      'work.discover',
      'work.enrich',
      'metrics.snapshot'
    ))
);

create index if not exists idx_local_agent_tasks_lease
  on local_agent_tasks(status, priority desc, available_at, created_at)
  where status in ('pending', 'leased');

create index if not exists idx_local_agent_tasks_owner_recent
  on local_agent_tasks(owner_user_id, created_at desc);

create unique index if not exists idx_local_agent_tasks_active_dedupe
  on local_agent_tasks(task_type, dedupe_key)
  where dedupe_key is not null and status in ('pending', 'leased');
