create table if not exists creative_coach_relaxation_backups (
  coach_version_id uuid primary key references creative_coach_versions(id) on delete cascade,
  snapshot_json jsonb not null,
  created_at timestamptz not null default now()
);

comment on table creative_coach_relaxation_backups is
  'Recoverable snapshot of active coach prompts and skill modules before creative-freedom relaxation.';
