import { requireSessionUser } from "@/lib/auth/session";
import { tryCreateWork } from "@/lib/db/repositories";

export async function POST(request: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  const body = await request.json().catch(() => ({})) as { title?: string; content?: string; state?: Record<string, unknown> };
  const work = await tryCreateWork({
    userId: user.id,
    appCode: "xiaohongshu-studio",
    title: body.title?.trim() || "小红书笔记创作｜未完成",
    content: body.content ?? "",
    contentJson: { batches: [], xiaohongshuStudioState: body.state ?? {} },
    sourceChannel: "xiaohongshu-studio",
    complianceRisk: "unchecked",
  });
  if (!work) return Response.json({ error: "小红书笔记草稿创建失败" }, { status: 500 });
  return Response.json({ ok: true, work: { id: work.id, title: work.title } });
}
