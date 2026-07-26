import { requireLocalAgent } from "@/lib/local-agent/auth";
import { LOCAL_AGENT_PROTOCOL_VERSION, type LocalAgentHeartbeat, type LocalAgentNodeStatus } from "@/lib/local-agent/contracts";
import { recordLocalAgentHeartbeat } from "@/lib/local-agent/repository";

const statuses = new Set<LocalAgentNodeStatus>(["ready", "busy", "degraded", "offline"]);

export async function POST(request: Request) {
  const unauthorized = requireLocalAgent(request);
  if (unauthorized) return unauthorized;
  const body = await request.json().catch(() => ({})) as Partial<LocalAgentHeartbeat>;
  const agentId = body.agentId?.trim().slice(0, 120);
  if (!agentId || !body.status || !statuses.has(body.status)) return Response.json({ error: "invalid_heartbeat" }, { status: 400 });
  const heartbeat: LocalAgentHeartbeat = {
    agentId,
    status: body.status,
    version: body.version?.trim().slice(0, 120) ?? "",
    protocolVersion: Math.max(0, Number(body.protocolVersion) || 0),
    capabilities: booleanRecord(body.capabilities),
    health: healthRecord(body.health),
    activeTaskCount: Math.min(Math.max(Number(body.activeTaskCount) || 0, 0), 100),
  };
  await recordLocalAgentHeartbeat(heartbeat);
  if (heartbeat.protocolVersion !== LOCAL_AGENT_PROTOCOL_VERSION) {
    return Response.json({ error: "incompatible_agent_protocol", expectedProtocolVersion: LOCAL_AGENT_PROTOCOL_VERSION }, { status: 409 });
  }
  return Response.json({ ok: true, receivedAt: new Date().toISOString() }, { headers: { "cache-control": "no-store" } });
}

function booleanRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean"));
}
function healthRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, "healthy" | "unhealthy" | "disabled"] => ["healthy", "unhealthy", "disabled"].includes(String(entry[1]))));
}
