import { requireLocalAgent } from "@/lib/local-agent/auth";
import { completePresentationJob } from "@/lib/ppt/jobs";
export async function POST(request: Request) {
  const unauthorized = requireLocalAgent(request); if (unauthorized) return unauthorized;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const required = ["taskId", "agentId", "leaseToken", "pptxBase64", "filename"];
  if (required.some((key) => typeof body[key] !== "string" || !String(body[key]).trim())) return Response.json({ error: "invalid_payload" }, { status: 400 });
  try {
    const ok = await completePresentationJob({ taskId: String(body.taskId), agentId: String(body.agentId), leaseToken: String(body.leaseToken), pptxBase64: String(body.pptxBase64), coverBase64: typeof body.coverBase64 === "string" ? body.coverBase64 : undefined, filename: String(body.filename), pageCount: Number(body.pageCount), result: body.result && typeof body.result === "object" ? body.result as Record<string, unknown> : {} });
    return ok ? Response.json({ ok: true }) : Response.json({ error: "lease_not_active" }, { status: 409 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "artifact_rejected" }, { status: 422 }); }
}
