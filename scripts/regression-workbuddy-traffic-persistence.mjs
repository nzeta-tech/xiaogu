#!/usr/bin/env node
import assert from "node:assert/strict";

const pg = await import(
  process.env.XIAOGU_CONTAINER_RUNTIME === "1"
    ? "file:///app/node_modules/pg/lib/index.js"
    : "pg"
);
const Pool = pg.Pool ?? pg.default?.Pool;
if (!Pool) throw new Error("pg Pool is unavailable");

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const pool = new Pool({ connectionString: databaseUrl });
const marker = `workbuddy-traffic-regression-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const email = `${marker}@example.invalid`;
let organizationId = "";
let userId = "";
let assertions = 0;
function check(value, message) { assert(value, message); assertions += 1; }

try {
  organizationId = (await pool.query("insert into organizations(name) values($1) returning id", [marker])).rows[0].id;
  userId = (await pool.query("insert into users(organization_id,name,email,password_hash,role,status,email_verified_at,terms_accepted_at) values($1,'WorkBuddy口播回归',$2,'fixture','broker','active',now(),now()) returning id", [organizationId, email])).rows[0].id;
  check(Boolean(userId), "fixture user must persist");
  const tables = await pool.query("select table_name from information_schema.tables where table_schema='public' and table_name=any($1::text[])", [["workbuddy_tasks", "workbuddy_task_steps", "workbuddy_task_messages", "workbuddy_artifacts", "workbuddy_capability_invocations"]]);
  check(tables.rowCount === 5, "all WorkBuddy persistence tables must exist");
  const app = (await pool.query("select id,points_cost from apps where slug='traffic-copy' limit 1")).rows[0];
  check(Boolean(app?.id), "traffic-copy app must exist");
  const task = (await pool.query("insert into workbuddy_tasks(user_id,title,objective,scenario,status,progress,started_at) values($1,$2,$3,'content','running',20,now()) returning id", [userId, marker, "根据热点素材先选题，再生成口播"])).rows[0];
  const step = (await pool.query("insert into workbuddy_task_steps(task_id,position,title,expert_key,skill_key,status,started_at) values($1,1,'分析口播选题','orchestrator','app.traffic-copy','completed',now()) returning id", [task.id])).rows[0];
  const topics = Array.from({ length: 6 }, (_, index) => ({ id: `topic-${index + 1}`, title: `回归选题${index + 1}`, assignedCoachId: "default" }));
  const topicRun = (await pool.query("insert into app_runs(user_id,app_id,status,input_payload,result_text,result_json,quota_cost,completed_at) values($1,$2,'succeeded',$3::jsonb,'选题分析完成',$4::jsonb,0,now()) returning id", [userId, app.id, JSON.stringify({ traffic_topic_only: "yes", source: marker }), JSON.stringify({ trafficTopicArena: { topics, research: "fixture", topicProcess: { finalists: topics } } })])).rows[0];
  const work = (await pool.query("insert into works(user_id,app_id,app_run_id,title,source_channel) values($1,$2,$3,$4,'traffic-copy') returning id", [userId, app.id, topicRun.id, `选题分析｜${marker}`])).rows[0];
  await pool.query("insert into work_versions(work_id,version_no,content,content_json,created_from) values($1,1,'',$2::jsonb,'generation')", [work.id, JSON.stringify({ trafficTopicArena: { topics, research: "fixture", topicProcess: { finalists: topics } } })]);
  await pool.query("insert into workbuddy_capability_invocations(task_id,step_id,user_id,capability_id,capability_kind,app_slug,status,input_json,output_json,work_id,app_run_id,points_cost,started_at,completed_at) values($1,$2,$3,'app.traffic-copy','app','traffic-copy','completed',$4::jsonb,$5::jsonb,$6,$7,0,now(),now())", [task.id, step.id, userId, JSON.stringify({ traffic_topic_only: "yes" }), JSON.stringify({ stage: "traffic-topics" }), work.id, topicRun.id]);
  const persistedTopics = await pool.query("select ar.result_json->'trafficTopicArena'->'topics' topics from works w join app_runs ar on ar.id=w.app_run_id where w.id=$1 and w.user_id=$2", [work.id, userId]);
  check(persistedTopics.rows[0].topics.length === 6, "the 5+1 topic arena must survive a fresh query");
  const bodyRun = (await pool.query("insert into app_runs(user_id,app_id,status,input_payload,result_text,result_json,quota_cost,completed_at) values($1,$2,'succeeded',$3::jsonb,'完整口播正文',$4::jsonb,$5,now()) returning id", [userId, app.id, JSON.stringify({ traffic_existing_work_id: work.id, traffic_selected_topic_ids: ["topic-1", "topic-2"] }), JSON.stringify({ contentJson: { plainText: "完整口播正文" } }), app.points_cost])).rows[0];
  await pool.query("update works set app_run_id=$2,title=$3,updated_at=now() where id=$1", [work.id, bodyRun.id, `口播文案（流量型）｜${marker}`]);
  await pool.query("update work_versions set content='完整口播正文',content_json=$2::jsonb where work_id=$1 and version_no=1", [work.id, JSON.stringify({ plainText: "完整口播正文" })]);
  await pool.query("insert into workbuddy_capability_invocations(task_id,step_id,user_id,capability_id,capability_kind,app_slug,status,input_json,output_json,work_id,app_run_id,points_cost,started_at,completed_at) values($1,$2,$3,'app.traffic-copy','app','traffic-copy','completed',$4::jsonb,$5::jsonb,$6,$7,$8,now(),now())", [task.id, step.id, userId, JSON.stringify({ traffic_existing_work_id: work.id, traffic_selected_topic_ids: ["topic-1", "topic-2"] }), JSON.stringify({ stage: "traffic-body" }), work.id, bodyRun.id, app.points_cost]);
  const final = await pool.query("select wv.content,w.app_run_id,count(distinct i.id)::int invocation_count,count(distinct i.work_id)::int work_count,min(i.points_cost)::int min_cost,max(i.points_cost)::int max_cost from works w join work_versions wv on wv.work_id=w.id and wv.version_no=1 join workbuddy_capability_invocations i on i.work_id=w.id where w.id=$1 group by w.id,wv.content", [work.id]);
  check(final.rows[0].content === "完整口播正文" && final.rows[0].app_run_id === bodyRun.id, "body generation must replace the run on the original work");
  check(final.rows[0].invocation_count === 2 && final.rows[0].work_count === 1, "topic and body stages must retain one work and two auditable invocations");
  check(final.rows[0].min_cost === 0 && final.rows[0].max_cost === app.points_cost, "topic analysis must be free and body generation must retain the configured cost");
} finally {
  if (userId) await pool.query("delete from users where id=$1", [userId]).catch(() => undefined);
  if (organizationId) await pool.query("delete from organizations where id=$1", [organizationId]).catch(() => undefined);
  const remaining = await pool.query("select count(*)::int count from users where email=$1", [email]).catch(() => ({ rows: [{ count: -1 }] }));
  check(remaining.rows[0].count === 0, "fixture account must be removed");
  await pool.end();
}
console.log(JSON.stringify({ status: "passed", fixture: "workbuddy-traffic-persistence", assertions }));
