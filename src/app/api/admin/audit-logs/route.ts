import { requireSessionUser } from "@/lib/auth/session";
import { tryListAdminAuditLogs } from "@/lib/db/repositories";
import { filterAndPaginateAdminRows, parseAdminListQuery } from "@/lib/admin/list-query";

export async function GET(request: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  if (user.role !== "admin") return Response.json({ error: "无权访问审计日志" }, { status: 403 });

  const logs = await tryListAdminAuditLogs(300);
  const result = filterAndPaginateAdminRows(logs, parseAdminListQuery(request, { defaultLimit: 20, maxLimit: 300 }), (item) => `${item.action} ${item.target_type} ${item.target_id} ${item.admin_email ?? ""}`);
  return Response.json({ logs: result.rows, pagination: result.pagination, mode: "server" });
}
