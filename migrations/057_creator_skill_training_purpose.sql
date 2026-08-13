alter table avatar_creator_skills
  add column if not exists training_purpose text not null default 'content';

alter table avatar_creator_skills
  drop constraint if exists avatar_creator_skills_training_purpose_check;

alter table avatar_creator_skills
  add constraint avatar_creator_skills_training_purpose_check
  check (training_purpose in ('content', 'lead-coach'));

create index if not exists idx_avatar_creator_skills_scope_purpose_updated
  on avatar_creator_skills(skill_scope, training_purpose, updated_at desc);

drop index if exists idx_avatar_creator_skills_user_scope_name;
create unique index if not exists idx_avatar_creator_skills_user_scope_purpose_name
  on avatar_creator_skills(user_id, skill_scope, training_purpose, lower(name));
