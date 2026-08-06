-- Make the management sequence human-readable and align it with the public display.
-- Offline content is retained for operations but always appears after active content.
with ranked as (
  select id, row_number() over (
    order by case when status = 'offline' then 1 else 0 end,
             is_pinned desc, is_featured desc, sort_order asc, created_at asc, id asc
  )::integer as position
  from viral_contents
  where source_type = 'manual'
)
update viral_contents content
set sort_order = ranked.position
from ranked
where content.id = ranked.id;
