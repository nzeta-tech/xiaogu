alter table spoken_photo_assets add column if not exists source_template_collection text;
alter table spoken_photo_assets add column if not exists source_template_id text;
alter table spoken_photo_assets drop constraint if exists spoken_photo_assets_source_type_check;
alter table spoken_photo_assets add constraint spoken_photo_assets_source_type_check
  check (source_type in ('upload','chanjing','template','face_swap'));
