create table if not exists digital_human_provider_bindings (
  id uuid primary key default gen_random_uuid(),
  digital_human_id uuid not null references digital_human_assets(id) on delete cascade,
  provider text not null,
  status text not null default 'creating' check (status in ('creating','ready','failed','disabled')),
  remote_avatar_id text,
  remote_group_id text,
  remote_voice_id text,
  capabilities jsonb not null default '{}'::jsonb,
  quality_score numeric,
  cost_profile jsonb not null default '{}'::jsonb,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(digital_human_id,provider)
);

insert into digital_human_provider_bindings(digital_human_id,provider,status,remote_avatar_id,remote_group_id,remote_voice_id,capabilities,metadata_json)
select id,provider,case when status='deleting' then 'disabled' else status end,provider_avatar_id,provider_group_id,provider_voice_id,
  jsonb_build_object('video',true,'sourceType',source_type),jsonb_build_object('migratedFromLegacy',true)
from digital_human_assets
on conflict(digital_human_id,provider) do nothing;

create table if not exists digital_human_media_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  digital_human_id uuid references digital_human_assets(id) on delete cascade,
  video_job_id uuid references digital_human_video_jobs(id) on delete cascade,
  kind text not null check (kind in ('source','preview','output','voice_source')),
  storage_provider text not null check (storage_provider in ('database','s3')),
  storage_key text,
  content_type text not null,
  original_filename text not null default '',
  size_bytes bigint not null,
  sha256 text not null,
  source_url text,
  file_data bytea,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(video_job_id,kind)
);
create index if not exists idx_digital_human_media_owner on digital_human_media_assets(user_id,created_at desc);
create index if not exists idx_digital_human_bindings_route on digital_human_provider_bindings(status,provider,updated_at desc);

create or replace function sync_digital_human_provider_binding() returns trigger language plpgsql as $$
begin
  insert into digital_human_provider_bindings(digital_human_id,provider,status,remote_avatar_id,remote_group_id,remote_voice_id,capabilities,metadata_json,updated_at)
  values(new.id,new.provider,case when new.status='deleting' then 'disabled' else new.status end,new.provider_avatar_id,new.provider_group_id,new.provider_voice_id,
    jsonb_build_object('video',true,'sourceType',new.source_type),jsonb_build_object('legacyAssetId',new.id),now())
  on conflict(digital_human_id,provider) do update set status=excluded.status,remote_avatar_id=excluded.remote_avatar_id,remote_group_id=excluded.remote_group_id,remote_voice_id=excluded.remote_voice_id,capabilities=excluded.capabilities,updated_at=now();
  return new;
end $$;
drop trigger if exists trg_sync_digital_human_provider_binding on digital_human_assets;
create trigger trg_sync_digital_human_provider_binding after insert or update of provider,status,provider_avatar_id,provider_group_id,provider_voice_id on digital_human_assets for each row execute function sync_digital_human_provider_binding();
