alter table avatar_contact_cards
  drop constraint if exists avatar_contact_cards_business_card_style_check;

alter table avatar_contact_cards
  add constraint avatar_contact_cards_business_card_style_check
  check (business_card_style in ('classic', 'emerald', 'editorial', 'ivory', 'garden', 'lavender'));
