import { requireSessionUser } from "@/lib/auth/session";
import { tryGetAdminContentOverview } from "@/lib/db/repositories";

export async function GET() {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  if (user.role !== "admin") {
    return Response.json({ error: "无权访问内容运营后台" }, { status: 403 });
  }

  const content = await tryGetAdminContentOverview();
  if (!content) {
    return Response.json({ error: "内容运营数据暂不可用，请检查数据库连接" }, { status: 503 });
  }

  return Response.json({ content, mode: "server" });
}
