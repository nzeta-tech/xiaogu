create table if not exists avatar_creator_skill_modules (
  id uuid primary key default gen_random_uuid(),
  skill_version_id uuid not null references avatar_creator_skill_versions(id) on delete cascade,
  module_key text not null,
  label text not null,
  selection_card text not null default '',
  module_prompt text not null,
  training_evidence jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (skill_version_id, module_key)
);

create index if not exists idx_avatar_creator_skill_modules_version
  on avatar_creator_skill_modules(skill_version_id, created_at);
