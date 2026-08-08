alter table avatar_contact_cards
  add column if not exists business_card_style text not null default 'classic'
  check (business_card_style in ('classic', 'emerald', 'editorial'));
