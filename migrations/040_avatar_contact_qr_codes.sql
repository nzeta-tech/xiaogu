create table if not exists avatar_contact_qr_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  label text not null default '',
  content_type text not null default 'image/png',
  image_data bytea not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_avatar_contact_qr_codes_user_updated on avatar_contact_qr_codes(user_id, updated_at desc);

alter table avatar_contact_cards add column if not exists default_qr_code_id uuid;

insert into avatar_contact_qr_codes(user_id, label, content_type, image_data, created_at, updated_at)
select user_id, original_filename, coalesce(content_type, 'image/png'), image_data, created_at, updated_at
from avatar_contact_cards
where image_data is not null
  and not exists (select 1 from avatar_contact_qr_codes q where q.user_id = avatar_contact_cards.user_id);

update avatar_contact_cards c set default_qr_code_id = q.id
from avatar_contact_qr_codes q
where q.user_id = c.user_id and c.default_qr_code_id is null;

alter table avatar_contact_cards
  add constraint avatar_contact_cards_default_qr_code_fk
  foreign key (default_qr_code_id) references avatar_contact_qr_codes(id) on delete set null;
