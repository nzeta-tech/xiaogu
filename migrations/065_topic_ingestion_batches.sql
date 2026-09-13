create table if not exists topic_ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('running', 'completed', 'failed')),
  source_summary jsonb not null default '{}'::jsonb,
  topic_count integer not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  error_message text
);

alter table topic_snapshots add column if not exists ingestion_run_id uuid references topic_ingestion_runs(id) on delete cascade;
alter table topic_snapshots add column if not exists topic_tab text not null default '热点';
alter table topic_snapshots add column if not exists dedupe_key text;

create index if not exists idx_topic_ingestion_runs_completed_at on topic_ingestion_runs(completed_at desc) where status = 'completed';
create index if not exists idx_topic_snapshots_run_tab on topic_snapshots(ingestion_run_id, topic_tab, created_at desc);
