alter table local_agent_tasks drop constraint if exists local_agent_tasks_type_check;
alter table local_agent_tasks add constraint local_agent_tasks_type_check check (task_type in (
  'source.inspect','creator.discover','creator.refresh','work.discover','work.enrich','metrics.snapshot',
  'douyin.deep_verify','ppt.generate','heygen.video.generate','xiaogu.video.compose','openchatcut.edit',
  'digital-human.video.produce','spoken.voice.clone'
));
-- Keep asset failure observable even after worker loss or exhausted retries.
create or replace function sync_spoken_voice_task_status() returns trigger language plpgsql as $$
begin
  if new.task_type='spoken.voice.clone' and new.status='failed' then
    update digital_human_voice_assets set status='failed',error_message='声音处理失败，请重试',updated_at=now()
      where id=(new.payload->>'voiceId')::uuid and user_id=new.owner_user_id and status='creating';
  end if;
  return new;
end;
$$;
drop trigger if exists spoken_voice_task_status on local_agent_tasks;
create trigger spoken_voice_task_status after update of status on local_agent_tasks
  for each row execute function sync_spoken_voice_task_status();
