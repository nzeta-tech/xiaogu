alter table avatar_privacy_settings
add column if not exists visual_creation_enabled boolean not null default true;

create table if not exists avatar_visual_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  role text not null default 'portrait' check (role in ('portrait', 'professional', 'lifestyle', 'full_body', 'side_profile')),
  label text not null default '',
  is_primary boolean not null default false,
  status text not null default 'active' check (status in ('active', 'disabled', 'archived')),
  usage_scopes text[] not null default array['image-card', 'personality-card']::text[],
  allow_creation boolean not null default true,
  storage_provider text not null default 'database' check (storage_provider in ('database', 's3')),
  storage_key text,
  content_type text not null default 'image/jpeg',
  original_filename text not null default '',
  size_bytes integer not null default 0,
  width integer not null default 0,
  height integer not null default 0,
  sha256 text not null,
  quality_json jsonb not null default '{}'::jsonb,
  image_data bytea,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_avatar_visual_assets_user_hash_active
on avatar_visual_assets(user_id, sha256)
where status <> 'archived';

create unique index if not exists idx_avatar_visual_assets_one_primary
on avatar_visual_assets(user_id)
where is_primary = true and status = 'active';

create index if not exists idx_avatar_visual_assets_user_status
on avatar_visual_assets(user_id, status, is_primary desc, updated_at desc);

create table if not exists avatar_visual_usage_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  work_id uuid references works(id) on delete set null,
  app_run_id uuid references app_runs(id) on delete set null,
  asset_ids uuid[] not null default '{}',
  context_type text not null default 'image',
  created_at timestamptz not null default now()
);

create index if not exists idx_avatar_visual_usage_user_created
on avatar_visual_usage_logs(user_id, created_at desc);
