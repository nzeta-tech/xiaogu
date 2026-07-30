-- Make already-created PPT tasks discoverable in the shared creation history.
with inserted as (
  insert into works(user_id,title,content_type,source_channel,status,compliance_risk,created_at,updated_at)
  select user_id,title,'text','ppt-maker','draft','unchecked',created_at,updated_at
  from presentation_jobs
  where work_id is null
  returning id,user_id,title,created_at
), linked as (
  update presentation_jobs job
  set work_id=inserted.id,updated_at=now()
  from inserted
  where job.work_id is null
    and job.user_id=inserted.user_id
    and job.title=inserted.title
    and job.created_at=inserted.created_at
  returning job.id,job.work_id,job.status,job.page_count
)
insert into work_versions(work_id,version_no,content,content_json,created_from)
select work_id,1,
       case when status='succeeded' then 'PPT 已制作完成，可在此下载并继续编辑。' else 'PPT 任务已提交，正在由本地 Agent 制作。' end || E'\n\nPPT_JOB_ID: ' || id || E'\n页数：' || coalesce(page_count::text,'待定') || E' 页',
       jsonb_build_object('presentationJobId',id),'generation'
from linked;
