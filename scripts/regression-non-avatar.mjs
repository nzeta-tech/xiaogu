import { Pool } from "pg";

const base = process.env.REGRESSION_BASE_URL ?? "http://localhost:3000";
const marker = process.env.REGRESSION_MARKER ?? "codex-regression";
const password = process.env.REGRESSION_PASSWORD ?? "Regression123!";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const users = await pool.query("select id,email,role from users where email like $1 order by created_at desc", [`${marker}-%@example.com`]);
const broker = users.rows.find((item) => item.role === "broker");
const admin = users.rows.find((item) => item.role === "admin");
if (!broker || !admin) throw new Error("regression fixture not found");

function assert(condition, message) { if (!condition) throw new Error(message); }
async function login(email, pass = password) {
  const response = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: pass }) });
  assert(response.ok, `login failed ${email}: ${response.status} ${await response.text()}`);
  return response.headers.get("set-cookie")?.split(";")[0] ?? "";
}
async function request(cookie, path, options = {}) {
  const response = await fetch(`${base}${path}`, { ...options, headers: { cookie, ...(options.body ? { "content-type": "application/json" } : {}), ...(options.headers ?? {}) } });
  const text = await response.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  return { response, body };
}
function ok(result, label) { assert(result.response.ok, `${label}: ${result.response.status} ${JSON.stringify(result.body)}`); return result.body; }

let brokerCookie = await login(broker.email);
const adminCookie = await login(admin.email);
const originalApp = (await pool.query("select id,points_cost,status,featured,sort_order,badge from apps where slug='general-content'")).rows[0];
let createdWorkId = null;

