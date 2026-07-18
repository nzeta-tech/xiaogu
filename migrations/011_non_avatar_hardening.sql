alter table users add column if not exists session_version integer not null default 1;
create index if not exists idx_app_runs_status_created on app_runs(status, created_at desc);
