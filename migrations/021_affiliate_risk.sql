alter table affiliate_accounts add column if not exists registration_ip_hash text;
alter table affiliate_accounts add column if not exists risk_status text not null default 'clear';
alter table affiliate_accounts add column if not exists risk_reason text not null default '';
do $$
begin
  alter table affiliate_accounts add constraint affiliate_accounts_risk_status_check check (risk_status in ('clear', 'review', 'blocked'));
exception when duplicate_object then null;
end $$;
create index if not exists idx_affiliate_accounts_risk_status on affiliate_accounts(risk_status) where risk_status <> 'clear';
