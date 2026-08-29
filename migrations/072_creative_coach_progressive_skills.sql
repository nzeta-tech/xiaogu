alter table creative_coach_versions
  add column if not exists persona_profile jsonb not null default '{}'::jsonb,
  add column if not exists skill_hierarchy jsonb not null default '[]'::jsonb,
  add column if not exists training_manifest jsonb not null default '{}'::jsonb;

alter table creative_coach_versions drop constraint if exists creative_coach_versions_status_check;
alter table creative_coach_versions add constraint creative_coach_versions_status_check
  check (status in ('training','candidate','active','superseded','restored','failed'));

create table if not exists creative_coach_work_analyses (
  id uuid primary key default gen_random_uuid(),
  coach_version_id uuid not null references creative_coach_versions(id) on delete cascade,
  source_skill_id uuid references avatar_creator_skills(id) on delete set null,
  training_task_id uuid references avatar_training_tasks(id) on delete set null,
  work_fingerprint text not null,
  analysis_level text not null check (analysis_level in ('light','deep')),
  task_profile jsonb not null default '{}'::jsonb,
  local_skills jsonb not null default '[]'::jsonb,
  persona_signals jsonb not null default '[]'::jsonb,
  stopping_evidence jsonb not null default '[]'::jsonb,
  negative_evidence jsonb not null default '[]'::jsonb,
  model_name text not null default '',
  token_usage jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(coach_version_id,work_fingerprint,analysis_level)
);
create index if not exists idx_coach_work_analyses_version_level
  on creative_coach_work_analyses(coach_version_id,analysis_level,updated_at desc);

create table if not exists creative_coach_skill_patches (
  id uuid primary key default gen_random_uuid(),
  coach_version_id uuid not null references creative_coach_versions(id) on delete cascade,
  operation text not null check (operation in ('add','strengthen','split','merge','deprecate','unchanged')),
  target_skill_id text not null default '',
  reason text not null default '',
  evidence_count integer not null default 0,
  source_work_fingerprints text[] not null default '{}'::text[],
  affected_task_profiles jsonb not null default '[]'::jsonb,
  before_value jsonb not null default '{}'::jsonb,
  after_value jsonb not null default '{}'::jsonb,
  status text not null default 'candidate' check (status in ('candidate','accepted','rejected')),
  created_at timestamptz not null default now()
);
create index if not exists idx_coach_skill_patches_version_status
  on creative_coach_skill_patches(coach_version_id,status,created_at desc);

comment on column creative_coach_versions.persona_profile is 'Identity, stable positions and voice; never stores procedural writing methods.';
comment on column creative_coach_versions.skill_hierarchy is 'Progressively loaded general/strategy/functional/atomic skill index.';
comment on column creative_coach_versions.training_manifest is 'Corpus coverage, sample selection, checkpoints, models, costs and evaluation split metadata.';
