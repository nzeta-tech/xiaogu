alter table avatar_creator_skills add column if not exists skill_scope text not null default 'personal';
alter table avatar_creator_skills drop constraint if exists avatar_creator_skills_skill_scope_check;
alter table avatar_creator_skills add constraint avatar_creator_skills_skill_scope_check check (skill_scope in ('personal', 'platform'));
create index if not exists idx_avatar_creator_skills_scope on avatar_creator_skills(skill_scope, status, updated_at desc);
drop index if exists idx_avatar_creator_skills_user_name;
create unique index if not exists idx_avatar_creator_skills_user_scope_name on avatar_creator_skills(user_id, skill_scope, lower(name));
