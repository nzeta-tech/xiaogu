drop index if exists idx_digital_human_assets_remote;
create unique index if not exists idx_digital_human_assets_remote
  on digital_human_assets(user_id, provider, provider_avatar_id)
  where provider_avatar_id is not null;
