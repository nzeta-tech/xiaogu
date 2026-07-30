import { requireSessionUser } from "@/lib/auth/session";
import { getOwnedPresentationJob } from "@/lib/ppt/jobs";
import { getOwnedLocalAgentTask } from "@/lib/local-agent/repository";
export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireSessionUser(); if (user instanceof Response) return user;
  const { id } = await context.params; const job = await getOwnedPresentationJob(user.id, id);
  if (!job) return Response.json({ error: "任务不存在" }, { status: 404 });
  const task = job.taskId ? await getOwnedLocalAgentTask(job.taskId, user.id) : null;
  return Response.json({ job, task: task ? { status: task.status, errorMessage: task.errorMessage } : null });
}
