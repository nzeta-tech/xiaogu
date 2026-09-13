#!/usr/bin/env node
import assert from "node:assert/strict";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
const base = process.env.REGRESSION_BASE_URL?.replace(/\/$/, "");
if (!databaseUrl || !base) throw new Error("DATABASE_URL and REGRESSION_BASE_URL are required");

const pool = new Pool({ connectionString: databaseUrl });
const marker = `wechat-studio-regression-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const email = `${marker}@example.invalid`;
const password = `Regression-${crypto.randomUUID()}-A1`;
let cookie = "";
let userId = "";
let assertions = 0;

function check(value, message) {
  assert(value, message);
  assertions += 1;
}

async function request(path, init = {}) {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: { accept: "application/json", ...(cookie ? { cookie } : {}), ...(init.headers ?? {}) },
  });
  return { response, body: await response.json().catch(() => ({})) };
}

async function merge(workId, stateKey, value) {
  return pool.query(
    `with latest as (
       select wv.id,wv.content_json from work_versions wv join works w on w.id=wv.work_id
       where w.id=$1 and w.user_id=$2 order by wv.version_no desc limit 1 for update
     )
     update work_versions wv
        set content_json=jsonb_set(
          coalesce(latest.content_json,'{}'::jsonb),
          '{wechatStudioState}',
          coalesce(latest.content_json->'wechatStudioState','{}'::jsonb)
            || jsonb_build_object($3::text,$4::jsonb,'updatedAt',now()::text),
          true
        )
       from latest where wv.id=latest.id`,
    [workId, userId, stateKey, JSON.stringify(value)],
  );
}

try {
  const registration = await request("/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.93" },
    body: JSON.stringify({ name: "公众号持久化回归", email, password, acceptedTerms: true }),
  });
  check(registration.response.ok, "fixture registration must succeed");
  cookie = (typeof registration.response.headers.getSetCookie === "function"
    ? registration.response.headers.getSetCookie()
    : [registration.response.headers.get("set-cookie") ?? ""])
    .map((value) => value.split(";")[0]).filter(Boolean).join("; ");
  userId = (await pool.query("select id from users where email=$1", [email])).rows[0]?.id ?? "";
  const appId = (await pool.query("select id from apps where slug='wechat-studio' limit 1")).rows[0]?.id;
  check(Boolean(userId && appId && cookie), "fixture user, session and WeChat app must exist");

  const primaryRun = (await pool.query(
    "insert into app_runs(user_id,app_id,status,result_text,completed_at) values($1,$2,'succeeded',$3,now()) returning id",
    [userId, appId, marker],
  )).rows[0];
  const work = (await pool.query(
    "insert into works(user_id,app_id,app_run_id,title,source_channel) values($1,$2,$3,$4,'wechat-studio') returning id",
    [userId, appId, primaryRun.id, marker],
  )).rows[0];
  const article = `# ${marker}\n\n公众号完整正文标记，不得被子任务覆盖。`;
  await pool.query(
    "insert into work_versions(work_id,version_no,content,content_json,created_from) values($1,1,$2,$3::jsonb,'generation')",
    [work.id, article, JSON.stringify({ wechatStudioState: { title: marker, content: article, cover: null, bodyImages: [] } })],
  );

  const bodyImages = [
    { id: "body-1", url: "https://assets.example.invalid/body-1.png" },
    { id: "body-2", url: "https://assets.example.invalid/body-2.png" },
  ];
  const cover = { id: "wechat-cover-fixture", url: "https://assets.example.invalid/wechat-cover.png" };
  await Promise.all([merge(work.id, "bodyImages", bodyImages), merge(work.id, "cover", cover)]);

  const fresh = await request(`/api/works/${work.id}`);
  check(fresh.response.ok, "normal work detail route must reload the fixture");
  const loaded = fresh.body.work;
  const state = loaded.content_json.wechatStudioState;
  check(loaded.title === marker && loaded.content === article, "parent title and full article must remain unchanged");
  check(loaded.app_run?.id === primaryRun.id, "child asset merges must not replace the primary article run");
  check(state.title === marker && state.content === article, "article state must remain unchanged");
  check(state.cover.id === cover.id, "cover must persist after concurrent child completion");
  check(state.bodyImages.length === 2 && state.bodyImages.every((image, index) => image.id === bodyImages[index].id), "all body images must persist in order");

  console.log(JSON.stringify({ status: "passed", fixture: "wechat-studio-persistence", assertions, bodyImages: 2 }));
} finally {
  if (userId) await pool.query("delete from users where id=$1", [userId]).catch(() => undefined);
  await pool.end();
}
