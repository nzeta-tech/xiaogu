create table if not exists avatar_contact_cards (
  user_id uuid primary key references users(id) on delete cascade,
  display_name text not null default '',
  organization text not null default '',
  call_to_action text not null default '扫码联系我',
  placement text not null default 'bottom-right' check (placement in ('bottom-right', 'bottom-bar')),
  enabled_by_default boolean not null default false,
  content_type text,
  original_filename text not null default '',
  image_data bytea,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
