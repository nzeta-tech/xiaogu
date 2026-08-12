create table if not exists creation_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  task_type text not null,
  title text not null default '未命名任务',
  status text not null default 'creating',
  source_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table works add column if not exists creation_task_id uuid references creation_tasks(id) on delete set null;

create index if not exists idx_creation_tasks_user_updated_at
  on creation_tasks(user_id, updated_at desc);

create index if not exists idx_works_creation_task_id
  on works(creation_task_id, updated_at desc)
  where creation_task_id is not null;
