create table if not exists announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  kind text not null default 'notice',
  placement text not null default 'global',
  status text not null default 'draft',
  link_url text,
  is_pinned boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  reward_type text not null default 'credit',
  credit_amount integer not null default 0,
  discount_percent integer not null default 0,
  status text not null default 'active',
  max_redemptions integer not null default 1,
  redeemed_count integer not null default 0,
  starts_at timestamptz,
  expires_at timestamptz,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists promo_redemptions (
  id uuid primary key default gen_random_uuid(),
  promo_code_id uuid not null references promo_codes(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  credit_amount integer not null default 0,
  discount_percent integer not null default 0,
  created_at timestamptz not null default now(),
  unique (promo_code_id, user_id)
);

create table if not exists gift_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  source_type text not null default 'admin',
  source_label text not null default '',
  quota_amount integer not null default 0,
  status text not null default 'granted',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists system_settings (
  setting_key text primary key,
  setting_value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists idx_announcements_status_published_at on announcements(status, published_at desc);
create index if not exists idx_promo_codes_status on promo_codes(status);
create index if not exists idx_gift_records_user_created_at on gift_records(user_id, created_at desc);
