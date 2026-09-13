#!/usr/bin/env node
import assert from "node:assert/strict";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
const base = process.env.REGRESSION_BASE_URL?.replace(/\/$/, "");
if (!databaseUrl || !base) throw new Error("DATABASE_URL and REGRESSION_BASE_URL are required");
const pool = new Pool({ connectionString: databaseUrl });
const marker = `traffic-cover-history-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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

try {
  const registration = await request("/api/auth/register", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.94" }, body: JSON.stringify({ name: "视频封面历史回归", email, password, acceptedTerms: true }) });
  check(registration.response.ok, "fixture registration must succeed");
  cookie = (typeof registration.response.headers.getSetCookie === "function" ? registration.response.headers.getSetCookie() : [registration.response.headers.get("set-cookie") ?? ""]).map((value) => value.split(";")[0]).filter(Boolean).join("; ");
  userId = (await pool.query("select id from users where email=$1", [email])).rows[0]?.id ?? "";
  check(Boolean(userId && cookie), "fixture session must exist");
  const apps = Object.fromEntries((await pool.query("select slug,id from apps where slug=any($1::text[])", [["link-remix", "video-cover"]])).rows.map((row) => [row.slug, row.id]));
  check(Boolean(apps["link-remix"] && apps["video-cover"]), "required apps must exist");
  const parentRun = (await pool.query("insert into app_runs(user_id,app_id,status,input_payload,result_text,completed_at) values($1,$2,'succeeded',$3::jsonb,$4,now()) returning id", [userId, apps["link-remix"], JSON.stringify({ remix_target: "traffic-copy" }), marker])).rows[0];
  const parent = (await pool.query("insert into works(user_id,app_id,app_run_id,title,source_channel) values($1,$2,$3,$4,'link-remix') returning id", [userId, apps["link-remix"], parentRun.id, marker])).rows[0];
  await pool.query("insert into work_versions(work_id,version_no,content,content_json,created_from) values($1,1,$2,$3::jsonb,'generation')", [parent.id, marker, JSON.stringify({ remixTarget: "traffic-copy" })]);
  const childRun = (await pool.query("insert into app_runs(user_id,app_id,status,input_payload,result_json,completed_at) values($1,$2,'succeeded',$3::jsonb,$4::jsonb,now()) returning id", [userId, apps["video-cover"], JSON.stringify({ traffic_parent_work_id: parent.id }), JSON.stringify({ images: [{ id: "image-1", url: "https://assets.example.invalid/cover.png" }] })])).rows[0];
  const child = (await pool.query("insert into works(user_id,app_id,app_run_id,title,source_channel) values($1,$2,$3,$4,'video-cover') returning id", [userId, apps["video-cover"], childRun.id, `${marker}-child`])).rows[0];
  await pool.query("insert into work_versions(work_id,version_no,content,content_json,created_from) values($1,1,'',$2::jsonb,'generation')", [child.id, JSON.stringify({ images: [{ id: "image-1", url: "https://assets.example.invalid/cover.png" }] })]);

  const flags = await pool.query("select id,is_history_child from works where id=any($1::uuid[])", [[parent.id, child.id]]);
  const flagsById = Object.fromEntries(flags.rows.map((row) => [row.id, row.is_history_child]));
  check(flagsById[parent.id] === false, "parent work must remain history-visible");
  check(flagsById[child.id] === true, "child work must be marked outside history");

  const history = await request("/api/creation/hub?view=works&page=1&pageSize=20&state=all&platform=all&sort=updated-desc");
  check(history.response.ok, "history request must succeed");
  const items = history.body.works?.items ?? history.body.items ?? [];
  check(items.some((item) => item.id === parent.id), "link-remix parent must remain in history");
  check(!items.some((item) => item.id === child.id), "video-cover child must be hidden from history");
  const detail = await request(`/api/works/${parent.id}`);
  check(detail.body.work?.content_json?.trafficCopyState?.covers?.[0]?.workId === child.id, "parent workflow must recover its existing cover child");
  console.log(JSON.stringify({ status: "passed", fixture: "traffic-cover-history", assertions }));
} finally {
  if (userId) await pool.query("delete from users where id=$1", [userId]).catch(() => undefined);
  await pool.end();
}
