create table if not exists spoken_photo_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  media_id uuid not null references digital_human_media_assets(id) on delete restrict,
  source_type text not null check (source_type in ('upload','chanjing','face_swap')),
  source_asset_id uuid references digital_human_assets(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_spoken_photo_assets_user on spoken_photo_assets(user_id,created_at desc);
alter table digital_human_media_assets drop constraint if exists digital_human_media_assets_kind_check;
alter table digital_human_media_assets add constraint digital_human_media_assets_kind_check
  check (kind in ('source','preview','presenter_master','output','voice_source','input_photo','cover','spoken_photo','voice_recording'));
