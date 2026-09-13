alter table local_agent_tasks drop constraint if exists local_agent_tasks_type_check;
alter table local_agent_tasks add constraint local_agent_tasks_type_check check (task_type in (
  'source.inspect','creator.discover','creator.refresh','work.discover','work.enrich','metrics.snapshot',
  'douyin.deep_verify','ppt.generate','heygen.video.generate','xiaogu.video.compose'
));

alter table digital_human_media_assets drop constraint if exists digital_human_media_assets_storage_provider_check;
alter table digital_human_media_assets add constraint digital_human_media_assets_storage_provider_check
  check (storage_provider in ('database','s3','local_disk'));
alter table digital_human_media_assets drop constraint if exists digital_human_media_assets_kind_check;
alter table digital_human_media_assets add constraint digital_human_media_assets_kind_check
  check (kind in ('source','preview','presenter_master','output','voice_source'));
alter table digital_human_media_assets add column if not exists storage_node_id text;
create index if not exists idx_digital_human_media_storage_node on digital_human_media_assets(storage_provider,storage_node_id,created_at desc);
