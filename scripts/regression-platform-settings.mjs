import { Pool } from "pg";
import { SMTPServer } from "smtp-server";
import { rm } from "node:fs/promises";
import path from "node:path";

const base = process.env.REGRESSION_BASE_URL ?? "http://localhost:3000";
const password = "Regression123!";
const newPassword = "Regression789!";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const messages = [];
const smtp = new SMTPServer({ disabledCommands: ["AUTH"], hideSTARTTLS: true, onData(stream, _session, callback) { let raw = ""; stream.on("data", (chunk) => { raw += chunk.toString(); }); stream.on("end", () => { messages.push(raw); callback(); }); } });
await new Promise((resolve, reject) => smtp.listen(2527, "127.0.0.1", (error) => error ? reject(error) : resolve()));

function assert(condition, message) { if (!condition) throw new Error(message); }
async function login(email, pass = password, extra = {}) { const response = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: pass, ...extra }) }); const text = await response.text(); let body; try { body = JSON.parse(text); } catch { body = text; } return { response, body, cookie: response.headers.get("set-cookie")?.split(";")[0] ?? "" }; }
async function request(cookie, path, options = {}) { const response = await fetch(`${base}${path}`, { ...options, headers: { cookie, ...(options.body ? { "content-type": "application/json" } : {}), ...(options.headers ?? {}) } }); const text = await response.text(); let body; try { body = JSON.parse(text); } catch { body = text; } return { response, body }; }
async function waitForMessage(startIndex) { for (let i = 0; i < 40; i += 1) { if (messages.length > startIndex) return messages.at(-1); await new Promise((resolve) => setTimeout(resolve, 100)); } throw new Error("SMTP message not received"); }
function tokenFromMessage(raw) { const decoded = raw.replace(/=\r?\n/g, "").replaceAll("=3D", "="); const match = decoded.match(/token=([A-Za-z0-9_-]{20,})/); assert(match, `token missing from email: ${raw.slice(0, 500)}`); return match[1]; }

const rawSettings = await pool.query("select setting_key,setting_value from system_settings");
const originalSettings = new Map(rawSettings.rows.map((row) => [row.setting_key, row.setting_value]));
const initialBackupIds = new Set((await pool.query("select id from database_backups")).rows.map((row) => row.id));
let adminCookie = "";
let brokerCookie = "";

