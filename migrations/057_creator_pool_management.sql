-- Cross-platform creator-pool fields. Keep the legacy `status` column for the
-- existing admin enable/pause workflow; `pool_status` is the discovery lifecycle.
alter table viral_creators add column if not exists creator_type text not null default 'unknown';
alter table viral_creators add column if not exists pool_status text not null default 'candidate';
alter table viral_creators add column if not exists tier text;
alter table viral_creators add column if not exists vertical_score double precision not null default 0;
alter table viral_creators add column if not exists professional_score double precision not null default 0;
alter table viral_creators add column if not exists activity_score double precision not null default 0;
alter table viral_creators add column if not exists commercial_score double precision not null default 0;
alter table viral_creators add column if not exists risk_level text not null default 'medium';
alter table viral_creators add column if not exists next_refresh_at timestamptz;
alter table viral_creators add column if not exists last_content_at timestamptz;
alter table viral_creators add column if not exists reviewed_at timestamptz;
alter table viral_creators add column if not exists review_note text;

-- Existing records were already enabled or disabled by operators. Preserve that
-- intent while giving newly discovered accounts the safer candidate status.
update viral_creators
set pool_status = case status
  when 'active' then 'active'
  when 'paused' then 'watchlist'
  when 'excluded' then 'rejected'
  else 'candidate'
end
where pool_status = 'candidate';

update viral_creators vc
set last_content_at = recent.last_content_at
from (
  select creator_id, max(coalesce(published_at, last_seen_at)) as last_content_at
  from viral_works
  where creator_id is not null
  group by creator_id
) recent
where vc.id = recent.creator_id
  and vc.last_content_at is null;

alter table viral_creators drop constraint if exists viral_creators_creator_type_check;
alter table viral_creators add constraint viral_creators_creator_type_check
  check (creator_type in ('personal', 'institution', 'unknown'));
alter table viral_creators drop constraint if exists viral_creators_pool_status_check;
alter table viral_creators add constraint viral_creators_pool_status_check
  check (pool_status in ('candidate', 'active', 'watchlist', 'rejected', 'archived'));
alter table viral_creators drop constraint if exists viral_creators_tier_check;
alter table viral_creators add constraint viral_creators_tier_check
  check (tier is null or tier in ('S', 'A', 'potential'));
alter table viral_creators drop constraint if exists viral_creators_risk_level_check;
alter table viral_creators add constraint viral_creators_risk_level_check
  check (risk_level in ('low', 'medium', 'high'));

-- The scheduled refresh job can select accounts without per-platform tables.
create index if not exists idx_viral_creators_pool_refresh
  on viral_creators(platform, pool_status, next_refresh_at nulls first, tier, quality_score desc);
create index if not exists idx_viral_creators_pool_candidates
  on viral_creators(platform, pool_status, vertical_score desc, professional_score desc, quality_score desc);
create index if not exists idx_viral_creators_pool_risk
  on viral_creators(platform, creator_type, risk_level);
