#!/usr/bin/env node
import assert from "node:assert/strict";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
const base = process.env.REGRESSION_BASE_URL?.replace(/\/$/, "");
const authBase = (process.env.REGRESSION_AUTH_BASE_URL ?? base)?.replace(/\/$/, "");
if (!databaseUrl || !base || !authBase) throw new Error("DATABASE_URL, REGRESSION_BASE_URL and REGRESSION_AUTH_BASE_URL are required");

const pool = new Pool({ connectionString: databaseUrl });
const marker = `image-card-recreation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const email = `${marker}@example.invalid`;
const password = `Regression-${crypto.randomUUID()}-A1`;
let cookie = "";
let userId = "";
let organizationId = "";
let assertions = 0;
function check(value, message) { assert(value, message); assertions += 1; }
async function request(path, init = {}, authenticated = true) {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: { accept: "application/json", ...(authenticated && cookie ? { cookie } : {}), ...(init.headers ?? {}) },
  });
  return { response, body: await response.json().catch(() => ({})) };
}

try {
  const registration = await fetch(`${authBase}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.93" },
    body: JSON.stringify({ name: "知识卡片回归", email, password, acceptedTerms: true }),
  });
  check(registration.ok, "fixture registration must succeed");
  cookie = (typeof registration.headers.getSetCookie === "function" ? registration.headers.getSetCookie() : [registration.headers.get("set-cookie") ?? ""])
    .map((value) => value.split(";")[0]).filter(Boolean).join("; ");
  check(Boolean(cookie), "fixture registration must establish a session");
  const fixtureUser = (await pool.query("select id,organization_id from users where email=$1", [email])).rows[0];
  userId = fixtureUser?.id;
  organizationId = fixtureUser?.organization_id;
  const appId = (await pool.query("select id from apps where slug='image-card' limit 1")).rows[0]?.id;
  check(Boolean(userId && appId), "fixture user and image-card app must exist");

  const rejected = await request("/api/creation/apps/image-card/prepare", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ values: { style: ["editorial", "notebook", "comic", "minimal"] } }),
  });
  check(rejected.response.status === 400, "a fourth style must be rejected before generation");
  check(String(rejected.body.error ?? "").includes("最多"), "the style-limit failure must be actionable");

  const styles = ["editorial", "notebook", "comic"];
  const originalInput = { source: marker, style: styles, signature: "fixture" };
  const originalResult = { images: styles.map((style, index) => ({ id: `image-${index + 1}`, url: `https://assets.example.invalid/${style}.png` })), imageStyles: styles };
  const originalRun = (await pool.query(
    "insert into app_runs(user_id,app_id,status,input_payload,result_json,model,completed_at) values($1,$2,'succeeded',$3::jsonb,$4::jsonb,'gpt-5.6-terra',now()) returning id",
    [userId, appId, JSON.stringify(originalInput), JSON.stringify(originalResult)],
  )).rows[0];
  const originalWork = (await pool.query(
    "insert into works(user_id,app_id,app_run_id,title,source_channel) values($1,$2,$3,$4,'image-card') returning id",
    [userId, appId, originalRun.id, marker],
  )).rows[0];
  await pool.query("insert into work_versions(work_id,version_no,content,content_json,created_from) values($1,1,'',$2::jsonb,'generation')", [originalWork.id, JSON.stringify({ batches: [] })]);

  const loadedOriginal = await request(`/api/works/${originalWork.id}`);
  check(loadedOriginal.response.ok, "owner must reload the original image-card work");
  check(JSON.stringify(loadedOriginal.body.work.app_run.input_payload.style) === JSON.stringify(styles), "all selected styles must persist for recreation prefill");
  check(loadedOriginal.body.work.app_run.result_json.images.length === 3, "one durable image must exist per selected style");
  check(JSON.stringify(loadedOriginal.body.work.app_run.result_json.imageStyles) === JSON.stringify(styles), "result style order must match image order");
  const unauthorized = await request(`/api/works/${originalWork.id}`, {}, false);
  check(unauthorized.response.status === 401, "an unauthenticated session must not read recreation inputs");

  const editInput = { ...originalInput, style: [styles[1]], creation_mode: "image_remix", edit_instruction: "controlled fixture edit", source_work_id: originalWork.id, source_image_id: "image-2" };
  const editRun = (await pool.query(
    "insert into app_runs(user_id,app_id,status,input_payload,result_json,model,completed_at) values($1,$2,'succeeded',$3::jsonb,$4::jsonb,'gpt-5.6-terra',now()) returning id",
    [userId, appId, JSON.stringify(editInput), JSON.stringify({ images: [{ id: "edited-image", url: "https://assets.example.invalid/edited.png" }], imageStyles: [styles[1]] })],
  )).rows[0];
  const editWork = (await pool.query("insert into works(user_id,app_id,app_run_id,title,source_channel) values($1,$2,$3,$4,'image-card') returning id", [userId, appId, editRun.id, `${marker}-edit`])).rows[0];
  await pool.query("insert into work_versions(work_id,version_no,content,content_json,created_from) values($1,1,'','{}'::jsonb,'generation')", [editWork.id]);
  const loadedEdit = await request(`/api/works/${editWork.id}`);
  check(loadedEdit.response.ok && loadedEdit.body.work.id !== originalWork.id, "image modification must persist as a new work");
  check(loadedEdit.body.work.app_run.input_payload.source_work_id === originalWork.id, "the edit must retain its source-work linkage");
  const reloadedOriginal = await request(`/api/works/${originalWork.id}`);
  check(reloadedOriginal.body.work.app_run.id === originalRun.id && reloadedOriginal.body.work.app_run.result_json.images.length === 3, "editing must not overwrite the original work");

  console.log(JSON.stringify({ status: "passed", fixture: "image-card-recreation", assertions, images: 3, editedWorks: 1 }));
} finally {
  if (userId) await pool.query("delete from users where id=$1", [userId]).catch(() => undefined);
  if (organizationId) await pool.query("delete from organizations where id=$1", [organizationId]).catch(() => undefined);
  await pool.end();
}
