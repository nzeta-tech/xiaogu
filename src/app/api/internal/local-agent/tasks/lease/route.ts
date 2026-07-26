import { requireLocalAgent } from "@/lib/local-agent/auth";
import { LOCAL_AGENT_PROTOCOL_VERSION, isLocalAgentTaskType } from "@/lib/local-agent/contracts";
import { leaseLocalAgentTask } from "@/lib/local-agent/repository";

export async function POST(request: Request) {
  const unauthorized = requireLocalAgent(request);
  if (unauthorized) return unauthorized;
  const body = await request.json().catch(() => ({})) as { agentId?: string; capabilities?: string[]; leaseSeconds?: number; protocolVersion?: number };
  const agentId = body.agentId?.trim().slice(0, 120);
  if (!agentId) return Response.json({ error: "agent_id_required" }, { status: 400 });
  if (Number(body.protocolVersion) !== LOCAL_AGENT_PROTOCOL_VERSION) {
    return Response.json({ error: "incompatible_agent_protocol", expectedProtocolVersion: LOCAL_AGENT_PROTOCOL_VERSION }, { status: 409 });
  }
  const capabilities = [...new Set((body.capabilities ?? []).filter(isLocalAgentTaskType))];
  const leaseSeconds = Math.min(Math.max(Number(body.leaseSeconds) || 300, 60), 1800);
  const leased = await leaseLocalAgentTask({ agentId, capabilities, leaseSeconds });
  return Response.json(leased ?? { task: null }, { headers: { "cache-control": "no-store" } });
}
