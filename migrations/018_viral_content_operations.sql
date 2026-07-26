create table if not exists viral_contents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  platform text not null,
  content_type text not null default '短视频',
  category text not null default '其他',
  tags jsonb not null default '[]'::jsonb,
  source_url text not null,
  source_title text not null default '',
  source_author text not null default '',
  thumbnail_url text,
  media_url text,
  embed_url text,
  article_body text not null default '',
  summary text not null default '',
  metric_label text not null default '热度待核验',
  metric_value integer,
  metric_unit text not null default '',
  insight text not null default '',
  creation_scenes jsonb not null default '[]'::jsonb,
  risk_note text not null default '',
  source_type text not null default 'manual',
  status text not null default 'draft',
  is_pinned boolean not null default false,
  is_featured boolean not null default false,
  sort_order integer not null default 0,
  publish_at timestamptz,
  expire_at timestamptz,
  created_by uuid references users(id) on delete set null,
  updated_by uuid references users(id) on delete set null,
  reviewed_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_viral_contents_public_order
  on viral_contents(status, is_pinned desc, is_featured desc, sort_order, publish_at, updated_at desc);
create index if not exists idx_viral_contents_category on viral_contents(category);
