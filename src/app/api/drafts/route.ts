import { requireSessionUser } from "@/lib/auth/session";
import { tryCreateWork, tryListWorks } from "@/lib/db/repositories";

export async function GET() {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const works = await tryListWorks(user.id);
  return Response.json({ drafts: works, works, mode: "server" });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    title?: string;
    content?: string;
    platform?: string;
    conversationId?: string;
    complianceRisk?: string;
  };
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const work = await tryCreateWork({
    userId: user.id,
    conversationId: body.conversationId,
    title: body.title,
    content: body.content ?? "",
    sourceChannel: body.platform ?? "manual",
    complianceRisk: body.complianceRisk,
  });

  if (!work) {
    return Response.json({ error: "草稿保存失败，请检查数据库连接" }, { status: 503 });
  }

  return Response.json({
    ok: true,
    draft: { id: work.id, title: work.title },
    work,
    mode: "server",
  });
}
