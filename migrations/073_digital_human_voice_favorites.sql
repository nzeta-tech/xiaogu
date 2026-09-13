delete from digital_human_voice_assets older
using digital_human_voice_assets newer
where older.user_id = newer.user_id
  and older.provider = newer.provider
  and older.provider_voice_id = newer.provider_voice_id
  and older.provider_voice_id is not null
  and (older.created_at, older.id) < (newer.created_at, newer.id);

create unique index if not exists idx_digital_human_voice_assets_user_provider_voice
  on digital_human_voice_assets(user_id, provider, provider_voice_id)
  where provider_voice_id is not null;
