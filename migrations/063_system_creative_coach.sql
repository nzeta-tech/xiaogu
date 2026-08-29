alter table creative_coaches add column if not exists is_system boolean not null default false;
create unique index if not exists idx_creative_coaches_single_system on creative_coaches(is_system) where is_system=true;
