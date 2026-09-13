alter table local_agent_tasks drop constraint if exists local_agent_tasks_type_check;
alter table local_agent_tasks add constraint local_agent_tasks_type_check check (task_type in (
  'source.inspect','creator.discover','creator.refresh','work.discover','work.enrich','metrics.snapshot',
  'douyin.deep_verify','ppt.generate','heygen.video.generate','xiaogu.video.compose','openchatcut.edit'
));
