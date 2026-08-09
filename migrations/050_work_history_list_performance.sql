-- Keep list-page filters independent of potentially multi-megabyte app-run JSON.
alter table works add column if not exists has_avatar_visual boolean not null default false;

update works w
set has_avatar_visual = jsonb_array_length(coalesce(ar.result_json->'avatarVisualAssetIds', '[]'::jsonb)) > 0
from app_runs ar
where ar.id = w.app_run_id
  and w.has_avatar_visual is distinct from (jsonb_array_length(coalesce(ar.result_json->'avatarVisualAssetIds', '[]'::jsonb)) > 0);

create index if not exists idx_works_user_avatar_updated_at
  on works(user_id, updated_at desc)
  where status <> 'archived' and has_avatar_visual = true;
