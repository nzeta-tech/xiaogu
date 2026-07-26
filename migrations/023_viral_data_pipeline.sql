create table if not exists viral_data_runs (
  id uuid primary key default gen_random_uuid(),
  trigger_type text not null default 'scheduled',
  status text not null default 'running',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  discovered_count integer not null default 0,
  published_count integer not null default 0,
  error_message text,
  diagnostics jsonb not null default '{}'::jsonb,
  constraint viral_data_runs_status_check check (status in ('running', 'succeeded', 'failed'))
);

create index if not exists idx_viral_data_runs_recent
  on viral_data_runs(started_at desc);

create table if not exists viral_creators (
  id uuid primary key default gen_random_uuid(),
  platform text not null,
  creator_key text not null,
  display_name text not null,
  profile_url text,
  bio text not null default '',
  status text not null default 'active',
  relevance_score double precision not null default 0,
  source_kind text not null default 'platform_search',
  metadata jsonb not null default '{}'::jsonb,
  first_discovered_at timestamptz not null default now(),
  last_discovered_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(platform, creator_key)
);

create index if not exists idx_viral_creators_watchlist
  on viral_creators(status, relevance_score desc, last_discovered_at desc);

create table if not exists viral_works (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid references viral_creators(id) on delete set null,
  platform text not null,
  source_key text not null unique,
  source_url text not null,
  title text not null,
  excerpt text not null default '',
  thumbnail_url text,
  example_type text not null default '短视频',
  content_type text not null default '平台热门作品',
  category text not null default '其他',
  tags jsonb not null default '[]'::jsonb,
  relevance_score double precision not null default 0,
  published_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_viral_works_creator_recent
  on viral_works(creator_id, published_at desc, last_seen_at desc);
create index if not exists idx_viral_works_platform_recent
  on viral_works(platform, published_at desc, last_seen_at desc);

create table if not exists viral_work_metric_snapshots (
  id bigserial primary key,
  work_id uuid not null references viral_works(id) on delete cascade,
  captured_at timestamptz not null,
  metric_label text not null,
  metric_value integer not null,
  metric_unit text not null default '',
  created_at timestamptz not null default now(),
  unique(work_id, captured_at, metric_label)
);

create index if not exists idx_viral_metric_snapshots_history
  on viral_work_metric_snapshots(work_id, metric_label, captured_at desc);

alter table viral_contents add column if not exists automatic_key text;
alter table viral_contents add column if not exists creator_id uuid references viral_creators(id) on delete set null;
alter table viral_contents add column if not exists work_id uuid references viral_works(id) on delete set null;
alter table viral_contents add column if not exists data_run_id uuid references viral_data_runs(id) on delete set null;
alter table viral_contents add column if not exists example_type text not null default '短视频';
alter table viral_contents add column if not exists viral_score double precision not null default 0;
alter table viral_contents add column if not exists fetched_at timestamptz;

create unique index if not exists idx_viral_contents_automatic_key
  on viral_contents(automatic_key)
  where source_type = 'automatic' and automatic_key is not null;

create index if not exists idx_viral_contents_automatic_publish
  on viral_contents(source_type, status, platform, viral_score desc, fetched_at desc);
