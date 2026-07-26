create table if not exists viral_example_cache (
  cache_key text primary key,
  items jsonb not null default '[]'::jsonb,
  fetched_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
