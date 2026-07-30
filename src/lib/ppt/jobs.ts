import { createHash } from "node:crypto";
import { query } from "@/lib/db/client";
import { completeLocalAgentTask, enqueueLocalAgentTask } from "@/lib/local-agent/repository";

export type PresentationJob = {
  id: string; taskId: string | null; status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  title: string; errorMessage: string | null; pageCount: number | null; workId: string | null; createdAt: string; completedAt: string | null;
};

export async function createPresentationJob(input: { userId: string; title: string; brief: Record<string, unknown>; appRunId?: string | null; workId?: string | null }) {
  const created = await query<{ id: string }>(
    `insert into presentation_jobs(user_id,app_run_id,work_id,title,input_summary)
     values($1,$2,$3,$4,$5::jsonb) returning id`,
    [input.userId, input.appRunId ?? null, input.workId ?? null, input.title, JSON.stringify(input.brief)],
  );
  const jobId = created.rows[0]?.id;
  if (!jobId) throw new Error("无法创建 PPT 任务");
  const task = await enqueueLocalAgentTask({
    taskType: "ppt.generate", ownerUserId: input.userId, dedupeKey: null, priority: 20, maxAttempts: 2,
    payload: { jobId, title: input.title, brief: input.brief },
  });
  await query("update presentation_jobs set task_id=$2,updated_at=now() where id=$1", [jobId, task.id]);
  return { jobId, taskId: task.id };
}

export async function attachPresentationWork(jobId: string, userId: string, workId: string) {
  await query("update presentation_jobs set work_id=$3,updated_at=now() where id=$1 and user_id=$2", [jobId, userId, workId]);
}

export async function getOwnedPresentationJob(userId: string, jobId: string): Promise<PresentationJob | null> {
  const result = await query<{
    id: string; task_id: string | null; status: PresentationJob["status"]; title: string; error_message: string | null;
    page_count: number | null; work_id: string | null; created_at: string; completed_at: string | null;
  }>(`select id,task_id,status,title,error_message,page_count,work_id,created_at,completed_at from presentation_jobs where id=$1 and user_id=$2`, [jobId, userId]);
  const row = result.rows[0];
  return row ? { id: row.id, taskId: row.task_id, status: row.status, title: row.title, errorMessage: row.error_message, pageCount: row.page_count, workId: row.work_id, createdAt: row.created_at, completedAt: row.completed_at } : null;
}

export async function listOwnedPresentationJobs(userId: string, limit = 50): Promise<PresentationJob[]> {
  const result = await query<{
    id: string; task_id: string | null; status: PresentationJob["status"]; title: string; error_message: string | null;
    page_count: number | null; work_id: string | null; created_at: string; completed_at: string | null;
  }>(`select id,task_id,status,title,error_message,page_count,work_id,created_at,completed_at
      from presentation_jobs where user_id=$1 order by created_at desc limit $2`, [userId, Math.min(Math.max(limit, 1), 100)]);
  return result.rows.map((row) => ({ id: row.id, taskId: row.task_id, status: row.status, title: row.title, errorMessage: row.error_message, pageCount: row.page_count, workId: row.work_id, createdAt: row.created_at, completedAt: row.completed_at }));
}

export async function completePresentationJob(input: { taskId: string; agentId: string; leaseToken: string; result: Record<string, unknown>; pptxBase64: string; coverBase64?: string; filename: string; pageCount: number }) {
  const pptx = Buffer.from(input.pptxBase64, "base64");
  if (pptx.length < 1024 || pptx.length > 25 * 1024 * 1024 || !pptx.subarray(0, 2).equals(Buffer.from("PK"))) throw new Error("invalid_pptx_artifact");
  const task = await query<{ payload: { jobId?: string } }>("select payload from local_agent_tasks where id=$1", [input.taskId]);
  const jobId = task.rows[0]?.payload?.jobId;
  if (!jobId) throw new Error("presentation_job_not_found");
  const completed = await completeLocalAgentTask(input.taskId, input.agentId, input.leaseToken, input.result);
  if (!completed) return false;
  const cover = input.coverBase64 ? Buffer.from(input.coverBase64, "base64") : null;
  await query(
    `insert into presentation_artifacts(job_id,filename,pptx_data,cover_png_data,size_bytes,sha256)
     values($1,$2,$3,$4,$5,$6)
     on conflict(job_id) do update set filename=excluded.filename,pptx_data=excluded.pptx_data,cover_png_data=excluded.cover_png_data,size_bytes=excluded.size_bytes,sha256=excluded.sha256,created_at=now()`,
    [jobId, input.filename.slice(0, 180), pptx, cover, pptx.length, createHash("sha256").update(pptx).digest("hex")],
  );
  const pageCount = Math.min(Math.max(input.pageCount || 0, 1), 100);
  await query("update presentation_jobs set status='succeeded',page_count=$2,error_message=null,completed_at=now(),updated_at=now() where id=$1", [jobId, pageCount]);
  await syncPresentationWork(jobId, `PPT 已制作完成，可在此下载并继续编辑。\n\nPPT_JOB_ID: ${jobId}\n页数：${pageCount} 页\n状态：已完成`);
  return true;
}

export async function failPresentationJob(taskId: string, message: string) {
  void message;
  await query(
    `update presentation_jobs set
       status=case when (select status from local_agent_tasks where id=$1)='failed' then 'failed' else 'queued' end,
       error_message=case when (select status from local_agent_tasks where id=$1)='failed' then $2 else null end,
       completed_at=case when (select status from local_agent_tasks where id=$1)='failed' then now() else null end,
       updated_at=now()
     where task_id=$1 and status in ('queued','running')`,
    [taskId, "本地 PPT 引擎未能完成任务，请稍后重试。"],
  );
  const failed = await query<{ id: string; status: string }>("select id,status from presentation_jobs where task_id=$1", [taskId]);
  if (failed.rows[0]?.status === "failed") {
    await syncPresentationWork(failed.rows[0].id, `PPT 制作未完成，可返回编辑页调整后重新提交。\n\nPPT_JOB_ID: ${failed.rows[0].id}\n状态：生成失败`);
  }
}

async function syncPresentationWork(jobId: string, content: string) {
  const result = await query<{ work_id: string | null; user_id: string }>("select work_id,user_id from presentation_jobs where id=$1", [jobId]);
  const job = result.rows[0];
  if (!job?.work_id) return;
  await query("update works set status='draft',updated_at=now() where id=$1 and user_id=$2", [job.work_id, job.user_id]);
  await query(
    `update work_versions set content=$2,content_json=$3::jsonb
     where work_id=$1 and version_no=(select max(version_no) from work_versions where work_id=$1)`,
    [job.work_id, content, JSON.stringify({ presentationJobId: jobId })],
  );
}

export async function getOwnedPresentationArtifact(userId: string, jobId: string) {
  const result = await query<{ filename: string; content_type: string; pptx_data: Buffer }>(
    `select artifact.filename,artifact.content_type,artifact.pptx_data from presentation_artifacts artifact join presentation_jobs job on job.id=artifact.job_id where artifact.job_id=$1 and job.user_id=$2`, [jobId, userId],
  );
  return result.rows[0] ?? null;
}
