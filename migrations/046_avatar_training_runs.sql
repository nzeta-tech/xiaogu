create table if not exists avatar_training_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  source_id uuid references avatar_memory_sources(id) on delete set null,
  training_type text not null default 'video_channel',
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  phase text not null default 'validating',
  total_count integer not null default 0,
  completed_count integer not null default 0,
  successful_count integer not null default 0,
  error_message text not null default '',
  details_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_avatar_training_runs_user_created
on avatar_training_runs(user_id, created_at desc);
