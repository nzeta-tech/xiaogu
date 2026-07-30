alter table local_agent_tasks drop constraint if exists local_agent_tasks_type_check;
alter table local_agent_tasks add constraint local_agent_tasks_type_check
  check (task_type in (
    'source.inspect','creator.discover','creator.refresh','work.discover','work.enrich',
    'metrics.snapshot','douyin.deep_verify','ppt.generate'
  ));

create table if not exists presentation_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  app_run_id uuid references app_runs(id) on delete set null,
  work_id uuid references works(id) on delete set null,
  task_id uuid unique references local_agent_tasks(id) on delete set null,
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed','cancelled')),
  title text not null,
  input_summary jsonb not null default '{}'::jsonb,
  error_message text,
  page_count integer,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists presentation_artifacts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references presentation_jobs(id) on delete cascade,
  filename text not null,
  content_type text not null default 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  pptx_data bytea not null,
  cover_png_data bytea,
  size_bytes integer not null,
  sha256 text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_presentation_jobs_user_created on presentation_jobs(user_id, created_at desc);
