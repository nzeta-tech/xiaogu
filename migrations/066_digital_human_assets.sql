create table if not exists digital_human_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  provider text not null check (provider in ('heygen', 'chanjing')),
  name text not null,
  status text not null default 'creating' check (status in ('creating', 'ready', 'failed', 'disabled', 'deleting')),
  source_type text not null check (source_type in ('photo', 'video')),
  provider_avatar_id text,
  provider_group_id text,
  provider_voice_id text,
  preview_image_url text,
  preview_video_url text,
  consent_confirmed_at timestamptz not null,
  error_message text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_digital_human_assets_user_provider
  on digital_human_assets(user_id, provider, created_at desc);
create unique index if not exists idx_digital_human_assets_remote
  on digital_human_assets(provider, provider_avatar_id)
  where provider_avatar_id is not null;

create table if not exists digital_human_video_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  asset_id uuid not null references digital_human_assets(id) on delete restrict,
  provider text not null check (provider in ('heygen', 'chanjing')),
  title text not null,
  script text not null,
  aspect_ratio text not null check (aspect_ratio in ('9:16', '16:9')),
  subtitle_enabled boolean not null default true,
  status text not null default 'queued' check (status in ('queued', 'processing', 'completed', 'failed')),
  provider_job_id text,
  provider_session_id text,
  video_url text,
  preview_image_url text,
  duration_seconds numeric,
  progress integer not null default 0,
  error_message text,
  request_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_digital_human_video_jobs_user
  on digital_human_video_jobs(user_id, created_at desc);
create index if not exists idx_digital_human_video_jobs_pending
  on digital_human_video_jobs(status, updated_at)
  where status in ('queued', 'processing');
