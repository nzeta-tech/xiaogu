import { z } from "zod";
import { requireSessionUser } from "@/lib/auth/session";
import { tryCreateAdminAuditLog, tryListAdminAppRuns, tryTerminateAdminAppRun } from "@/lib/db/repositories";
import { filterAndPaginateAdminRows, parseAdminListQuery } from "@/lib/admin/list-query";

async function requireAdmin() {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  if (user.role !== "admin") return Response.json({ error: "无权访问任务中心" }, { status: 403 });
  return user;
}

export async function GET(request: Request) {
  const user = await requireAdmin();
  if (user instanceof Response) return user;
  const runs = await tryListAdminAppRuns(300);
  if (!runs) return Response.json({ error: "任务数据暂不可用" }, { status: 503 });
  const result = filterAndPaginateAdminRows(runs, parseAdminListQuery(request, { defaultLimit: 20, maxLimit: 300 }), (item) => `${item.app_name ?? ""} ${item.app_slug ?? ""} ${item.user_email ?? ""} ${item.model ?? ""} ${item.error_message ?? ""}`, (item) => item.status);
  return Response.json({ runs: result.rows, pagination: result.pagination });
}

export async function PATCH(request: Request) {
  const user = await requireAdmin();
  if (user instanceof Response) return user;
  const parsed = z.object({ runId: z.string().uuid(), action: z.literal("terminate") }).safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "任务操作参数不正确" }, { status: 400 });
  const run = await tryTerminateAdminAppRun(parsed.data.runId);
  if (!run) return Response.json({ error: "任务不存在、已结束或终止失败" }, { status: 409 });
  await tryCreateAdminAuditLog({ adminUserId: user.id, action: "app_run.terminate", targetType: "app_run", targetId: parsed.data.runId });
  return Response.json({ ok: true, run });
}
