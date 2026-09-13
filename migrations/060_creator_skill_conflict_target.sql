-- Ensure the unique key used when creating a creator skill matches the
-- distinction between content-creation and lead-coach skills.
drop index if exists idx_avatar_creator_skills_user_name;

create unique index if not exists idx_avatar_creator_skills_user_scope_purpose_name
  on avatar_creator_skills(user_id, skill_scope, training_purpose, lower(name));
