import { z } from "zod";
import { requireSessionUser } from "@/lib/auth/session";
import { tryCountActiveAdmins, tryCreateAdminAuditLog, tryListAdminUsers, tryUpdateAdminUser } from "@/lib/db/repositories";
import { filterAndPaginateAdminRows, parseAdminListQuery } from "@/lib/admin/list-query";

const updateUserSchema = z.object({
  userId: z.string().uuid().optional(),
  userIds: z.array(z.string().uuid()).min(1).max(100).optional(),
  status: z.enum(["active", "suspended"]).optional(),
  role: z.enum(["broker", "admin"]).optional(),
}).refine((value) => Boolean(value.userId || value.userIds?.length), { message: "请选择要更新的用户" });

export async function GET(request: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  if (user.role !== "admin") return Response.json({ error: "无权访问用户管理" }, { status: 403 });

  const users = await tryListAdminUsers();
  const result = filterAndPaginateAdminRows(users, parseAdminListQuery(request, { defaultLimit: 20, maxLimit: 200 }), (item) => `${item.name} ${item.email} ${item.role} ${item.status}`, (item) => item.status);
  return Response.json({ users: result.rows, pagination: result.pagination, mode: "server" });
}

export async function PATCH(request: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  if (user.role !== "admin") return Response.json({ error: "无权更新用户" }, { status: 403 });

  const input = updateUserSchema.parse(await request.json());
  const userIds = [...new Set(input.userIds ?? (input.userId ? [input.userId] : []))];
  if (userIds.includes(user.id) && (input.status === "suspended" || input.role === "broker")) {
    return Response.json({ error: "不能停用当前管理员或降低自己的权限" }, { status: 400 });
  }
  if (input.status === "suspended" || input.role === "broker") {
    const users = await tryListAdminUsers();
    const activeAdminTargets = users.filter((item) => userIds.includes(item.id) && item.role === "admin" && item.status === "active").length;
    if (activeAdminTargets > 0) {
      const activeAdmins = await tryCountActiveAdmins();
      if (activeAdmins === null) return Response.json({ error: "无法校验管理员数量，请稍后重试" }, { status: 503 });
      if (activeAdmins - activeAdminTargets < 1) return Response.json({ error: "系统必须至少保留一个可用管理员" }, { status: 409 });
    }
  }

  const updated = (await Promise.all(userIds.map((userId) => tryUpdateAdminUser({ userId, status: input.status, role: input.role })))).filter(Boolean);
  if (updated.length !== userIds.length) return Response.json({ error: "部分用户更新失败，请刷新后核对" }, { status: 503 });

  await tryCreateAdminAuditLog({
    adminUserId: user.id,
    action: userIds.length > 1 ? "user.batch_update" : "user.update",
    targetType: "user",
    targetId: userIds.length === 1 ? userIds[0] : "batch",
    detail: { userIds, status: input.status, role: input.role },
  });

  return Response.json({ user: updated[0], users: updated, mode: "server" });
}
