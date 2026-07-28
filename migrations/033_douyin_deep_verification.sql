alter table local_agent_tasks
  drop constraint if exists local_agent_tasks_type_check;

alter table local_agent_tasks
  add constraint local_agent_tasks_type_check
  check (task_type in (
    'source.inspect',
    'creator.discover',
    'creator.refresh',
    'work.discover',
    'work.enrich',
    'metrics.snapshot',
    'douyin.deep_verify'
  ));

alter table viral_works
  add column if not exists article_material_status text not null default 'discovered',
  add column if not exists article_evidence_score double precision not null default 0,
  add column if not exists article_evidence jsonb not null default '{}'::jsonb,
  add column if not exists article_evidence_updated_at timestamptz;

alter table viral_works
  drop constraint if exists viral_works_article_material_status_check;

alter table viral_works
  add constraint viral_works_article_material_status_check
  check (article_material_status in (
    'discovered',
    'metadata_verified',
    'transcript_verified',
    'evidence_ready',
    'rejected'
  ));

create index if not exists idx_viral_works_article_material_queue
  on viral_works(platform, article_material_status, article_evidence_score desc, last_seen_at desc);
