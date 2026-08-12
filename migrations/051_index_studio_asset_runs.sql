-- migrate:no-transaction
-- Work detail and stream polling resolve the latest Studio image and cover runs
-- by identifiers stored in app_runs.input_payload. Without an expression index,
-- every poll scans app_runs and can exhaust all Web connection pools.
create index concurrently if not exists idx_app_runs_studio_asset_lookup
  on app_runs (
    (input_payload->>'studio_work_id'),
    (input_payload->>'studio_parent'),
    app_id,
    created_at desc
  )
  where input_payload->>'studio_parent' in ('wechat-studio', 'xiaohongshu-studio');
