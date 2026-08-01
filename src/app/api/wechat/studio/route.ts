import { requireSessionUser } from "@/lib/auth/session";
import { tryCreateWork } from "@/lib/db/repositories";

export async function POST(request: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  const body = await request.json().catch(() => ({})) as { title?: string; content?: string; state?: Record<string, unknown> };
  const work = await tryCreateWork({
    userId: user.id,
    appCode: "wechat-studio",
    title: body.title?.trim() || "公众号文章创作｜未完成",
    content: body.content ?? "",
    contentJson: { batches: [], wechatStudioState: body.state ?? {} },
    sourceChannel: "wechat-studio",
    complianceRisk: "unchecked",
  });
  if (!work) return Response.json({ error: "公众号文章草稿创建失败" }, { status: 500 });
  return Response.json({ ok: true, work: { id: work.id, title: work.title } });
}
