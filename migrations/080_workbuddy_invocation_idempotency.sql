alter table workbuddy_capability_invocations
  add column if not exists idempotency_key text;

create unique index if not exists uq_workbuddy_invocations_idempotency_key
  on workbuddy_capability_invocations(idempotency_key)
  where idempotency_key is not null;
