alter table avatar_contact_cards
  add column if not exists phone text not null default '',
  add column if not exists email text not null default '';
