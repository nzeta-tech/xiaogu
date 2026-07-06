create extension if not exists pgcrypto;

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  plan_code text not null default 'starter',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete set null,
  name text not null,
  email text not null unique,
  password_hash text not null,
  role text not null default 'broker',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists broker_profiles (
  user_id uuid primary key references users(id) on delete cascade,
  persona text not null default '专业理性，擅长家庭保障和养老规划',
  target_audience text not null default '中产家庭;年轻白领;宝妈家庭',
  specialty text not null default '医疗险;重疾险;养老规划',
  compliance_level text not null default 'standard',
  topic_preference text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table broker_profiles add column if not exists topic_preference text not null default '';

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  title text not null default '新的内容对话',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete set null,
  title text not null default '未命名草稿',
  content text not null,
  platform text not null default 'video_account',
  status text not null default 'draft',
  compliance_risk text not null default 'unchecked',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists compliance_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  draft_id uuid references drafts(id) on delete set null,
  risk_level text not null,
  issues jsonb not null default '[]'::jsonb,
  checked_text text not null,
  created_at timestamptz not null default now()
);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  provider text not null,
  provider_order_id text,
  status text not null default 'pending',
  amount_cents integer not null,
  currency text not null default 'CNY',
  quota_amount integer not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

alter table orders add column if not exists checkout_url text;

create table if not exists usage_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  action_type text not null,
  quota_cost integer not null,
  model text,
  input_tokens integer,
  output_tokens integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists topic_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  source text not null,
  title text not null,
  summary text not null default '',
  insurance_relevance text not null default '中',
  recommended_angle text not null default '',
  risk_note text not null default '',
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_messages_conversation_created_at on messages(conversation_id, created_at);
create index if not exists idx_usage_logs_user_created_at on usage_logs(user_id, created_at desc);
create index if not exists idx_drafts_user_updated_at on drafts(user_id, updated_at desc);
create index if not exists idx_orders_user_created_at on orders(user_id, created_at desc);
