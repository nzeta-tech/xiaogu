import { requireSessionUser } from "@/lib/auth/session";
import { tryListAdminAuditLogs } from "@/lib/db/repositories";

export async function GET() {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  if (user.role !== "admin") return Response.json({ error: "无权访问审计日志" }, { status: 403 });

  const logs = await tryListAdminAuditLogs();
  return Response.json({ logs, mode: "server" });
}
