import { z } from "zod";
import { requireSessionUser } from "@/lib/auth/session";
import { tryCreateAdminAuditLog, tryListAdminViralCreators, tryUpdateAdminViralCreatorStatuses } from "@/lib/db/repositories";

const updateSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
  status: z.enum(["active", "paused", "excluded"]),
});

async function requireAdmin() {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  if (user.role !== "admin") return Response.json({ error: "无权访问作者候选池" }, { status: 403 });
  return user;
}

export async function GET() {
  const user = await requireAdmin();
  if (user instanceof Response) return user;
  return Response.json({ creators: await tryListAdminViralCreators(), mode: "server" });
}

export async function PATCH(request: Request) {
  const user = await requireAdmin();
  if (user instanceof Response) return user;
  const input = updateSchema.parse(await request.json());
  const creators = await tryUpdateAdminViralCreatorStatuses(input.ids, input.status);
  if (creators.length !== input.ids.length) return Response.json({ error: "部分作者状态更新失败，请刷新后重试" }, { status: 503 });
  await tryCreateAdminAuditLog({
    adminUserId: user.id,
    action: "viral_creator.update_status",
    targetType: "viral_creator",
    targetId: input.ids.length === 1 ? input.ids[0] : "batch",
    detail: { count: creators.length, displayNames: creators.map((creator) => creator.display_name), status: input.status },
  });
  return Response.json({ creators, mode: "server" });
}
