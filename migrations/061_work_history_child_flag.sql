-- Keep work-history reads independent of large app_runs.input_payload values.
alter table works
  add column if not exists is_history_child boolean not null default false;

create or replace function set_work_history_child_flag()
returns trigger
language plpgsql
as $$
begin
  select exists (
    select 1
    from app_runs ar
    where ar.id = new.app_run_id
      and (
        ar.input_payload->>'studio_parent' in ('wechat-studio', 'xiaohongshu-studio')
        or nullif(ar.input_payload->>'traffic_parent_work_id', '') is not null
      )
  ) into new.is_history_child;
  return new;
end;
$$;

drop trigger if exists works_history_child_flag on works;
create trigger works_history_child_flag
before insert or update of app_run_id on works
for each row execute function set_work_history_child_flag();

create or replace function refresh_work_history_child_flag()
returns trigger
language plpgsql
as $$
begin
  update works
  set is_history_child = coalesce((
    new.input_payload->>'studio_parent' in ('wechat-studio', 'xiaohongshu-studio')
    or nullif(new.input_payload->>'traffic_parent_work_id', '') is not null
  ), false)
  where app_run_id = new.id;
  return new;
end;
$$;

drop trigger if exists app_runs_refresh_work_history_child_flag on app_runs;
create trigger app_runs_refresh_work_history_child_flag
after update of input_payload on app_runs
for each row execute function refresh_work_history_child_flag();

update works w
set is_history_child = true
from app_runs ar
where ar.id = w.app_run_id
  and (
    ar.input_payload->>'studio_parent' in ('wechat-studio', 'xiaohongshu-studio')
    or nullif(ar.input_payload->>'traffic_parent_work_id', '') is not null
  )
  and not w.is_history_child;

create index if not exists idx_works_user_history_updated_at
  on works(user_id, updated_at desc)
  where status <> 'archived' and not is_history_child;
