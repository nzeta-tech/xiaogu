import { requireSessionUser } from "@/lib/auth/session";
import { isSourceInspectResult } from "@/lib/local-agent/contracts";
import { getOwnedLocalAgentTask } from "@/lib/local-agent/repository";

export async function GET(_request: Request, context: { params: Promise<{ taskId: string }> }) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  const { taskId } = await context.params;
  const task = await getOwnedLocalAgentTask(taskId, user.id);
  if (!task || task.taskType !== "source.inspect") return Response.json({ error: "任务不存在。" }, { status: 404 });
  if (task.status === "succeeded") {
    if (!isSourceInspectResult(task.result)) return Response.json({ error: "本地 Agent 返回了无效结果。", status: "failed" }, { status: 502 });
    return Response.json({ taskId: task.id, status: task.status, result: task.result }, { headers: { "cache-control": "no-store" } });
  }
  return Response.json({ taskId: task.id, status: task.status, error: task.status === "failed" ? task.errorMessage : undefined }, { headers: { "cache-control": "no-store" } });
}
