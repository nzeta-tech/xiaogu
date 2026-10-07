-- Commercial pricing v1: one free acquisition app, simple creation tiers,
-- two spoken-video modes, and four equally presented prepaid packages.

update apps
set points_cost = case
  when slug = 'image-card' then 0
  when slug in ('xiaohongshu-studio', 'wechat-studio', 'ppt-maker', 'link-remix', 'lead-package') then 15
  when slug = 'digital-human-video' then 30
  else 5
end,
updated_at = now();

update billing_plans
set status = 'inactive', recommended = false, updated_at = now()
where code not in ('trial_29', 'creator_100', 'professional_300', 'team_1000');

insert into billing_plans(code, name, quota_amount, amount_cents, currency, description, recommended, status, sort_order)
values
  ('trial_29', '体验包', 29, 2990, 'CNY', '低门槛体验小谷的完整创作能力。', false, 'active', 10),
  ('creator_100', '创作包', 100, 9990, 'CNY', '适合日常文案、选题和内容制作。', false, 'active', 20),
  ('professional_300', '专业包', 300, 29990, 'CNY', '适合持续运营和口播视频生产。', false, 'active', 30),
  ('team_1000', '团队包', 1000, 99990, 'CNY', '适合工作室及团队高频使用。', false, 'active', 40)
on conflict (code) do update set
  name = excluded.name,
  quota_amount = excluded.quota_amount,
  amount_cents = excluded.amount_cents,
  currency = excluded.currency,
  description = excluded.description,
  recommended = excluded.recommended,
  status = excluded.status,
  sort_order = excluded.sort_order,
  updated_at = now();
