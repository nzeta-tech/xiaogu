alter table broker_profiles
add column if not exists topic_preference text not null default '';
