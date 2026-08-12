create table if not exists wechat_channel_discovery_cache (
  cache_key text primary key,
  cache_scope text not null check (cache_scope in ('account', 'page')),
  payload jsonb,
  refresh_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default now()
);

create index if not exists idx_wechat_channel_discovery_cache_expiry
  on wechat_channel_discovery_cache(expires_at);
