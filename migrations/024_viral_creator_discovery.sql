alter table viral_creators add column if not exists platform_creator_key text;
alter table viral_creators add column if not exists discovery_query text;
alter table viral_creators add column if not exists refresh_status text not null default 'pending';
alter table viral_creators add column if not exists last_refreshed_at timestamptz;
alter table viral_creators add column if not exists last_refresh_error text;
alter table viral_creators add column if not exists discovered_work_count integer not null default 0;

create unique index if not exists idx_viral_creators_platform_external_key
  on viral_creators(platform, platform_creator_key)
  where platform_creator_key is not null;

create index if not exists idx_viral_creators_refresh_queue
  on viral_creators(refresh_status, last_refreshed_at nulls first, relevance_score desc);

create table if not exists viral_work_candidates (
  id bigserial primary key,
  data_run_id uuid not null references viral_data_runs(id) on delete cascade,
  platform text not null,
  source_key text not null,
  source_url text not null,
  title text not null,
  author_name text,
  platform_creator_key text,
  author_profile_url text,
  discovery_query text,
  relevance_score double precision not null default 0,
  disposition text not null default 'discovered',
  rejection_reason text,
  raw_data jsonb not null default '{}'::jsonb,
  discovered_at timestamptz not null default now(),
  unique(data_run_id, platform, source_key),
  constraint viral_work_candidates_disposition_check
    check (disposition in ('discovered', 'eligible', 'published', 'rejected'))
);

create index if not exists idx_viral_work_candidates_run_distribution
  on viral_work_candidates(data_run_id, platform, disposition);

alter table viral_data_runs add column if not exists creator_discovered_count integer not null default 0;
alter table viral_data_runs add column if not exists candidate_count integer not null default 0;
alter table viral_data_runs add column if not exists eligible_count integer not null default 0;