try {
  for (const path of ["/api/auth/me", "/api/workbench/overview", "/api/creation/hub", "/api/creation/hub?view=works", "/api/billing/plans", "/api/billing/balance", "/api/billing/orders", "/api/usage", "/api/gifts", "/api/feedback", "/api/system/public-config"]) ok(await request(brokerCookie, path), `front ${path}`);
  assert((await request(brokerCookie, "/api/drafts")).response.status === 410, "legacy drafts must be 410");
  assert((await request(brokerCookie, "/api/profile")).response.status === 410, "legacy profile must be 410");
  assert((await request(brokerCookie, "/api/billing/consume", { method: "POST", body: JSON.stringify({ action: "write_script", amount: -999 }) })).response.status === 410, "client consume must be 410");

  ok(await request(brokerCookie, "/api/feedback", { method: "POST", body: JSON.stringify({ title: `${marker}反馈`, content: "回归测试反馈内容，验证前后台工单闭环。", category: "bug", priority: "normal" }) }), "create feedback");
  const tickets = ok(await request(brokerCookie, "/api/feedback"), "list feedback").tickets;
  assert(tickets.some((item) => item.title === `${marker}反馈`), "feedback not persisted");

  for (const path of ["summary","users","orders","apps","feedback","audit-logs","promo-codes","announcements","content","settings","billing-plans","runs"]) ok(await request(adminCookie, `/api/admin/${path}`), `admin ${path}`);
  assert((await request(adminCookie, "/api/admin/users", { method: "PATCH", body: JSON.stringify({ userId: admin.id, role: "broker" }) })).response.status === 400, "admin self-demotion should fail");

  ok(await request(adminCookie, "/api/admin/apps", { method: "PATCH", body: JSON.stringify({ appId: originalApp.id, pointsCost: 7 }) }), "set app price");
  await request(brokerCookie, "/api/creation/hub");
  const persistedPrice = Number((await pool.query("select points_cost from apps where id=$1", [originalApp.id])).rows[0].points_cost);
  assert(persistedPrice === 7, `catalog sync overwrote admin price: ${persistedPrice}`);

  ok(await request(adminCookie, "/api/admin/apps", { method: "PATCH", body: JSON.stringify({ appId: originalApp.id, status: "inactive" }) }), "disable app");
  const disabled = await request(brokerCookie, "/api/creation/apps/general-content/prepare", { method: "POST", body: JSON.stringify({ values: { source: "测试", targets: ["朋友圈"] } }) });
  assert(disabled.response.status === 404, `disabled app bypassed: ${disabled.response.status}`);
  ok(await request(adminCookie, "/api/admin/apps", { method: "PATCH", body: JSON.stringify({ appId: originalApp.id, status: "active" }) }), "enable app");

  const creation = ok(await request(brokerCookie, "/api/creation/apps/general-content/prepare", { method: "POST", body: JSON.stringify({ values: { source: "请写一段关于家庭收入中断风险的专业朋友圈，语气克制，不能承诺收益和理赔。", targets: ["朋友圈"] } }) }), "prepare creation");
  createdWorkId = creation.work.id;
  let work;
  for (let index = 0; index < 45; index += 1) {
    work = ok(await request(brokerCookie, `/api/works/${createdWorkId}`), "poll work").work;
    if (work.app_run?.status === "succeeded" || work.app_run?.status === "failed") break;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  assert(work?.app_run?.status === "succeeded", `creation did not succeed: ${work?.app_run?.status}`);
  assert(Number(work.app_run.quota_cost) === 7, `actual quota cost mismatch: ${work.app_run.quota_cost}`);
  assert(work.content?.trim().length > 50, "generated work content missing");

  ok(await request(brokerCookie, `/api/works/${createdWorkId}`, { method: "PATCH", body: JSON.stringify({ isFavorite: true, isUsed: true, status: "used", note: "回归测试备注" }) }), "update work metadata");
  const updatedWork = ok(await request(brokerCookie, `/api/works/${createdWorkId}`), "get updated work").work;
  assert(updatedWork.is_favorite && updatedWork.is_used && updatedWork.note === "回归测试备注", "work metadata not persisted");

  const compliance = ok(await request(brokerCookie, "/api/compliance", { method: "POST", body: JSON.stringify({ text: "这款产品保证承保、永久保证续保，而且绝对安全。" }) }), "compliance precheck");
  assert(compliance.report.riskLevel === "高" && compliance.report.issues.length >= 2, "compliance rules did not trigger");

  const announcementTitle = `${marker}公告-${Date.now()}`;
  const announcement = ok(await request(adminCookie, "/api/admin/announcements", { method: "POST", body: JSON.stringify({ title: announcementTitle, content: "后台公告回归测试", kind: "notice", placement: "dashboard", status: "published", isPinned: false }) }), "create announcement").announcement;
  const visibleAnnouncements = ok(await request(brokerCookie, "/api/announcements?placement=dashboard"), "list dashboard announcements").announcements;
  assert(visibleAnnouncements.some((item) => item.id === announcement.id), "announcement placement failed");

  const promoCode = `CODEXREG${Date.now()}`;
  const promo = ok(await request(adminCookie, "/api/admin/promo-codes", { method: "POST", body: JSON.stringify({ code: promoCode, rewardType: "credit", creditAmount: 11, discountPercent: 0, status: "active", maxRedemptions: 1, notes: marker }) }), "create promo").promoCode;
  const redemption = ok(await request(brokerCookie, "/api/promo/redeem", { method: "POST", body: JSON.stringify({ code: promoCode }) }), "redeem promo").redemption;
  assert(redemption.creditAmount === 11, "promo credit mismatch");

  ok(await request(brokerCookie, `/api/works/${createdWorkId}`, { method: "DELETE" }), "archive work");
  const works = ok(await request(brokerCookie, "/api/creation/hub?view=works"), "list works after archive").works.items;
  assert(!works.some((item) => item.id === createdWorkId), "archived work still visible");

  const newPassword = "Regression456!";
  ok(await request(brokerCookie, "/api/account/password", { method: "POST", body: JSON.stringify({ currentPassword: password, newPassword }) }), "change password");
  assert((await request(brokerCookie, "/api/auth/me")).response.status === 401, "old session remained valid after password change");
  brokerCookie = await login(broker.email, newPassword);
  ok(await request(brokerCookie, "/api/auth/me"), "login with new password");

  console.log(JSON.stringify({ ok: true, createdWorkId, announcementId: announcement.id, promoId: promo.id, testedAdminEndpoints: 12 }));
} finally {
  await pool.query("update apps set points_cost=$2,status=$3,featured=$4,sort_order=$5,badge=$6 where id=$1", [originalApp.id, originalApp.points_cost, originalApp.status, originalApp.featured, originalApp.sort_order, originalApp.badge]);
  await pool.end();
}
