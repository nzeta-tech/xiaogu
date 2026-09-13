import assert from "node:assert/strict";
import crypto from "node:crypto";
import pg from "pg";
import { creationApps } from "../src/lib/apps/catalog.ts";
import { hiddenWorkspaceCardSlugs } from "../src/lib/apps/workspace-visibility.ts";

const base = process.env.ACCEPTANCE_BASE_URL ?? "http://localhost:3000";
if (!/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(base)) throw new Error("Workbuddy lifecycle acceptance only runs against localhost");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const ids = { approvalTask: crypto.randomUUID(), runningTask: crypto.randomUUID(), artifact: crypto.randomUUID(), approval: crypto.randomUUID(), assistantMessage: crypto.randomUUID() };
let cookie = "";

async function request(path, init = {}) {
  const response = await fetch(`${base}${path}`, { ...init, headers: { ...(init.body ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}), ...init.headers } });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

try {
  const unauthorized = await request("/api/workbuddy/tasks");
  assert.equal(unauthorized.response.status, 401, "task list must require authentication");
  const login = await request("/api/auth/login", { method: "POST", body: JSON.stringify({ email: process.env.DEMO_USER_EMAIL ?? "broker@example.com", password: process.env.DEMO_USER_PASSWORD ?? "broker123" }) });
  assert.equal(login.response.status, 200, JSON.stringify(login.body));
  cookie = login.response.headers.get("set-cookie")?.split(";")[0] ?? "";
  assert.ok(cookie, "login did not return a session cookie");
  const userId = login.body.user?.id;
  assert.ok(userId, "login did not return a user id");

  const capabilityResponse = await request("/api/workbuddy/capabilities");
  assert.equal(capabilityResponse.response.status, 200);
  const capabilityIds = new Set(capabilityResponse.body.capabilities.map(item => item.id));
  const exposedApps = creationApps.filter(app => !hiddenWorkspaceCardSlugs.has(app.slug));
  for (const app of exposedApps) assert.ok(capabilityIds.has(`app.${app.slug}`), `missing exposed application capability: ${app.slug}`);
  for (const slug of hiddenWorkspaceCardSlugs) assert.ok(!capabilityIds.has(`app.${slug}`), `hidden application leaked into Workbuddy: ${slug}`);
  for (const id of ["tool.video-link-summary", "tool.link-reader", "agent.file-analysis", "agent.fast-research", "agent.deep-research"]) assert.ok(capabilityIds.has(id), `missing system capability: ${id}`);
  for (const id of ["app.digital-human-video", "mcp.openchatcut"]) assert.ok(!capabilityIds.has(id), `deferred capability exposed: ${id}`);

  const form = new FormData();
  form.append("file", new Blob(["Workbuddy 文件融合验收素材：家庭保障应先核对真实条款。"], { type: "text/plain" }), "workbuddy-acceptance.txt");
  const importedResponse = await fetch(`${base}/api/creation/import-text`, { method: "POST", headers: { cookie }, body: form });
  const imported = await importedResponse.json().catch(() => ({}));
  assert.equal(importedResponse.status, 200, JSON.stringify(imported));
  assert.match(imported.text ?? "", /家庭保障应先核对真实条款/);

  await pool.query(`insert into workbuddy_tasks(id,user_id,title,objective,status,progress,context_json) values($1,$3,'验收·交付生命周期','验证反馈与验收','waiting_approval',100,'{}'),($2,$3,'验收·运行生命周期','验证排队与取消','running',20,$4)`, [ids.approvalTask, ids.runningTask, userId, JSON.stringify({ activeExecutionId: "acceptance-execution", queuedMessages: [] })]);
  await pool.query(`insert into workbuddy_artifacts(id,task_id,artifact_type,title,content,status) values($1,$2,'delivery','验收成果','可交付内容','ready')`, [ids.artifact, ids.approvalTask]);
  await pool.query(`insert into workbuddy_task_messages(id,task_id,user_id,role,message_type,content) values($1,$2,$3,'assistant','delivery','可交付内容')`, [ids.assistantMessage, ids.approvalTask, userId]);
  await pool.query(`insert into workbuddy_approvals(id,task_id,artifact_id,status,note) values($1,$2,$3,'pending','自动化验收')`, [ids.approval, ids.approvalTask, ids.artifact]);

  const list = await request("/api/workbuddy/tasks");
  assert.equal(list.response.status, 200);
  assert.ok(list.body.workspace?.tasks?.some(item => item.id === ids.approvalTask));
  const detail = await request(`/api/workbuddy/tasks/${ids.approvalTask}`);
  assert.equal(detail.response.status, 200);
  assert.equal(detail.body.task.approvals[0].status, "pending");
  const feedback = await request(`/api/workbuddy/tasks/${ids.approvalTask}`, { method: "PATCH", body: JSON.stringify({ action: "message-feedback", messageId: ids.assistantMessage, rating: "up" }) });
  assert.equal(feedback.response.status, 200);
  const feedbackRow = await pool.query(`select metadata_json->>'feedback' feedback from workbuddy_task_messages where id=$1`, [ids.assistantMessage]);
  assert.equal(feedbackRow.rows[0]?.feedback, "up");
  const approval = await request(`/api/workbuddy/tasks/${ids.approvalTask}`, { method: "PATCH", body: JSON.stringify({ action: "resolve-approval", approvalId: ids.approval, decision: "approved", note: "验收通过" }) });
  assert.equal(approval.response.status, 200);
  assert.equal(approval.body.task.status, "completed");
  assert.equal(approval.body.task.approvals[0].status, "approved");
  assert.equal(approval.body.task.artifacts[0].status, "approved");

  const queued = await request(`/api/workbuddy/tasks/${ids.runningTask}`, { method: "PATCH", body: JSON.stringify({ action: "continue-task", message: "把两个例子分别做成图片", context: "例子一：早睡。\n例子二：陪伴家人。", requestedCapabilityId: "app.image-card" }) });
  assert.equal(queued.response.status, 200);
  const queueRow = await pool.query(`select context_json->'queuedMessages' queue from workbuddy_tasks where id=$1`, [ids.runningTask]);
  assert.equal(queueRow.rows[0].queue.length, 1);
  assert.equal(queueRow.rows[0].queue[0].mode, "next-turn");
  assert.equal(queueRow.rows[0].queue[0].requestedCapabilityId, "app.image-card");
  assert.match(queueRow.rows[0].queue[0].supplementalContext, /例子一/);
  const cancelled = await request(`/api/workbuddy/tasks/${ids.runningTask}`, { method: "PATCH", body: JSON.stringify({ action: "cancel-task" }) });
  assert.equal(cancelled.response.status, 200);
  assert.equal(cancelled.body.task.status, "cancelled");

  console.log(JSON.stringify({ passed: true, exposedApplications: exposedApps.length, checks: ["auth-boundary", "capability-catalog", "hidden-app-boundary", "system-skills", "file-import", "task-list", "task-detail", "message-feedback", "approval", "artifact-approval", "queued-capability-context", "cancellation"] }, null, 2));
} finally {
  await pool.query(`delete from workbuddy_tasks where id=any($1::uuid[])`, [[ids.approvalTask, ids.runningTask]]).catch(() => undefined);
  await pool.end();
}
