create table if not exists digital_human_template_favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  collection text not null check (collection in ('expressive', 'production')),
  template_id text not null,
  template_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(user_id, collection, template_id)
);

create index if not exists idx_digital_human_template_favorites_user
  on digital_human_template_favorites(user_id, created_at desc);
