import { createServer } from "node:http";
import { rm } from "node:fs/promises";
import path from "node:path";
import { generate } from "otplib";
import { Pool } from "pg";
import { SMTPServer } from "smtp-server";

const base = process.env.REGRESSION_BASE_URL ?? "http://127.0.0.1:3000";
const password = process.env.REGRESSION_PASSWORD ?? "Regression123!";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const backupDirectory = process.env.DATABASE_BACKUP_DIR ?? path.resolve(process.cwd(), "..", ".xiaogu-backups");
const messages = [];
const objects = new Map();
const s3Methods = [];

function assert(condition, message) { if (!condition) throw new Error(message); }
async function login(email, extra = {}) {
  const response = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password, ...extra }) });
  const text = await response.text(); let body; try { body = JSON.parse(text); } catch { body = text; }
  return { response, body, cookie: response.headers.get("set-cookie")?.split(";")[0] ?? "" };
}
async function request(cookie, route, options = {}) {
  const response = await fetch(`${base}${route}`, { ...options, headers: { cookie, ...(options.body ? { "content-type": "application/json" } : {}), ...(options.headers ?? {}) } });
  const text = await response.text(); let body; try { body = JSON.parse(text); } catch { body = text; }
  return { response, body };
}
async function waitForMessages(count) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (messages.length >= count) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`expected ${count} SMTP messages, received ${messages.length}`);
}

const smtp = new SMTPServer({ disabledCommands: ["AUTH"], hideSTARTTLS: true, onData(stream, _session, callback) {
  let raw = ""; stream.on("data", (chunk) => { raw += chunk.toString(); }); stream.on("end", () => { messages.push(raw); callback(); });
} });
const s3 = createServer((req, res) => {
  const pathname = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
  s3Methods.push(`${req.method} ${pathname}`);
  if (req.method === "HEAD") { res.writeHead(200); res.end(); return; }
  if (req.method === "PUT") {
    const chunks = []; req.on("data", (chunk) => chunks.push(chunk)); req.on("end", () => { objects.set(pathname, Buffer.concat(chunks)); res.writeHead(200, { etag: '"regression"' }); res.end(); }); return;
  }
  if (req.method === "GET") {
    const data = objects.get(pathname); if (!data) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "content-length": String(data.length), "content-type": "application/gzip" }); res.end(data); return;
  }
  if (req.method === "DELETE") { objects.delete(pathname); res.writeHead(204); res.end(); return; }
  res.writeHead(405); res.end();
});

await Promise.all([
  new Promise((resolve, reject) => smtp.listen(2528, "127.0.0.1", (error) => error ? reject(error) : resolve())),
  new Promise((resolve, reject) => s3.listen(4569, "127.0.0.1", (error) => error ? reject(error) : resolve())),
]);

const originalRows = await pool.query("select setting_key,setting_value from system_settings");
const originalSettings = new Map(originalRows.rows.map((row) => [row.setting_key, row.setting_value]));
const initialBackupIds = new Set((await pool.query("select id from database_backups")).rows.map((row) => row.id));
let temporaryUserId = "";

