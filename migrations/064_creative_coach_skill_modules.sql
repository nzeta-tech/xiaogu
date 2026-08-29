alter table creative_coach_versions
  add column if not exists skill_modules jsonb not null default '{}'::jsonb;

comment on column creative_coach_versions.skill_modules is
  'Stage-specific coach skill templates: research, brief, writing. Templates may use {{coach_label}}.';
