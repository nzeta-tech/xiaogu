import { requireLocalAgent } from "@/lib/local-agent/auth";
import { failLocalAgentTask } from "@/lib/local-agent/repository";
import { failPresentationJob } from "@/lib/ppt/jobs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const unauthorized = requireLocalAgent(request);
  if (unauthorized) return unauthorized;
  const { id } = await context.params;
  const body = await request.json().catch(() => ({})) as { agentId?: string; leaseToken?: string; error?: string; retryable?: boolean };
  const ok = await failLocalAgentTask(id, body.agentId?.trim() ?? "", body.leaseToken ?? "", body.error?.trim() || "Local Agent task failed", body.retryable !== false);
  if (ok) await failPresentationJob(id, body.error?.trim() || "PPT 生成失败");
  return ok ? Response.json({ ok: true }) : Response.json({ error: "lease_not_active" }, { status: 409 });
}
