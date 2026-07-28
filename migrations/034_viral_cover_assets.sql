create table if not exists viral_content_cover_assets (
  viral_content_id uuid primary key references viral_contents(id) on delete cascade,
  content_type text not null,
  image_data bytea not null,
  source_url text not null,
  sha256 text not null,
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
