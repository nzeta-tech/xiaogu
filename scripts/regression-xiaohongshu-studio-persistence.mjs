#!/usr/bin/env node
import assert from "node:assert/strict";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
const base = process.env.REGRESSION_BASE_URL?.replace(/\/$/, "");
const authBase = (process.env.REGRESSION_AUTH_BASE_URL ?? base)?.replace(/\/$/, "");
if (!databaseUrl || !base) throw new Error("DATABASE_URL and REGRESSION_BASE_URL are required");
const pool = new Pool({ connectionString: databaseUrl });
const marker = `xhs-studio-regression-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const email = `${marker}@example.invalid`;
const password = `Regression-${crypto.randomUUID()}-A1`;
let cookie = "";
let userId = "";
let assertions = 0;
function check(value, message) { assert(value, message); assertions += 1; }
async function request(path, init = {}) {
  const response = await fetch(`${base}${path}`, { ...init, headers: { accept: "application/json", ...(cookie ? { cookie } : {}), ...(init.headers ?? {}) } });
  return { response, body: await response.json().catch(() => ({})) };
}
async function authRequest(path, init = {}) {
  const response = await fetch(`${authBase}${path}`, { ...init, headers: { accept: "application/json", ...(init.headers ?? {}) } });
  return { response, body: await response.json().catch(() => ({})) };
}
async function merge(workId, stateKey, value) {
  return pool.query(
    `with latest as (
       select wv.id,wv.content_json from work_versions wv join works w on w.id=wv.work_id
       where w.id=$1 and w.user_id=$2 order by wv.version_no desc limit 1 for update
     )
     update work_versions wv set content_json=jsonb_set(coalesce(latest.content_json,'{}'::jsonb),'{xiaohongshuStudioState}',coalesce(latest.content_json->'xiaohongshuStudioState','{}'::jsonb)||jsonb_build_object($3::text,$4::jsonb,'tab','cards','updatedAt',now()::text),true)
     from latest where wv.id=latest.id`,
    [workId, userId, stateKey, JSON.stringify(value)],
  );
}

try {
  const registration = await authRequest("/api/auth/register", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.92" }, body: JSON.stringify({ name: "小红书持久化回归", email, password, acceptedTerms: true }) });
  check(registration.response.ok, "fixture registration must succeed");
  cookie = (typeof registration.response.headers.getSetCookie === "function" ? registration.response.headers.getSetCookie() : [registration.response.headers.get("set-cookie") ?? ""]).map((value) => value.split(";")[0]).filter(Boolean).join("; ");
  userId = (await pool.query("select id from users where email=$1", [email])).rows[0]?.id;
  const appId = (await pool.query("select id from apps where slug='xiaohongshu-studio' limit 1")).rows[0]?.id;
  check(Boolean(userId && appId), "fixture user and studio app must exist");
  const primaryRun = (await pool.query("insert into app_runs(user_id,app_id,status,result_text,completed_at) values($1,$2,'succeeded',$3,now()) returning id", [userId, appId, marker])).rows[0];
  const work = (await pool.query("insert into works(user_id,app_id,app_run_id,title,source_channel) values($1,$2,$3,$4,'xiaohongshu-studio') returning id", [userId, appId, primaryRun.id, marker])).rows[0];
  const note = `# ${marker}\n\n完整笔记正文标记，不得被子任务覆盖。`;
  await pool.query("insert into work_versions(work_id,version_no,content,content_json,created_from) values($1,1,$2,$3::jsonb,'generation')", [work.id, note, JSON.stringify({ xiaohongshuStudioState: { topic: marker, content: note, cards: [], headImage: null, coverId: "cover-fixture" } })]);
  const images = [{ id: "card-1", url: "https://assets.example.invalid/card-1.png" }, { id: "card-2", url: "https://assets.example.invalid/card-2.png" }];
  const cover = { id: "cover-fixture", url: "https://assets.example.invalid/cover.png" };
  await Promise.all([merge(work.id, "cards", images), merge(work.id, "headImage", cover)]);

  const fresh = await request(`/api/works/${work.id}`);
  check(fresh.response.ok, "normal work detail route must reload the fixture");
  const loaded = fresh.body.work;
  const state = loaded.content_json.xiaohongshuStudioState;
  check(loaded.title === marker && loaded.content === note, "parent title and full note must remain unchanged");
  check(loaded.app_run?.id === primaryRun.id, "child asset merges must not replace the primary app run");
  check(state.topic === marker && state.content === note, "source topic and note state must remain unchanged");
  check(state.headImage.id === cover.id, "cover must persist after concurrent child completion");
  check(state.cards.length === 2 && state.cards.every((card, index) => card.id === images[index].id), "all section images must persist in order");
  check(state.coverId === cover.id, "saved coverId must remain valid");

  const autosave = await request(`/api/works/${work.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ content: note, contentJson: { xiaohongshuStudioState: { topic: marker, content: note, cards: images, coverId: cover.id } } }) });
  check(autosave.response.ok, "client autosave must succeed after asset completion");
  const reloaded = await request(`/api/works/${work.id}`);
  check(reloaded.body.work.content_json.xiaohongshuStudioState.headImage.id === cover.id, "autosave without headImage must not erase the durable cover");
  console.log(JSON.stringify({ status: "passed", fixture: "xiaohongshu-studio-persistence", assertions, cards: 2 }));
} finally {
  if (userId) await pool.query("delete from users where id=$1", [userId]).catch(() => undefined);
  await pool.end();
}
