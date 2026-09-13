alter table digital_human_video_jobs add column if not exists edition text;
update digital_human_video_jobs set edition=case when provider='heygen' then 'pro' else 'standard' end where edition is null;
alter table digital_human_video_jobs alter column edition set not null;
do $$ begin alter table digital_human_video_jobs add constraint digital_human_video_jobs_edition_check check(edition in ('standard','pro')); exception when duplicate_object then null; end $$;
