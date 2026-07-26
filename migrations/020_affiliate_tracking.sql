create table if not exists affiliate_visits (
  id uuid primary key default gen_random_uuid(),
  referral_code text not null,
  user_agent text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_affiliate_visits_code_created_at
on affiliate_visits(referral_code, created_at desc);
