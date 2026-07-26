import { requireLocalAgent } from "@/lib/local-agent/auth";
import { completeLocalAgentTask } from "@/lib/local-agent/repository";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const unauthorized = requireLocalAgent(request);
  if (unauthorized) return unauthorized;
  const { id } = await context.params;
  const body = await request.json().catch(() => ({})) as { agentId?: string; leaseToken?: string; result?: Record<string, unknown> };
  if (!body.result || typeof body.result !== "object" || Array.isArray(body.result)) return Response.json({ error: "result_required" }, { status: 400 });
  const ok = await completeLocalAgentTask(id, body.agentId?.trim() ?? "", body.leaseToken ?? "", body.result);
  return ok ? Response.json({ ok: true }) : Response.json({ error: "lease_not_active" }, { status: 409 });
}
