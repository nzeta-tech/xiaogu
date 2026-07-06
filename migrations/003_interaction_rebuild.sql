create table if not exists questionnaire_templates (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  version integer not null default 1,
  description text not null default '',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists questionnaire_template_sections (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references questionnaire_templates(id) on delete cascade,
  section_key text not null,
  title text not null,
  description text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (template_id, section_key)
);

create table if not exists questionnaire_template_questions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references questionnaire_templates(id) on delete cascade,
  section_id uuid not null references questionnaire_template_sections(id) on delete cascade,
  question_key text not null,
  question_text text not null,
  helper_text text not null default '',
  placeholder text not null default '',
  input_type text not null default 'textarea',
  is_required boolean not null default true,
  sort_order integer not null default 0,
  config_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (template_id, question_key)
);

create table if not exists profile_questionnaires (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  template_id uuid not null references questionnaire_templates(id) on delete restrict,
  status text not null default 'draft',
  source text not null default 'user_fill',
  completion_percent integer not null default 0,
  summary_text text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz
);

create table if not exists profile_questionnaire_answers (
  id uuid primary key default gen_random_uuid(),
  questionnaire_id uuid not null references profile_questionnaires(id) on delete cascade,
  section_key text not null,
  question_key text not null,
  answer_text text not null default '',
  answer_json jsonb not null default '{}'::jsonb,
  answer_source text not null default 'typed',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (questionnaire_id, question_key)
);

create table if not exists app_categories (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text not null default '',
  sort_order integer not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists apps (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references app_categories(id) on delete set null,
  code text not null unique,
  slug text not null unique,
  name text not null,
  emoji text not null default '',
  description text not null default '',
  badge text,
  points_cost integer not null default 0,
  result_type text not null default 'text',
  prompt_strategy text not null default 'default',
  requires_thinking boolean not null default false,
  featured boolean not null default false,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app_input_fields (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  field_key text not null,
  label text not null,
  field_type text not null,
  is_required boolean not null default false,
  placeholder text not null default '',
  helper_text text not null default '',
  options_json jsonb not null default '[]'::jsonb,
  config_json jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (app_id, field_key)
);

create table if not exists app_examples (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  slug text not null unique,
  title text not null,
  summary text not null default '',
  content_json jsonb not null default '{}'::jsonb,
  status text not null default 'active',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  app_id uuid references apps(id) on delete set null,
  questionnaire_id uuid references profile_questionnaires(id) on delete set null,
  status text not null default 'running',
  tone text,
  target_channels text[] not null default '{}',
  input_payload jsonb not null default '{}'::jsonb,
  resolved_prompt text not null default '',
  result_text text not null default '',
  result_json jsonb not null default '{}'::jsonb,
  error_message text,
  quota_cost integer not null default 0,
  model text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists works (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  app_run_id uuid references app_runs(id) on delete set null,
  app_id uuid references apps(id) on delete set null,
  conversation_id uuid references conversations(id) on delete set null,
  title text not null default '未命名作品',
  content_type text not null default 'text',
  source_channel text not null default '',
  status text not null default 'draft',
  is_favorite boolean not null default false,
  is_used boolean not null default false,
  note text not null default '',
  compliance_risk text not null default 'unchecked',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists work_versions (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references works(id) on delete cascade,
  version_no integer not null,
  content text not null,
  content_json jsonb not null default '{}'::jsonb,
  created_from text not null default 'generation',
  created_at timestamptz not null default now(),
  unique (work_id, version_no)
);

alter table broker_profiles add column if not exists display_name text not null default '';
alter table broker_profiles add column if not exists ip_tagline text not null default '';
alter table broker_profiles add column if not exists profile_summary text not null default '';
alter table broker_profiles add column if not exists brand_keywords text[] not null default '{}';
alter table broker_profiles add column if not exists content_style_summary text not null default '';
alter table broker_profiles add column if not exists source_questionnaire_id uuid references profile_questionnaires(id) on delete set null;

create index if not exists idx_profile_questionnaires_user_updated_at on profile_questionnaires(user_id, updated_at desc);
create index if not exists idx_profile_questionnaire_answers_questionnaire on profile_questionnaire_answers(questionnaire_id, sort_order);
create index if not exists idx_apps_category_sort on apps(category_id, sort_order);
create index if not exists idx_app_runs_user_created_at on app_runs(user_id, created_at desc);
create index if not exists idx_works_user_updated_at on works(user_id, updated_at desc);
create index if not exists idx_work_versions_work_version_no on work_versions(work_id, version_no desc);
