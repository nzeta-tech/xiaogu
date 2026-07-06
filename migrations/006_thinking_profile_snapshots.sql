create table if not exists thinking_profile_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  questionnaire_id uuid not null references profile_questionnaires(id) on delete cascade,
  version integer not null default 1,
  status text not null default 'active',
  snapshot_json jsonb not null default '{}'::jsonb,
  summary_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (questionnaire_id, version)
);

create index if not exists idx_thinking_profile_snapshots_user_updated_at
on thinking_profile_snapshots(user_id, updated_at desc);
