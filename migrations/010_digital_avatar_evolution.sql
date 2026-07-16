create table if not exists avatar_memory_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  source_type text not null default 'manual',
  title text not null default '',
  content text not null default '',
  status text not null default 'active' check (status in ('active', 'disabled', 'archived')),
  sensitivity text not null default 'normal' check (sensitivity in ('normal', 'sensitive', 'restricted')),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_avatar_memory_sources_user_updated
on avatar_memory_sources(user_id, updated_at desc);

create table if not exists avatar_memory_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  category text not null check (category in ('identity', 'audience', 'expertise', 'expression', 'story', 'boundary', 'temporary')),
  title text not null default '',
  content text not null,
  source_id uuid references avatar_memory_sources(id) on delete set null,
  origin text not null default 'user' check (origin in ('user', 'imported', 'behavior', 'inferred', 'system')),
  status text not null default 'active' check (status in ('candidate', 'active', 'archived')),
  confidence integer not null default 100 check (confidence between 0 and 100),
  sensitivity text not null default 'normal' check (sensitivity in ('normal', 'sensitive', 'restricted')),
  usage_scope text not null default 'all' check (usage_scope in ('all', 'content', 'customer', 'private')),
  expires_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_avatar_memory_items_user_status
on avatar_memory_items(user_id, status, category, updated_at desc);

create table if not exists avatar_feedback_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  work_id text,
  event_type text not null,
  before_text text not null default '',
  after_text text not null default '',
  feedback_text text not null default '',
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_avatar_feedback_events_user_created
on avatar_feedback_events(user_id, created_at desc);

create table if not exists avatar_evolution_proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  category text not null,
  title text not null,
  description text not null default '',
  confidence integer not null default 60 check (confidence between 0 and 100),
  evidence_json jsonb not null default '[]'::jsonb,
  patch_json jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists idx_avatar_evolution_proposals_user_status
on avatar_evolution_proposals(user_id, status, created_at desc);

create table if not exists avatar_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  version integer not null,
  label text not null default '',
  snapshot_json jsonb not null default '{}'::jsonb,
  change_summary text not null default '',
  source text not null default 'system',
  status text not null default 'active' check (status in ('active', 'superseded', 'restored')),
  created_at timestamptz not null default now(),
  unique(user_id, version)
);

create index if not exists idx_avatar_versions_user_version
on avatar_versions(user_id, version desc);

create table if not exists avatar_usage_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  work_id text,
  avatar_version integer,
  memory_ids uuid[] not null default '{}',
  context_type text not null default 'content',
  created_at timestamptz not null default now()
);

create index if not exists idx_avatar_usage_logs_user_created
on avatar_usage_logs(user_id, created_at desc);

create table if not exists avatar_privacy_settings (
  user_id uuid primary key references users(id) on delete cascade,
  learning_enabled boolean not null default true,
  behavior_learning_enabled boolean not null default true,
  customer_memory_enabled boolean not null default false,
  auto_inference_enabled boolean not null default true,
  settings_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
