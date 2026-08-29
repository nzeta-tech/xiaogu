create table if not exists creative_coach_training_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  coach_id uuid not null references creative_coaches(id) on delete cascade,
  source_skill_id uuid not null references avatar_creator_skills(id) on delete cascade,
  source_run_id uuid not null references avatar_training_runs(id) on delete cascade,
  status text not null default 'waiting_source'
    check (status in ('waiting_source','queued','training','succeeded','failed')),
  phase text not null default 'waiting-source',
  attempt_count integer not null default 0,
  lease_until timestamptz,
  progressive_version_id uuid references creative_coach_versions(id) on delete set null,
  error_message text not null default '',
  details_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source_run_id)
);

create index if not exists idx_creative_coach_training_jobs_dispatch
  on creative_coach_training_jobs(status,lease_until,updated_at);
create index if not exists idx_creative_coach_training_jobs_coach
  on creative_coach_training_jobs(coach_id,created_at desc);
create unique index if not exists idx_creative_coach_training_jobs_one_active_per_coach
  on creative_coach_training_jobs(coach_id)
  where status in ('waiting_source','queued','training');

comment on table creative_coach_training_jobs is
  'Durable orchestration from one parsed source corpus to progressive coach Skill training and activation.';
