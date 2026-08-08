alter table avatar_contact_qr_codes
  add column if not exists original_content_type text,
  add column if not exists original_image_data bytea;
