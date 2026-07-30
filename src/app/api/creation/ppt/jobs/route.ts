import { requireSessionUser } from "@/lib/auth/session";
import { requireQuota } from "@/lib/billing/enforce";
import { tryCreateWork } from "@/lib/db/repositories";
import { createPresentationJob, listOwnedPresentationJobs } from "@/lib/ppt/jobs";

const MAX_SOURCE_CHARS = 60000;
const pageCounts = new Set([5, 8, 12]);

function createShortTitle(topic: string, source: string) {
  const fallback = source.split(/\r?\n/).find((line) => line.trim()) ?? "未命名 PPT";
  const value = (topic || fallback).replace(/\s+/g, " ").trim();
  return value.length > 20 ? `${value.slice(0, 19)}…` : value;
}

export async function GET() {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  return Response.json({ jobs: await listOwnedPresentationJobs(user.id) });
}

export async function POST(request: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const source = typeof body.source === "string" ? body.source.trim() : "";
  const topic = typeof body.topic === "string" ? body.topic.trim() : "";
  const style = typeof body.style === "string" ? body.style.trim() : "professional";
  const pageCount = Number(body.pageCount);
  if (!topic && !source) return Response.json({ error: "请填写主题或上传资料。" }, { status: 400 });
  if (!pageCounts.has(pageCount)) return Response.json({ error: "页数仅支持 5、8 或 12 页。" }, { status: 400 });
  const quota = await requireQuota(user, "write_script", 12);
  if (!quota.ok) return quota.response;
  const title = createShortTitle(topic, source);
  const brief = { topic: topic.slice(0, 120), source: source.slice(0, MAX_SOURCE_CHARS), style, pageCount, compliance: "保险内容不得承诺收益或夸大保障；不确定事实须明确标注待核验。" };
  try {
    const work = await tryCreateWork({ userId: user.id, appCode: "ppt-maker", sourceChannel: "ppt-maker", title, content: "PPT 任务已提交，正在由本地 Agent 制作。" });
    const job = await createPresentationJob({ userId: user.id, title, brief, workId: work?.id });
    return Response.json({ ok: true, job });
  } catch {
    return Response.json({ error: "PPT 任务暂时无法创建，请稍后重试。" }, { status: 503 });
  }
}
