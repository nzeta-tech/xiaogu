import { requireSessionUser } from "@/lib/auth/session";
import { tryGetAdminSummary } from "@/lib/db/repositories";

export async function GET() {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  if (user.role !== "admin") {
    return Response.json({ error: "无权访问后台统计" }, { status: 403 });
  }

  const summary = await tryGetAdminSummary();
  if (!summary) {
    return Response.json({ error: "后台统计暂不可用，请检查数据库连接" }, { status: 503 });
  }

  return Response.json({
    summary,
    role: user.role,
    mode: "server",
  });
}