try {
  const fixtureUsers = await pool.query("select id,email,role from users where email like 'codex-regression-%@example.com' order by created_at desc");
  const admin = fixtureUsers.rows.find((item) => item.role === "admin");
  const broker = fixtureUsers.rows.find((item) => item.role === "broker");
  assert(admin && broker, "regression fixture missing");
  adminCookie = (await login(admin.email)).cookie;
  brokerCookie = (await login(broker.email)).cookie;
  assert(adminCookie && brokerCookie, "fixture login failed");
  const current = (await request(adminCookie, "/api/admin/settings")).body.settings;
  const configured = structuredClone(current);
  configured.email = {
    ...configured.email, enabled: true, host: "127.0.0.1", port: 2527, secure: false, username: "", fromEmail: "noreply@xiaogu.test", fromName: "小谷测试",
    verificationSubject: "VERIFY_TEMPLATE_MARKER", verificationBody: "VERIFY_BODY_MARKER {{name}} {{hours}} {{url}}",
    passwordResetSubject: "RESET_TEMPLATE_MARKER", passwordResetBody: "RESET_BODY_MARKER {{name}} {{hours}} {{url}}",
  };
  configured.ui = { tableDefaultPageSize: 50, tablePageSizeOptions: [10, 20, 50, 100] };
  configured.auth = { ...configured.auth, emailVerificationEnabled: true, passwordResetEnabled: true, sessionDays: 3, loginAttemptLimit: 8, loginWindowMinutes: 10, allowedEmailDomains: [], turnstileEnabled: false, turnstileSiteKey: "" };
  configured.defaults = { ...configured.defaults, signupCredits: 25, dailyCreationLimit: 0 };
  const saved = await request(adminCookie, "/api/admin/settings", { method: "PATCH", body: JSON.stringify(configured) });
  assert(saved.response.ok, `settings save failed: ${JSON.stringify(saved.body)}`);
  assert(saved.body.settings.ui.tableDefaultPageSize === 50 && saved.body.settings.ui.tablePageSizeOptions.includes(100), "table pagination preferences did not persist");
  const emailStart = messages.length;
  const emailTest = await request(adminCookie, "/api/admin/email/test", { method: "POST", body: JSON.stringify({ recipient: "smtp-test@xiaogu.test" }) });
  assert(emailTest.response.ok, `smtp test failed: ${JSON.stringify(emailTest.body)}`);
  await waitForMessage(emailStart);

  const inviteeEmail = `codex-platform-${Date.now()}@example.com`;
  const verificationStart = messages.length;
  const register = await fetch(`${base}/api/auth/register`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.11" }, body: JSON.stringify({ name: "平台设置回归", email: inviteeEmail, password, acceptedTerms: true }) });
  const registerBody = await register.json();
  assert(register.ok && registerBody.requiresEmailVerification && registerBody.emailSent, `verification registration failed: ${JSON.stringify(registerBody)}`);
  const unverifiedLogin = await login(inviteeEmail);
  assert(unverifiedLogin.response.status === 403 && unverifiedLogin.body.code === "EMAIL_UNVERIFIED", "unverified user was allowed to login");
  const verificationMessage = await waitForMessage(verificationStart);
  assert(verificationMessage.includes("VERIFY_TEMPLATE_MARKER") && verificationMessage.includes("VERIFY_BODY_MARKER"), "verification email template was not applied");
  const verifyToken = tokenFromMessage(verificationMessage);
  const verify = await request("", "/api/auth/verify-email", { method: "POST", body: JSON.stringify({ token: verifyToken }) });
  assert(verify.response.ok, `email verification failed: ${JSON.stringify(verify.body)}`);
  let inviteeLogin = await login(inviteeEmail);
  assert(inviteeLogin.response.ok, `verified login failed: ${JSON.stringify(inviteeLogin.body)}`);
  let inviteeCookie = inviteeLogin.cookie;
  const balance = await request(inviteeCookie, "/api/billing/balance");
  assert(balance.body.balance === 25, `signup credits mismatch: ${JSON.stringify(balance.body)}`);

  const resetStart = messages.length;
  const resetRequest = await request("", "/api/auth/password-reset/request", { method: "POST", body: JSON.stringify({ email: inviteeEmail }) });
  assert(resetRequest.response.ok, "password reset request failed");
  const resetMessage = await waitForMessage(resetStart);
  assert(resetMessage.includes("RESET_TEMPLATE_MARKER") && resetMessage.includes("RESET_BODY_MARKER"), "password reset email template was not applied");
  const resetToken = tokenFromMessage(resetMessage);
  const reset = await request("", "/api/auth/password-reset/confirm", { method: "POST", body: JSON.stringify({ token: resetToken, newPassword }) });
  assert(reset.response.ok, `password reset failed: ${JSON.stringify(reset.body)}`);
  assert((await login(inviteeEmail)).response.status === 401, "old password still works");
  inviteeLogin = await login(inviteeEmail, newPassword);
  assert(inviteeLogin.response.ok, "new password login failed");
  inviteeCookie = inviteeLogin.cookie;

  const legalSettings = structuredClone(saved.body.settings);
  const legalMarker = `协议正文回归-${Date.now()}`;
  legalSettings.legal = {
    ...legalSettings.legal,
    termsVersion: `regression-${Date.now()}`,
    termsUpdatedAt: new Date().toISOString().slice(0, 10),
    requireReaccept: true,
    displayMode: "modal",
    documents: legalSettings.legal.documents.map((document) => document.slug === "terms" ? { ...document, title: "回归用户协议", content: `## 回归条款\n\n${legalMarker}` } : document),
  };
  const legalSaved = await request(adminCookie, "/api/admin/settings", { method: "PATCH", body: JSON.stringify(legalSettings) });
  assert(legalSaved.response.ok, "legal settings save failed");
  const adminAccept = await request(adminCookie, "/api/legal/accept", { method: "POST" });
  assert(adminAccept.response.ok, "admin terms accept failed");
  const legalReloaded = await request(adminCookie, "/api/admin/settings");
  assert(legalReloaded.body.settings.legal.displayMode === "modal" && legalReloaded.body.settings.legal.documents.find((document) => document.slug === "terms")?.content.includes(legalMarker), "legal settings did not persist after reload");
  const publicConfig = await request("", "/api/system/public-config");
  assert(publicConfig.body.legal.displayMode === "modal" && publicConfig.body.legal.documents.length === 2, "public legal config missing");
  const termsPage = await fetch(`${base}/terms`);
  assert(termsPage.ok && (await termsPage.text()).includes(legalMarker), "persisted agreement content was not rendered");
  const missingConsentEmail = `codex-platform-no-consent-${Date.now()}@example.com`;
  const missingConsent = await fetch(`${base}/api/auth/register`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.12" }, body: JSON.stringify({ name: "未同意条款", email: missingConsentEmail, password, acceptedTerms: false }) });
  assert(missingConsent.status === 400, "registration without required consent was accepted");
  const legalDisabled = structuredClone(legalSaved.body.settings);
  legalDisabled.legal.termsEnabled = false;
  const legalDisabledSaved = await request(adminCookie, "/api/admin/settings", { method: "PATCH", body: JSON.stringify(legalDisabled) });
  assert(legalDisabledSaved.response.ok, "disabling registration agreement failed");
  const noConsentRequiredEmail = `codex-platform-optional-consent-${Date.now()}@example.com`;
  const noConsentRequired = await fetch(`${base}/api/auth/register`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.13" }, body: JSON.stringify({ name: "无需条款", email: noConsentRequiredEmail, password, acceptedTerms: false }) });
  assert(noConsentRequired.ok, "disabled registration agreement still required consent");
  assert((await request(adminCookie, "/api/admin/settings", { method: "PATCH", body: JSON.stringify(legalSaved.body.settings) })).response.ok, "restoring legal settings failed");
  inviteeLogin = await login(inviteeEmail, newPassword);
  assert(inviteeLogin.response.ok && inviteeLogin.body.requiresTermsAcceptance, "terms reaccept was not requested");
  inviteeCookie = inviteeLogin.cookie;
  assert((await request(inviteeCookie, "/api/auth/me")).response.status === 401, "stale terms session accessed protected API");
  assert((await request(inviteeCookie, "/api/legal/accept", { method: "POST" })).response.ok, "terms accept failed");
  assert((await request(inviteeCookie, "/api/auth/me")).response.ok, "accepted terms session remained blocked");

  const securitySettings = structuredClone(legalSaved.body.settings);
  securitySettings.auth = { ...securitySettings.auth, turnstileEnabled: true, turnstileSiteKey: "1x00000000000000000000AA", turnstileSecret: "1x0000000000000000000000000000000AA" };
  const turnstileSaved = await request(adminCookie, "/api/admin/settings", { method: "PATCH", body: JSON.stringify(securitySettings) });
  assert(turnstileSaved.response.ok, `turnstile settings failed: ${JSON.stringify(turnstileSaved.body)}`);
  assert((await login(broker.email)).response.status === 400, "missing turnstile token was accepted");
  securitySettings.auth.turnstileEnabled = false;
  delete securitySettings.auth.turnstileSecret;
  const turnstileDisabled = await request(adminCookie, "/api/admin/settings", { method: "PATCH", body: JSON.stringify(securitySettings) });
  assert(turnstileDisabled.response.ok, "turnstile disable failed");

  const maintenanceSettings = structuredClone(turnstileDisabled.body.settings);
  maintenanceSettings.site.maintenanceMode = true;
  const maintenanceSaved = await request(adminCookie, "/api/admin/settings", { method: "PATCH", body: JSON.stringify(maintenanceSettings) });
  assert(maintenanceSaved.response.ok, "maintenance mode save failed");
  assert((await login(broker.email)).response.status === 503, "broker login bypassed maintenance mode");
  assert((await login(admin.email)).response.ok, "admin login blocked by maintenance mode");
  maintenanceSettings.site.maintenanceMode = false;
  const maintenanceDisabled = await request(adminCookie, "/api/admin/settings", { method: "PATCH", body: JSON.stringify(maintenanceSettings) });
  assert(maintenanceDisabled.response.ok, "maintenance disable failed");

  const invitee = (await pool.query("select id from users where email=$1", [inviteeEmail])).rows[0];
  const limiting = structuredClone(maintenanceDisabled.body.settings);
  limiting.defaults.dailyCreationLimit = 1;
  limiting.payment.maxPendingOrders = 1;
  limiting.payment.orderTimeoutMinutes = 5;
  const limitsSaved = await request(adminCookie, "/api/admin/settings", { method: "PATCH", body: JSON.stringify(limiting) });
  assert(limitsSaved.response.ok, "limit settings save failed");
  await pool.query("insert into app_runs(user_id,status,quota_cost,input_payload) values ($1,'succeeded',0,'{}'::jsonb)", [invitee.id]);
  const dailyLimit = await request(inviteeCookie, "/api/creation/apps/general-content/prepare", { method: "POST", body: JSON.stringify({ values: { source: "达到每日限制的回归测试", targets: ["朋友圈"] } }) });
  assert(dailyLimit.response.status === 429, `daily limit not enforced: ${dailyLimit.response.status}`);
  const oldOrder = (await pool.query("insert into orders(user_id,provider,status,amount_cents,currency,quota_amount,created_at) values ($1,'regression','pending',100,'CNY',10,now()-interval '10 minutes') returning id", [invitee.id])).rows[0];
  await pool.query("insert into orders(user_id,provider,status,amount_cents,currency,quota_amount) values ($1,'regression','pending',100,'CNY',10)", [invitee.id]);
  const pendingLimit = await request(inviteeCookie, "/api/billing/orders", { method: "POST", body: JSON.stringify({ planCode: "starter_300", provider: "stripe" }) });
  assert(pendingLimit.response.status === 429, `pending order limit not enforced: ${pendingLimit.response.status}`);
  assert((await pool.query("select status from orders where id=$1", [oldOrder.id])).rows[0].status === "cancelled", "expired pending order not cancelled");

  const health = await request(adminCookie, "/api/admin/services");
  assert(health.response.ok && health.body.health.checks.length >= 7, "service health check failed");

  const createdBackup = await request(adminCookie, "/api/admin/backups", { method: "POST", body: JSON.stringify({ action: "create" }) });
  assert(createdBackup.response.ok, `backup create failed: ${JSON.stringify(createdBackup.body)}`);
  const backupId = createdBackup.body.backup.id;
  const download = await fetch(`${base}/api/admin/backups/${backupId}/download`, { headers: { cookie: adminCookie } });
  assert(download.ok && (await download.arrayBuffer()).byteLength > 100, "backup download failed");
  await pool.query("update users set name='被修改的回归名称' where id=$1", [invitee.id]);
  const restore = await request(adminCookie, "/api/admin/backups", { method: "POST", body: JSON.stringify({ action: "restore", id: backupId, confirmation: "恢复数据库" }) });
  assert(restore.response.ok, `backup restore failed: ${JSON.stringify(restore.body)}`);
  assert((await pool.query("select name from users where id=$1", [invitee.id])).rows[0].name === "平台设置回归", "backup did not restore data");

  inviteeLogin = await login(inviteeEmail, newPassword);
  inviteeCookie = inviteeLogin.cookie;
  const sessions = await request(inviteeCookie, "/api/account/sessions");
  assert(sessions.response.ok && sessions.body.events.length >= 1, "login history missing");
  assert((await request(inviteeCookie, "/api/account/sessions", { method: "DELETE" })).response.ok, "logout all sessions failed");
  assert((await request(inviteeCookie, "/api/auth/me")).response.status === 401, "old session valid after logout all");

  console.log(JSON.stringify({ ok: true, emailVerification: true, passwordReset: true, emailTemplates: true, tablePreferences: true, legalDocuments: true, legalDisplayModes: true, termsReaccept: true, turnstileGuard: true, maintenanceMode: true, signupCredits: 25, dailyLimit: true, paymentLimits: true, serviceChecks: health.body.health.checks.length, backupRestore: true, loginAudit: true }));
} finally {
  await new Promise((resolve) => smtp.close(resolve));
  const createdBackups = (await pool.query("select id,filename from database_backups")).rows.filter((row) => !initialBackupIds.has(row.id));
  const backupDirectory = process.env.DATABASE_BACKUP_DIR ?? path.resolve(process.cwd(), "..", ".xiaogu-backups");
  for (const backup of createdBackups) await rm(path.join(backupDirectory, backup.filename), { force: true }).catch(() => undefined);
  if (createdBackups.length) await pool.query("delete from database_backups where id=any($1::uuid[])", [createdBackups.map((row) => row.id)]);
  await pool.query("delete from users where email like 'codex-platform-%@example.com'");
  const managedKeys = ["site","ui","legal","auth","defaults","features","payment","affiliate","email","backup","runtime"];
  await pool.query("delete from system_settings where setting_key = any($1::text[])", [managedKeys]);
  for (const [key, value] of originalSettings) await pool.query("insert into system_settings(setting_key,setting_value) values ($1,$2::jsonb) on conflict(setting_key) do update set setting_value=excluded.setting_value,updated_at=now()", [key, JSON.stringify(value)]);
  await pool.end();
}