try {
  const fixture = await pool.query("select id,email,role,organization_id,password_hash from users where email like 'codex-regression-%@example.com' order by created_at desc");
  const admin = fixture.rows.find((row) => row.role === "admin");
  const broker = fixture.rows.find((row) => row.role === "broker");
  assert(admin && broker, "run regression-fixture.mjs setup first");
  let adminCookie = (await login(admin.email)).cookie;
  let brokerCookie = (await login(broker.email)).cookie;
  assert(adminCookie && brokerCookie, "fixture login failed");

  const currentResult = await request(adminCookie, "/api/admin/settings");
  assert(currentResult.response.ok, "admin settings unavailable");
  let settings = currentResult.body.settings;

  const brandMarker = `扩展设置回归-${Date.now()}`;
  const site = { ...settings.site, logoUrl: "/brand/regression-logo.png", helpUrl: "https://help.example.com/xiaogu", homeContent: brandMarker, customNavItems: [{ id: "regression-docs", label: "回归文档", url: "https://docs.example.com", visibility: "user", sortOrder: 10 }] };
  const legal = { ...settings.legal, documents: [...settings.legal.documents, { slug: "refund-policy", title: "退款政策", content: `## ${brandMarker}\n\n退款规则正文。` }] };
  const brandSaved = await request(adminCookie, "/api/admin/settings", { method: "PATCH", body: JSON.stringify({ site, legal }) });
  assert(brandSaved.response.ok, `brand/legal settings failed: ${JSON.stringify(brandSaved.body)}`);
  const publicConfig = await request("", "/api/system/public-config");
  assert(publicConfig.body.site.logoUrl === site.logoUrl && publicConfig.body.site.customNavItems[0]?.id === "regression-docs", "public brand/navigation config missing");
  const legalPage = await fetch(`${base}/legal/refund-policy`);
  assert(legalPage.ok && (await legalPage.text()).includes(brandMarker), "dynamic legal document did not render");
  settings = brandSaved.body.settings;

  const plan = (await pool.query("select code,amount_cents,quota_amount from billing_plans where status='active' order by amount_cents limit 1")).rows[0];
  assert(plan, "active billing plan missing");
  const payment = { ...settings.payment, minPurchaseCredits: 1, maxPurchaseCredits: 1000000, minOrderAmountCents: 0, maxOrderAmountCents: 100000000, dailyPaidAmountLimitCents: 100000000, feeRatePercent: 2.5 };
  const paymentSaved = await request(adminCookie, "/api/admin/settings", { method: "PATCH", body: JSON.stringify({ payment }) });
  assert(paymentSaved.response.ok, `payment settings failed: ${JSON.stringify(paymentSaved.body)}`);
  const quote = await request(brokerCookie, "/api/billing/quote", { method: "POST", body: JSON.stringify({ planCode: plan.code }) });
  const expectedFee = Math.ceil(plan.amount_cents * 0.025);
  assert(quote.response.ok && quote.body.quote.feeCents === expectedFee && quote.body.quote.finalAmountCents === plan.amount_cents + expectedFee, `payment quote mismatch: ${JSON.stringify(quote.body)}`);
  const rejectedAmount = await request(adminCookie, "/api/admin/settings", { method: "PATCH", body: JSON.stringify({ payment: { ...payment, minOrderAmountCents: plan.amount_cents + 1 } }) });
  assert(rejectedAmount.response.ok, "failed to configure payment floor");
  assert((await request(brokerCookie, "/api/billing/quote", { method: "POST", body: JSON.stringify({ planCode: plan.code }) })).response.status === 403, "payment amount floor was not enforced");
  const existingPaid = Number((await pool.query("select coalesce(sum(amount_cents),0)::text total from orders where user_id=$1 and status='paid' and paid_at >= date_trunc('day', now() at time zone 'Asia/Shanghai') at time zone 'Asia/Shanghai'", [broker.id])).rows[0].total);
  const dailySaved = await request(adminCookie, "/api/admin/settings", { method: "PATCH", body: JSON.stringify({ payment: { ...payment, dailyPaidAmountLimitCents: Math.max(1, existingPaid) } }) });
  assert(dailySaved.response.ok, "failed to configure daily payment limit");
  const dailyRejected = await request(brokerCookie, "/api/billing/orders", { method: "POST", body: JSON.stringify({ planCode: plan.code, provider: "stripe" }) });
  assert(dailyRejected.response.status === 429, `daily payment cap not enforced: ${dailyRejected.response.status} ${JSON.stringify(dailyRejected.body)}`);

  const email = { ...settings.email, enabled: true, host: "127.0.0.1", port: 2528, secure: false, username: "", fromEmail: "noreply@xiaogu.test", fromName: "小谷回归", lowBalanceSubject: "LOW_BALANCE_MARKER {{balance}}", lowBalanceBody: "LOW_BODY_MARKER {{name}} {{threshold}} {{url}}" };
  const lowBalancePayment = { ...payment, lowBalanceNotifyEnabled: true, lowBalanceThreshold: 1000000, lowBalanceCooldownHours: 24 };
  const emailSaved = await request(adminCookie, "/api/admin/settings", { method: "PATCH", body: JSON.stringify({ email, payment: lowBalancePayment }) });
  assert(emailSaved.response.ok, `low-balance settings failed: ${JSON.stringify(emailSaved.body)}`);
  await pool.query("delete from credit_notification_state where user_id=$1", [broker.id]);
  const notification = await request(adminCookie, "/api/admin/email/test", { method: "POST", body: JSON.stringify({ kind: "low_balance", userId: broker.id }) });
  assert(notification.response.ok, `low-balance notification failed: ${JSON.stringify(notification.body)}`);
  await waitForMessages(1);
  assert(messages[0].includes("LOW_BALANCE_MARKER") && messages[0].includes("LOW_BODY_MARKER"), "low-balance email template was not applied");
  assert((await request(adminCookie, "/api/admin/email/test", { method: "POST", body: JSON.stringify({ kind: "low_balance", userId: broker.id }) })).response.status === 409, "low-balance cooldown was not enforced");

  const authSaved = await request(adminCookie, "/api/admin/settings", { method: "PATCH", body: JSON.stringify({ auth: { ...settings.auth, totpEnabled: true, totpIssuer: "小谷回归" } }) });
  assert(authSaved.response.ok, `TOTP settings failed: ${JSON.stringify(authSaved.body)}`);
  const setup = await request(brokerCookie, "/api/account/totp", { method: "POST", body: JSON.stringify({ action: "setup", password }) });
  assert(setup.response.ok && setup.body.setup.secret && setup.body.setup.qrCodeDataUrl.startsWith("data:image/png"), "TOTP setup failed");
  const token = await generate({ secret: setup.body.setup.secret });
  const enabled = await request(brokerCookie, "/api/account/totp", { method: "POST", body: JSON.stringify({ action: "enable", token }) });
  assert(enabled.response.ok && enabled.body.recoveryCodes.length === 8, `TOTP enable failed: ${JSON.stringify(enabled.body)}`);
  const challenged = await login(broker.email);
  assert(challenged.response.status === 403 && challenged.body.code === "TOTP_REQUIRED" && challenged.body.totpChallenge, "TOTP login challenge missing");
  const recovered = await login(broker.email, { totpChallenge: challenged.body.totpChallenge, totpCode: enabled.body.recoveryCodes[0] });
  assert(recovered.response.ok && recovered.cookie, `TOTP recovery login failed: ${JSON.stringify(recovered.body)}`);
  assert((await login(broker.email, { totpChallenge: challenged.body.totpChallenge, totpCode: enabled.body.recoveryCodes[0] })).response.status === 403, "TOTP recovery code was reusable");
  brokerCookie = recovered.cookie;

  const temporary = await pool.query("insert into organizations(name) values ($1) returning id", [`extended-regression-${Date.now()}`]);
  const invitee = await pool.query("insert into users(organization_id,name,email,password_hash,role,status,email_verified_at,terms_accepted_at) values ($1,'返利回归用户',$2,$3,'broker','active',now(),now()) returning id,email", [temporary.rows[0].id, `codex-extended-${Date.now()}@example.com`, broker.password_hash]);
  temporaryUserId = invitee.rows[0].id;
  await pool.query("insert into broker_profiles(user_id,display_name) values ($1,'返利回归用户')", [temporaryUserId]);
  await pool.query("insert into affiliate_accounts(user_id,referral_code,inviter_id) values ($1,$2,$3) on conflict(user_id) do update set inviter_id=excluded.inviter_id", [temporaryUserId, `EXT${Date.now()}`.slice(0, 24), broker.id]);
  await pool.query("insert into affiliate_accounts(user_id,referral_code) values ($1,$2) on conflict(user_id) do nothing", [broker.id, `BRO${Date.now()}`.slice(0, 24)]);
  const affiliateSaved = await request(adminCookie, "/api/admin/settings", { method: "PATCH", body: JSON.stringify({ affiliate: { enabled: true, rebateRatePercent: 20, freezeHours: 0, durationDays: 0, perInviteeCap: 0 } }) });
  assert(affiliateSaved.response.ok, "affiliate settings failed");
  const rateSaved = await request(adminCookie, "/api/admin/affiliates", { method: "PATCH", body: JSON.stringify({ userId: broker.id, rate: 15 }) });
  assert(rateSaved.response.ok && rateSaved.body.updated.rate === 15, "custom affiliate rate did not persist");
  const order = await pool.query("insert into orders(user_id,provider,status,amount_cents,base_amount_cents,fee_cents,currency,quota_amount) values ($1,'manual','pending',100,100,0,'CNY',100) returning id", [temporaryUserId]);
  const paid = await request(adminCookie, "/api/admin/orders", { method: "PATCH", body: JSON.stringify({ orderId: order.rows[0].id, status: "paid" }) });
  assert(paid.response.ok, `affiliate source order could not be paid: ${JSON.stringify(paid.body)}`);
  const accrued = await pool.query("select credits,metadata from affiliate_ledger where source_order_id=$1 and action='accrue'", [order.rows[0].id]);
  assert(accrued.rows[0]?.credits === 15 && Number(accrued.rows[0]?.metadata?.rebateRatePercent) === 15, `custom affiliate rate not applied: ${JSON.stringify(accrued.rows[0])}`);

  const runtime = { modelFallbackEnabled: true, fallbackBaseUrl: "https://fallback.example.com/v1", fallbackModel: "fallback-regression", fallbackApiKey: "regression-api-key", requestTimeoutSeconds: 45, circuitBreakerEnabled: true, circuitFailureThreshold: 2, circuitCooldownSeconds: 60 };
  const runtimeSaved = await request(adminCookie, "/api/admin/settings", { method: "PATCH", body: JSON.stringify({ runtime }) });
  assert(runtimeSaved.response.ok && runtimeSaved.body.settings.runtime.fallbackApiKeyConfigured, "runtime fallback secret did not persist");
  const runtimeReloaded = await request(adminCookie, "/api/admin/settings");
  assert(runtimeReloaded.body.settings.runtime.requestTimeoutSeconds === 45 && runtimeReloaded.body.settings.runtime.fallbackModel === "fallback-regression", "runtime settings did not survive reload");
  const services = await request(adminCookie, "/api/admin/services");
  assert(services.response.ok && Array.isArray(services.body.runtime?.events) && typeof services.body.runtime?.circuit?.failures === "number", `runtime status missing: ${JSON.stringify(services.body.runtime)}`);

  const invalidCron = await request(adminCookie, "/api/admin/settings", { method: "PATCH", body: JSON.stringify({ backup: { ...settings.backup, cronExpression: "invalid cron" } }) });
  assert(invalidCron.response.status === 400, "invalid Cron expression was accepted");
  const backup = { ...settings.backup, scheduleEnabled: false, cronExpression: "0 2 * * *", s3Enabled: true, s3Endpoint: "http://127.0.0.1:4569", s3Region: "us-east-1", s3Bucket: "xiaogu-regression", s3Prefix: "backups/", s3AccessKeyId: "regression-access", s3Secret: "regression-secret", s3ForcePathStyle: true };
  const backupSaved = await request(adminCookie, "/api/admin/settings", { method: "PATCH", body: JSON.stringify({ backup }) });
  assert(backupSaved.response.ok && backupSaved.body.settings.backup.s3SecretConfigured, `S3 settings failed: ${JSON.stringify(backupSaved.body)}`);
  assert((await request(adminCookie, "/api/admin/backups", { method: "POST", body: JSON.stringify({ action: "test_s3" }) })).response.ok, "S3 HEAD test failed");
  const created = await request(adminCookie, "/api/admin/backups", { method: "POST", body: JSON.stringify({ action: "create" }) });
  assert(created.response.ok, `remote backup create failed: ${JSON.stringify(created.body)}`);
  const backupRow = (await pool.query("select filename,remote_key,remote_status from database_backups where id=$1", [created.body.backup.id])).rows[0];
  assert(backupRow.remote_status === "ready" && backupRow.remote_key, `remote upload failed: ${JSON.stringify(backupRow)}`);
  await rm(path.join(backupDirectory, backupRow.filename), { force: true });
  const download = await fetch(`${base}/api/admin/backups/${created.body.backup.id}/download`, { headers: { cookie: adminCookie } });
  assert(download.ok && (await download.arrayBuffer()).byteLength > 100, "remote backup fallback download failed");
  assert((await request(adminCookie, "/api/admin/backups", { method: "POST", body: JSON.stringify({ action: "delete", id: created.body.backup.id }) })).response.ok, "remote backup deletion failed");
  assert(s3Methods.some((item) => item.startsWith("HEAD ")) && s3Methods.some((item) => item.startsWith("PUT ")) && s3Methods.some((item) => item.startsWith("GET ")) && s3Methods.some((item) => item.startsWith("DELETE ")), `incomplete S3 request flow: ${s3Methods.join(", ")}`);

  console.log(JSON.stringify({ ok: true, paymentQuote: true, amountLimits: true, dailyPaymentCap: true, lowBalanceEmail: true, lowBalanceCooldown: true, customAffiliateRate: 15, totpChallenge: true, recoveryCode: true, dynamicLegalDocument: true, publicBrandConfig: true, remoteBackup: true, cronValidation: true, runtimeSettings: true }));
} finally {
  await new Promise((resolve) => smtp.close(resolve));
  await new Promise((resolve) => s3.close(resolve));
  const createdBackups = (await pool.query("select id,filename from database_backups")).rows.filter((row) => !initialBackupIds.has(row.id));
  for (const backup of createdBackups) await rm(path.join(backupDirectory, backup.filename), { force: true }).catch(() => undefined);
  if (createdBackups.length) await pool.query("delete from database_backups where id=any($1::uuid[])", [createdBackups.map((row) => row.id)]);
  await pool.query("delete from credit_notification_state where user_id in (select id from users where email like 'codex-regression-%@example.com')");
  await pool.query("update users set totp_enabled=false,totp_secret_encrypted='',totp_recovery_codes='[]'::jsonb,session_version=session_version+1 where email like 'codex-regression-%@example.com'");
  if (temporaryUserId) {
    const organization = await pool.query("select organization_id from users where id=$1", [temporaryUserId]);
    await pool.query("delete from users where id=$1", [temporaryUserId]);
    if (organization.rows[0]?.organization_id) await pool.query("delete from organizations where id=$1", [organization.rows[0].organization_id]);
  }
  await pool.query("update affiliate_accounts set custom_rebate_rate_percent=null where user_id in (select id from users where email like 'codex-regression-%@example.com')");
  const managedKeys = ["site","ui","legal","auth","defaults","features","payment","affiliate","email","backup","runtime"];
  await pool.query("delete from system_settings where setting_key=any($1::text[])", [managedKeys]);
  for (const [key, value] of originalSettings) await pool.query("insert into system_settings(setting_key,setting_value) values ($1,$2::jsonb) on conflict(setting_key) do update set setting_value=excluded.setting_value,updated_at=now()", [key, JSON.stringify(value)]);
  await pool.end();
}
