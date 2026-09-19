-- Every edit is a separate job/media namespace. Original media are never replaced.
create index if not exists digital_video_version_family on digital_human_video_jobs(user_id,(request_json->>'root_job_id')) where request_json ? 'root_job_id';
create unique index if not exists digital_video_version_number on digital_human_video_jobs((request_json->>'root_job_id'),(request_json->>'revision_number')) where request_json ? 'root_job_id';
create unique index if not exists digital_video_version_request on digital_human_video_jobs(user_id,(request_json->>'root_job_id'),(request_json->>'revision_request_id')) where request_json ? 'revision_request_id';
create unique index if not exists digital_video_one_active_revision on digital_human_video_jobs((request_json->>'root_job_id')) where request_json ? 'root_job_id' and status in ('queued','processing');
