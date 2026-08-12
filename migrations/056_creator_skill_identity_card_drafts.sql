alter table avatar_creator_skills
  add column if not exists identity_card_draft jsonb not null default '{}'::jsonb;
