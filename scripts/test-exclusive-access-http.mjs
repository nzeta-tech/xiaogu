// Dedicated local preview only. No paid generation or real payments are sent.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { SignJWT } from "jose";
import bcrypt from "bcryptjs";
const base = process.env.PAID_ACCESS_TEST_BASE_URL;
const db = process.env.PAID_ACCESS_TEST_DATABASE_URL;
if (!base || !db || !process.env.AUTH_SECRET) throw new Error("Explicit local preview, test database and signing secret required");
assert.equal(new URL(base).hostname, "127.0.0.1");
assert.equal(new URL(db).hostname, "127.0.0.1");
assert.equal(new URL(db).pathname, "/paid_access_test");
const pool = new Pool({ connectionString: db });
const adminId = randomUUID(), userId = randomUUID();
async function token(id, role) {
  return new SignJWT({ id, role, email: `${id}@example.test`, name: "Exclusive test", sessionVersion: 1 }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(process.env.AUTH_SECRET));
}
const adminToken = await token(adminId, "admin"), userToken = await token(userId, "broker");
async function api(path, auth, body, method = body ? "PATCH" : "GET") {
  const response = await fetch(base + path, { method, headers: { ...(auth ? { cookie: `ica_session=${auth}` } : {}), "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(60000) });
  return { status: response.status, data: await response.json() };
}
const path = "/api/admin/users/exclusive-access";
const detail = () => api(`${path}?userId=${userId}`, adminToken);
let revision = 0;
async function change(mode, extra = {}) {
  const result = await api(path, adminToken, { userId, mode, expiresAt: null, reason: "合作客户体验（本地测试）", expectedRevision: revision, ...extra });
  if (result.status === 200) revision++;
  return result;
}
try {
  const password = await bcrypt.hash("Preview-only-2026!", 10);
  await pool.query("insert into users(id,name,email,password_hash,role,email_verified_at) values($1,'权限测试管理员',$2,$5,'admin',now()),($3,'体验测试用户',$4,$5,'broker',now())", [adminId, `${adminId}@example.test`, userId, `${userId}@example.test`, password]);
  await pool.query("insert into gift_records(user_id,source_type,quota_amount) values($1,'admin',1000)", [userId]);
  assert.equal((await api("/api/creation/apps/digital-human-video", adminToken)).status, 200);
  assert.equal((await api(`${path}?userId=${userId}`, null)).status, 401);
  assert.equal((await api(`${path}?userId=${userId}`, userToken)).status, 403);
  assert.equal((await api(path, userToken, { userId, mode: "granted", reason: "unauthorized", expiresAt: null, expectedRevision: 0 })).status, 403);
  assert.equal((await change("granted", { reason: " " })).status, 400);
  assert.equal((await change("granted", { expiresAt: "2000-01-01T00:00:00Z" })).status, 400);
  assert.equal((await api(`${path}?userId=${randomUUID()}`, adminToken)).status, 404);
  console.log("PASS: unauthenticated/non-admin/invalid edits rejected");
  assert.equal((await api("/api/digital-human-videos", userToken, {}, "POST")).data.code, "PAID_CUSTOMER_REQUIRED");
  assert.equal((await change("granted", { expiresAt: new Date(Date.now() + 7 * 86400000).toISOString() })).status, 200);
  let state = await api("/api/billing/access-status?app=digital-human-video", userToken);
  assert.equal(state.data.eligible, true); assert.deepEqual(state.data.totals, {});
  assert.equal(JSON.stringify(state.data).includes("合作客户"), false);
  const admitted=await api("/api/digital-human-videos", userToken, {}, "POST");
  assert.equal(admitted.status, 400, JSON.stringify(admitted.data));
  const d = await detail();
  assert.equal(d.data.effective.source, "manual"); assert.equal(d.data.paid, false);
  assert.equal(d.data.history[0].detail.before.mode, "auto");
  assert.equal(d.data.history[0].detail.after.mode, "granted");
  assert.equal((await change("blocked", { expectedRevision: 0 })).status, 409);
  console.log("PASS: manual grant unlocks without payment and writes auditable history; stale edits rejected");
  await pool.query("update gift_records set quota_amount=0 where user_id=$1", [userId]);
  assert.equal((await api("/api/digital-human-videos", userToken, {}, "POST")).status, 402);
  console.log("PASS: manual access still requires sufficient credits");
  assert.equal((await change("blocked")).status, 200);
  state = await api("/api/billing/access-status?app=digital-human-video", userToken);
  assert.equal(state.data.eligible, false); assert.equal(state.data.blocked, true);
  assert.equal((await api("/api/digital-human-videos", userToken, {}, "POST")).data.code, "EXCLUSIVE_ACCESS_BLOCKED");
  assert.equal((await change("auto")).status, 200);
  assert.equal((await api("/api/digital-human-videos", userToken, {}, "POST")).data.code, "PAID_CUSTOMER_REQUIRED");
  assert.equal((await detail()).data.history.length, 3);
  console.log("PASS: block and return-to-auto take effect immediately");
  if (process.argv.includes("--keep-fixtures")) console.log(JSON.stringify({ adminEmail: `${adminId}@example.test`, userEmail: `${userId}@example.test`, userId }));
} finally {
  if (!process.argv.includes("--keep-fixtures")) await pool.query("delete from users where id=any($1::uuid[])", [[adminId,userId]]);
  await pool.end();
}
