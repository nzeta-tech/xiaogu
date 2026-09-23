import { requireLocalAgent } from "@/lib/local-agent/auth";
import { updateDigitalHumanVideoJobById } from "@/lib/digital-human/store";

export async function POST(request: Request) {
  const unauthorized = requireLocalAgent(request);
  if (unauthorized) return unauthorized;
  const body = await request.json().catch(() => ({})) as { jobId?: string; progress?: number; stage?: string; creativeSummary?: string[]; providerJobId?: string; materialPlan?: unknown };
  if (!body.jobId || !/^[0-9a-f-]{36}$/i.test(body.jobId)) return Response.json({ error: "invalid_job" }, { status: 400 });
  const progress = Math.min(Math.max(Number(body.progress) || 0, 0), 100);
  const updated = await updateDigitalHumanVideoJobById(body.jobId, { progress, providerJobId:body.providerJobId, request: { stage: String(body.stage || "processing").slice(0, 80), creative_summary: Array.isArray(body.creativeSummary) ? body.creativeSummary.map(String).slice(0, 6) : [], ...(body.materialPlan?{material_plan:body.materialPlan}:{}) } });
  return updated ? Response.json({ ok: true }) : Response.json({ error: "job_not_found" }, { status: 404 });
}
