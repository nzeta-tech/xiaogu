alter table digital_human_video_jobs alter column asset_id drop not null;

alter table local_agent_tasks drop constraint if exists local_agent_tasks_type_check;
alter table local_agent_tasks add constraint local_agent_tasks_type_check check (task_type in (
  'source.inspect','creator.discover','creator.refresh','work.discover','work.enrich','metrics.snapshot',
  'douyin.deep_verify','ppt.generate','heygen.video.generate','xiaogu.video.compose','openchatcut.edit',
  'digital-human.video.produce'
));

alter table digital_human_media_assets drop constraint if exists digital_human_media_assets_kind_check;
alter table digital_human_media_assets add constraint digital_human_media_assets_kind_check
  check (kind in ('source','preview','presenter_master','output','voice_source','input_photo','cover'));
