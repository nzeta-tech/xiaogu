alter table digital_human_provider_bindings
  add column if not exists edition text,
  add column if not exists review_status text,
  add column if not exists review_video_url text;

update digital_human_provider_bindings
set edition=case when provider='heygen' then 'pro' else 'standard' end
where edition is null;
update digital_human_provider_bindings set review_status='approved' where review_status is null;

alter table digital_human_provider_bindings alter column edition set not null;
alter table digital_human_provider_bindings alter column review_status set not null;

do $$ begin
  alter table digital_human_provider_bindings add constraint digital_human_provider_bindings_edition_check check(edition in ('standard','pro'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table digital_human_provider_bindings add constraint digital_human_provider_bindings_review_check check(review_status in ('pending','approved','rejected'));
exception when duplicate_object then null; end $$;

create index if not exists idx_digital_human_bindings_edition
  on digital_human_provider_bindings(digital_human_id,edition,status,review_status);

create or replace function sync_digital_human_provider_binding() returns trigger language plpgsql as $$
begin
  insert into digital_human_provider_bindings(digital_human_id,provider,status,remote_avatar_id,remote_group_id,remote_voice_id,capabilities,metadata_json,edition,review_status,updated_at)
  values(new.id,new.provider,case when new.status='deleting' then 'disabled' else new.status end,new.provider_avatar_id,new.provider_group_id,new.provider_voice_id,
    jsonb_build_object('video',true,'sourceType',new.source_type),jsonb_build_object('legacyAssetId',new.id),case when new.provider='heygen' then 'pro' else 'standard' end,'approved',now())
  on conflict(digital_human_id,provider) do update set status=excluded.status,remote_avatar_id=excluded.remote_avatar_id,remote_group_id=excluded.remote_group_id,remote_voice_id=excluded.remote_voice_id,capabilities=excluded.capabilities,edition=coalesce(digital_human_provider_bindings.edition,excluded.edition),updated_at=now();
  return new;
end $$;
