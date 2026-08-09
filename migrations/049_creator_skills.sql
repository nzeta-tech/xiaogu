create table if not exists avatar_creator_skills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  creator_name text not null default '',
  status text not null default 'active' check (status in ('active', 'archived')),
  latest_version integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_avatar_creator_skills_user_name
on avatar_creator_skills(user_id, lower(name));

create table if not exists avatar_creator_skill_versions (
  id uuid primary key default gen_random_uuid(),
  skill_id uuid not null references avatar_creator_skills(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  version integer not null,
  training_run_id uuid references avatar_training_runs(id) on delete set null,
  status text not null default 'training' check (status in ('training', 'active', 'superseded', 'restored', 'failed')),
  source_links jsonb not null default '[]'::jsonb,
  sample_count integer not null default 0,
  skill_prompt text not null default '',
  change_summary text not null default '',
  created_at timestamptz not null default now(),
  unique(skill_id, version)
);

alter table avatar_training_runs add column if not exists creator_skill_id uuid references avatar_creator_skills(id) on delete set null;
create index if not exists idx_avatar_creator_skill_versions_skill_version on avatar_creator_skill_versions(skill_id, version desc);
