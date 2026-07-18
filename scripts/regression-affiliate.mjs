import { Pool } from "pg";

const base = process.env.REGRESSION_BASE_URL ?? "http://localhost:3000";
const marker = process.env.REGRESSION_MARKER ?? "codex-affiliate";
const password = process.env.REGRESSION_PASSWORD ?? "Regression123!";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function login(email) {
  const response = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
  assert(response.ok, `login failed: ${response.status} ${await response.text()}`);
  return response.headers.get("set-cookie")?.split(";")[0] ?? "";
}

async function request(cookie, path, options = {}) {
  const response = await fetch(`${base}${path}`, { ...options, headers: { cookie, ...(options.body ? { "content-type": "application/json" } : {}), ...(options.headers ?? {}) } });
  const text = await response.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  return { response, body };
}

let originalAffiliate;
try {
  const users = await pool.query("select email, role from users where email like 'codex-regression-%@example.com' order by created_at desc");
  const inviter = users.rows.find((item) => item.role === "broker");
  const admin = users.rows.find((item) => item.role === "admin");
  assert(inviter && admin, "run regression-fixture.mjs setup first");
  const inviterCookie = await login(inviter.email);
  const adminCookie = await login(admin.email);
  const settingsResult = await request(adminCookie, "/api/admin/settings");
  assert(settingsResult.response.ok, "admin settings unavailable");
  originalAffiliate = settingsResult.body.settings.affiliate;
  const enable = await request(adminCookie, "/api/admin/settings", { method: "PATCH", body: JSON.stringify({ affiliate: { enabled: true, rebateRatePercent: 20, freezeHours: 0, durationDays: 0, perInviteeCap: 1000 } }) });
  assert(enable.response.ok, `enable affiliate failed: ${JSON.stringify(enable.body)}`);

  const inviterDetail = await request(inviterCookie, "/api/affiliate");
  assert(inviterDetail.response.ok, "inviter affiliate detail failed");
  const referralCode = inviterDetail.body.affiliate.account.referral_code;
  const suffix = Date.now();
  const inviteeEmail = `${marker}-invitee-${suffix}@example.com`;
  const register = await fetch(`${base}/api/auth/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "返利受邀用户", email: inviteeEmail, password, referralCode, acceptedTerms: true }) });
  assert(register.ok, `invitee register failed: ${register.status} ${await register.text()}`);
  const invitee = (await pool.query("select id from users where email=$1", [inviteeEmail])).rows[0];
  const order = (await pool.query(
    `insert into orders(user_id, provider, status, amount_cents, currency, quota_amount, metadata)
     values ($1, 'regression', 'pending', 9900, 'CNY', 100, $2::jsonb) returning id`,
    [invitee.id, JSON.stringify({ marker })],
  )).rows[0];
  const paid = await request(adminCookie, "/api/admin/orders", { method: "PATCH", body: JSON.stringify({ orderId: order.id, status: "paid" }) });
  assert(paid.response.ok, `mark paid failed: ${JSON.stringify(paid.body)}`);
  const afterPaid = await request(inviterCookie, "/api/affiliate");
  assert(afterPaid.body.affiliate.account.available_credits === 20, `expected 20 available credits: ${JSON.stringify(afterPaid.body)}`);
  assert(afterPaid.body.affiliate.invitees.some((item) => item.email === inviteeEmail && item.rebate_credits === 20), "invitee rebate missing");
  const duplicatePaid = await request(adminCookie, "/api/admin/orders", { method: "PATCH", body: JSON.stringify({ orderId: order.id, status: "paid" }) });
  assert(duplicatePaid.response.ok, "idempotent paid update failed");
  const accrualCount = Number((await pool.query("select count(*) from affiliate_ledger where source_order_id=$1 and action='accrue'", [order.id])).rows[0].count);
  assert(accrualCount === 1, `duplicate rebate accrual detected: ${accrualCount}`);
  const adminRecords = await request(adminCookie, "/api/admin/affiliates");
  assert(adminRecords.response.ok && adminRecords.body.records.some((item) => item.invitee_email === inviteeEmail), "admin affiliate record missing");

  const transfer = await request(inviterCookie, "/api/affiliate", { method: "POST" });
  assert(transfer.response.ok && transfer.body.transfer.credits === 20, `transfer failed: ${JSON.stringify(transfer.body)}`);
  const refunded = await request(adminCookie, "/api/admin/orders", { method: "PATCH", body: JSON.stringify({ orderId: order.id, status: "refunded" }) });
  assert(refunded.response.ok, `refund failed: ${JSON.stringify(refunded.body)}`);
  const afterRefund = await request(inviterCookie, "/api/affiliate");
  assert(afterRefund.body.affiliate.account.available_credits === 0, "available rebate should remain zero after refund");
  assert(afterRefund.body.affiliate.invitees.find((item) => item.email === inviteeEmail)?.rebate_credits === 0, "refunded rebate should be net zero");
  const giftNet = Number((await pool.query("select coalesce(sum(quota_amount),0) total from gift_records where user_id=(select id from users where email=$1) and source_type in ('affiliate','affiliate_reversal')", [inviter.email])).rows[0].total);
  assert(giftNet === 0, `transferred rebate was not reversed: ${giftNet}`);
  const ledger = await pool.query("select action,credits from affiliate_ledger where source_order_id=$1 order by created_at", [order.id]);
  assert(ledger.rows.map((item) => item.action).join(",") === "accrue,reverse", `unexpected ledger: ${JSON.stringify(ledger.rows)}`);
  console.log(JSON.stringify({ ok: true, referralCode, inviteeEmail, orderId: order.id, rebateCredits: 20, refundReversed: true }));
} finally {
  if (originalAffiliate) {
    await pool.query(
      `insert into system_settings(setting_key, setting_value) values ('affiliate', $1::jsonb)
       on conflict (setting_key) do update set setting_value=excluded.setting_value, updated_at=now()`,
      [JSON.stringify(originalAffiliate)],
    );
  }
  await pool.query("delete from users where email like $1", [`${marker}-%@example.com`]);
  await pool.end();
}
