import { requireSessionUser } from "@/lib/auth/session";
import { parseAdminListQuery } from "@/lib/admin/list-query";
import { tryGetAdminContentOverview } from "@/lib/db/repositories";

export async function GET(request: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  if (user.role !== "admin") {
    return Response.json({ error: "无权访问内容运营后台" }, { status: 403 });
  }

  const { page, limit } = parseAdminListQuery(request, { defaultLimit: 20, maxLimit: 100 });
  const content = await tryGetAdminContentOverview({ page, limit });
  if (!content) {
    return Response.json({ error: "内容运营数据暂不可用，请检查数据库连接" }, { status: 503 });
  }

  return Response.json({ content, pagination: { page, limit, total: content.recentWorksTotal, pages: Math.max(Math.ceil(content.recentWorksTotal / limit), 1) }, mode: "server" });
}
