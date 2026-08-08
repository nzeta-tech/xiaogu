alter table avatar_contact_cards
  add column if not exists service_motto text not null default '保险不是推销，是长期的守护';
