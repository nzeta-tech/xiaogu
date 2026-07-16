alter table promo_redemptions add column if not exists used_at timestamptz;
alter table promo_redemptions add column if not exists order_id uuid references orders(id) on delete set null;

create unique index if not exists idx_promo_redemptions_order_id
  on promo_redemptions(order_id)
  where order_id is not null;

insert into billing_plans(code, name, quota_amount, amount_cents, currency, description, recommended, status, sort_order)
values
  ('starter_300', '基础包', 300, 9900, 'CNY', '适合个人经纪人试运行，每月稳定产出选题和口播稿。', false, 'active', 10),
  ('pro_1200', '专业包', 1200, 29900, 'CNY', '适合高频运营账号，覆盖热点、脚本、改写和合规检查。', true, 'active', 20),
  ('team_6000', '机构包', 6000, 129900, 'CNY', '适合经纪团队，支持更高频的团队内容生产。', false, 'active', 30)
on conflict (code) do nothing;
