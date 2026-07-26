alter table viral_creators add column if not exists quality_score double precision not null default 0;
alter table viral_creators add column if not exists discovery_evidence_count integer not null default 0;
alter table viral_creators add column if not exists follower_count integer;
alter table viral_creators add column if not exists platform_work_count integer;
alter table viral_creators add column if not exists is_verified boolean not null default false;

create index if not exists idx_viral_creators_candidate_quality
  on viral_creators(platform, status, quality_score desc, relevance_score desc);

create table if not exists viral_creator_discovery_runs (
  id uuid primary key default gen_random_uuid(),
  trigger_type text not null default 'scheduled',
  status text not null default 'running',
  target_per_platform integer not null default 100,
  discovered_count integer not null default 0,
  upserted_count integer not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  error_message text,
  diagnostics jsonb not null default '{}'::jsonb,
  constraint viral_creator_discovery_runs_status_check check (status in ('running', 'succeeded', 'failed'))
);

create index if not exists idx_viral_creator_discovery_runs_recent
  on viral_creator_discovery_runs(started_at desc);

create table if not exists viral_creator_discovery_sightings (
  id bigserial primary key,
  run_id uuid not null references viral_creator_discovery_runs(id) on delete cascade,
  creator_id uuid not null references viral_creators(id) on delete cascade,
  platform text not null,
  discovery_query text not null,
  source_url text,
  evidence_title text,
  discovered_at timestamptz not null default now(),
  unique(run_id, creator_id, discovery_query, evidence_title)
);

create index if not exists idx_viral_creator_sightings_creator
  on viral_creator_discovery_sightings(creator_id, discovered_at desc);
