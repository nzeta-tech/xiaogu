import { requireLocalAgent } from "@/lib/local-agent/auth";
import { heartbeatLocalAgentTask } from "@/lib/local-agent/repository";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const unauthorized = requireLocalAgent(request);
  if (unauthorized) return unauthorized;
  const { id } = await context.params;
  const body = await request.json().catch(() => ({})) as { agentId?: string; leaseToken?: string; leaseSeconds?: number };
  const ok = await heartbeatLocalAgentTask(id, body.agentId?.trim() ?? "", body.leaseToken ?? "", Math.min(Math.max(Number(body.leaseSeconds) || 300, 60), 1800));
  return ok ? Response.json({ ok: true }) : Response.json({ error: "lease_not_active" }, { status: 409 });
}
