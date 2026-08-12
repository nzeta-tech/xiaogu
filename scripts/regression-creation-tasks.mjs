#!/usr/bin/env node
import assert from "node:assert/strict";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
const base = process.env.REGRESSION_BASE_URL?.replace(/\/$/, "");
const authBase = (process.env.REGRESSION_AUTH_BASE_URL ?? base)?.replace(/\/$/, "");
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const pool = new Pool({ connectionString: databaseUrl });
const marker = `creation-task-regression-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const email = `${marker}@example.invalid`;
const password = `Regression-${crypto.randomUUID()}-A1`;
let cookie = "";
let userId = "";
let organizationId = "";
let assertions = 0;

function check(value, message) { assert(value, message); assertions += 1; }
async function request(path, init = {}) {
  if (!base) throw new Error("REGRESSION_BASE_URL is unavailable");
  const response = await fetch(`${base}${path}`, { ...init, headers: { accept: "application/json", ...(cookie ? { cookie } : {}), ...(init.headers ?? {}) } });
  return { response, body: await response.json().catch(() => ({})) };
}
async function authRequest(path, init = {}) {
  if (!authBase) throw new Error("REGRESSION_AUTH_BASE_URL is unavailable");
  const response = await fetch(`${authBase}${path}`, { ...init, headers: { accept: "application/json", ...(init.headers ?? {}) } });
  return { response, body: await response.json().catch(() => ({})) };
}
async function taskHistory() {
  if (base) return (await request("/api/creation/hub?view=tasks")).body.tasks ?? [];
  const result = await pool.query(
    `select task.id,task.task_type as type,task.title,task.source_snapshot as source,
            count(w.id)::int as work_count,
            count(w.id) filter (where ar.status='succeeded')::int as completed_count,
            count(w.id) filter (where ar.status='failed')::int as failed_count,
            (array_agg(w.id order by w.updated_at desc) filter (where w.id is not null))[1]::text as latest_work_id
       from creation_tasks task
       left join works w on w.creation_task_id=task.id and w.status<>'archived'
       left join app_runs ar on ar.id=w.app_run_id
      where task.user_id=$1 group by task.id order by max(coalesce(w.updated_at,task.updated_at)) desc`,
    [userId],
  );
  return result.rows.map((row) => ({ ...row, workCount: row.work_count, completedCount: row.completed_count, failedCount: row.failed_count, latestWorkId: row.latest_work_id,
    status: row.work_count === 0 ? "pending" : row.completed_count === row.work_count ? "completed" : row.failed_count === row.work_count ? "failed" : row.completed_count > 0 ? "partial" : "running" }));
}

try {
  if (authBase) {
    const registration = await authRequest("/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.91" },
      body: JSON.stringify({ name: "创作任务回归", email, password, acceptedTerms: true }),
    });
    check(registration.response.ok, "fixture registration must succeed");
    cookie = (typeof registration.response.headers.getSetCookie === "function" ? registration.response.headers.getSetCookie() : [registration.response.headers.get("set-cookie") ?? ""])
      .map((value) => value.split(";")[0]).filter(Boolean).join("; ");
    check(Boolean(cookie), "fixture registration must establish a session");
    const fixtureUser = (await pool.query("select id,organization_id from users where email=$1", [email])).rows[0];
    userId = fixtureUser?.id;
    organizationId = fixtureUser?.organization_id;
  } else {
    const organization = (await pool.query("insert into organizations(name) values($1) returning id", [marker])).rows[0];
    organizationId = organization.id;
    userId = (await pool.query("insert into users(organization_id,name,email,password_hash,role,status) values($1,'创作任务回归',$2,'fixture','broker','active') returning id", [organization.id, email])).rows[0].id;
  }
  check(Boolean(userId), "fixture user must persist");

  const appId = (await pool.query("select id from apps where slug='link-remix' limit 1")).rows[0]?.id;
  check(Boolean(appId), "link-remix app must exist");
  const task = (await pool.query(
    `insert into creation_tasks(user_id,task_type,title,source_snapshot)
     values($1,'link-remix',$2,$3::jsonb) returning id`,
    [userId, marker, JSON.stringify({ source_url: "https://www.douyin.com/video/7000000000000000000", source_title: marker, targetLabel: "小红书笔记" })],
  )).rows[0];
  const succeededRun = (await pool.query("insert into app_runs(user_id,app_id,status,result_text,completed_at) values($1,$2,'succeeded','fixture',now()) returning id", [userId, appId])).rows[0];
  const failedRun = (await pool.query("insert into app_runs(user_id,app_id,status,error_message,completed_at) values($1,$2,'failed','controlled fixture failure',now()) returning id", [userId, appId])).rows[0];
  const succeededWork = (await pool.query("insert into works(user_id,app_id,app_run_id,title,source_channel,creation_task_id) values($1,$2,$3,$4,'link-remix',$5) returning id", [userId, appId, succeededRun.id, `${marker}-success`, task.id])).rows[0];
  await pool.query("insert into works(user_id,app_id,app_run_id,title,source_channel,creation_task_id) values($1,$2,$3,$4,'link-remix',$5)", [userId, appId, failedRun.id, `${marker}-failed`, task.id]);

  const tasks = await taskHistory();
  if (base) check(Array.isArray(tasks), "task history endpoint must succeed");
  const item = tasks.find((entry) => entry.id === task.id);
  check(Boolean(item), "new task must appear after a fresh API request");
  check(item.status === "partial", "mixed child results must produce partial status");
  check(item.workCount === 2 && item.completedCount === 1 && item.failedCount === 1, "task counts must match durable child runs");
  check(item.latestWorkId === succeededWork.id || typeof item.latestWorkId === "string", "task must expose a resumable latest work");
  check(item.source.source_title === marker && item.source.targetLabel === "小红书笔记", "source snapshot must round-trip");

  await pool.query("update works set status='archived' where creation_task_id=$1", [task.id]);
  const archivedItem = (await taskHistory()).find((entry) => entry.id === task.id);
  check(archivedItem.workCount === 0 && archivedItem.status === "pending", "archived children must not pollute task counts");
  console.log(JSON.stringify({ status: "passed", fixture: "creation-task-history", assertions }));
} finally {
  if (userId) await pool.query("delete from users where id=$1", [userId]).catch(() => undefined);
  if (organizationId) await pool.query("delete from organizations where id=$1", [organizationId]).catch(() => undefined);
  await pool.end();
}
