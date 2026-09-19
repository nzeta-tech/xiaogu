-- Application admission is independent of credit balance and account role.
alter table apps add column if not exists access_policy text not null default 'credits'
  check (access_policy in ('credits', 'paid_customer'));
update apps set access_policy='paid_customer' where slug='digital-human-video';

-- Only verified payment handlers write receipts. Gifts/admin status edits never do.
create table if not exists verified_payment_receipts (
  order_id uuid primary key references orders(id) on delete cascade,
  source text not null check (source in ('stripe_live', 'easypay_verified', 'manual_verified')),
  reference text not null,
  amount_cents integer not null check (amount_cents > 0),
  refunded_cents integer not null default 0 check (refunded_cents >= 0),
  currency text not null,
  verified_at timestamptz not null default now(),
  unique(source, reference)
);

-- Historical offline transfers require an approved review and an attached receipt.
insert into verified_payment_receipts(order_id,source,reference,amount_cents,currency,verified_at)
select o.id,'manual_verified',r.id::text,o.amount_cents,upper(o.currency),r.reviewed_at
from orders o join payment_manual_reviews r on r.order_id=o.id
where o.provider='manual' and o.status in ('paid','completed') and o.amount_cents>0
  and r.status='approved' and r.reviewed_by is not null and r.reviewed_at is not null
  and btrim(r.receipt_url)<>''
on conflict do nothing;
-- Online history needs provider verification; status='paid' alone is not proof.

-- Refunds can arrive before the checkout callback; retain that evidence too.
create table if not exists verified_payment_refunds (
  source text not null,
  reference text not null,
  refunded_cents integer not null check (refunded_cents >= 0),
  primary key(source,reference)
);

-- The standalone video path records its configured price at admission. Older
-- jobs remain unpriced; completion/repeated progress callbacks charge only once.
alter table digital_human_video_jobs add column if not exists quota_cost integer check (quota_cost >= 0);
create unique index if not exists usage_logs_digital_video_once
  on usage_logs ((metadata->>'digitalHumanVideoJobId'))
  where metadata ? 'digitalHumanVideoJobId';
create or replace function charge_completed_digital_video() returns trigger language plpgsql as $$
begin
  if new.status='completed' and new.quota_cost is not null and new.quota_cost>0 then
    insert into usage_logs(user_id,action_type,quota_cost,metadata)
    values(new.user_id,'write_script',new.quota_cost,
      jsonb_build_object('appSlug','digital-human-video','digitalHumanVideoJobId',new.id::text))
    on conflict do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists charge_completed_digital_video on digital_human_video_jobs;
create trigger charge_completed_digital_video after update of status on digital_human_video_jobs
  for each row execute function charge_completed_digital_video();
