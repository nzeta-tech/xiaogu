import { z } from "zod";
import { requireSessionUser } from "@/lib/auth/session";
import { tryCountActiveAdmins, tryCreateAdminAuditLog, tryListAdminUsers, tryUpdateAdminUser } from "@/lib/db/repositories";

const updateUserSchema = z.object({
  userId: z.string().uuid(),
  status: z.enum(["active", "suspended"]).optional(),
  role: z.enum(["broker", "admin"]).optional(),
});

export async function GET() {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  if (user.role !== "admin") return Response.json({ error: "无权访问用户管理" }, { status: 403 });

  const users = await tryListAdminUsers();
  return Response.json({ users, mode: "server" });
}

export async function PATCH(request: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  if (user.role !== "admin") return Response.json({ error: "无权更新用户" }, { status: 403 });

  const input = updateUserSchema.parse(await request.json());
  if (input.userId === user.id && (input.status === "suspended" || input.role === "broker")) {
    return Response.json({ error: "不能停用当前管理员或降低自己的权限" }, { status: 400 });
  }
  if (input.status === "suspended" || input.role === "broker") {
    const users = await tryListAdminUsers();
    const target = users.find((item) => item.id === input.userId);
    if (target?.role === "admin" && target.status === "active") {
      const activeAdmins = await tryCountActiveAdmins();
      if (activeAdmins === null) return Response.json({ error: "无法校验管理员数量，请稍后重试" }, { status: 503 });
      if (activeAdmins <= 1) return Response.json({ error: "系统必须至少保留一个可用管理员" }, { status: 409 });
    }
  }

  const updated = await tryUpdateAdminUser(input);
  if (!updated) return Response.json({ error: "用户更新失败" }, { status: 503 });

  await tryCreateAdminAuditLog({
    adminUserId: user.id,
    action: "user.update",
    targetType: "user",
    targetId: input.userId,
    detail: input,
  });

  return Response.json({ user: updated, mode: "server" });
}
