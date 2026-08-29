create table if not exists creative_coaches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  creator_name text not null default '',
  coach_scope text not null default 'personal' check (coach_scope in ('personal', 'platform')),
  status text not null default 'archived' check (status in ('active', 'archived')),
  latest_version integer not null default 0,
  identity_card jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_creative_coaches_owner_scope_name
  on creative_coaches(user_id, coach_scope, lower(name));
create index if not exists idx_creative_coaches_scope_status_updated
  on creative_coaches(coach_scope, status, updated_at desc);

create table if not exists creative_coach_versions (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references creative_coaches(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  version integer not null,
  status text not null default 'training' check (status in ('training', 'active', 'superseded', 'restored', 'failed')),
  ip_positioning_prompt text not null default '',
  content_creation_prompt text not null default '',
  growth_prompt text not null default '',
  source_skill_ids uuid[] not null default '{}'::uuid[],
  source_run_ids uuid[] not null default '{}'::uuid[],
  sample_count integer not null default 0,
  change_summary text not null default '',
  created_at timestamptz not null default now(),
  unique(coach_id, version)
);

create index if not exists idx_creative_coach_versions_coach_version
  on creative_coach_versions(coach_id, version desc);
