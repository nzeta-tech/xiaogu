create table if not exists avatar_coach_courses (
  id uuid primary key default gen_random_uuid(),
  skill_id uuid not null unique references avatar_creator_skills(id) on delete cascade,
  title text not null,
  summary text not null default '',
  modules_json jsonb not null default '[]'::jsonb,
  status text not null default 'active' check (status in ('draft', 'active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists avatar_coach_course_progress (
  user_id uuid not null references users(id) on delete cascade,
  course_id uuid not null references avatar_coach_courses(id) on delete cascade,
  module_key text not null,
  status text not null default 'started' check (status in ('started', 'completed')),
  updated_at timestamptz not null default now(),
  primary key (user_id, course_id, module_key)
);
