create table if not exists digital_human_voice_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  provider text not null check (provider in ('heygen', 'chanjing')),
  name text not null,
  status text not null default 'creating' check (status in ('creating', 'ready', 'failed', 'disabled')),
  provider_voice_id text,
  preview_audio_url text,
  reference_audio_url text,
  consent_confirmed_at timestamptz not null,
  error_message text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_digital_human_voice_assets_user_provider
  on digital_human_voice_assets(user_id, provider, created_at desc);

alter table digital_human_video_jobs add column if not exists voice_id text;
alter table digital_human_video_jobs add column if not exists voice_name text;
alter table digital_human_video_jobs add column if not exists voice_source text;
