import { requireLocalAgent } from "@/lib/local-agent/auth";
import { appendLocalAgentTaskEvent } from "@/lib/local-agent/repository";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const unauthorized = requireLocalAgent(request);
  if (unauthorized) return unauthorized;
  const { id } = await context.params;
  const body = await request.json().catch(() => ({})) as {
    agentId?: string; leaseToken?: string; eventType?: string; payload?: Record<string, unknown>;
  };
  if (body.eventType !== "status" && body.eventType !== "delta") return Response.json({ error: "invalid_event_type" }, { status: 400 });
  const payload = normalizePayload(body.eventType, body.payload);
  if (!payload) return Response.json({ error: "invalid_event_payload" }, { status: 400 });
  const ok = await appendLocalAgentTaskEvent({
    id,
    agentId: body.agentId?.trim() ?? "",
    leaseToken: body.leaseToken ?? "",
    eventType: body.eventType,
    payload,
  });
  return ok ? Response.json({ ok: true }) : Response.json({ error: "lease_not_active" }, { status: 409 });
}

function normalizePayload(eventType: "status" | "delta", value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const payload = value as Record<string, unknown>;
  if (eventType === "delta") {
    const content = typeof payload.content === "string" ? payload.content.slice(0, 4000) : "";
    return content ? { content } : null;
  }
  const message = typeof payload.message === "string" ? payload.message.trim().slice(0, 240) : "";
  return message ? { message } : null;
}
