create table if not exists link_remix_source_cache (
  cache_key text primary key,
  source_url text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists idx_link_remix_source_cache_expiry
  on link_remix_source_cache(expires_at);
