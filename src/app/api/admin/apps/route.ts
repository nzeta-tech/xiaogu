import { z } from "zod";
import { requireSessionUser } from "@/lib/auth/session";
import { tryCreateAdminAuditLog, tryListAdminCreationApps, tryUpdateAdminCreationApp } from "@/lib/db/repositories";

const updateSchema = z.object({
  appId: z.string().uuid(),
  status: z.enum(["active", "inactive"]).optional(),
  featured: z.boolean().optional(),
  pointsCost: z.number().int().min(0).max(100000).optional(),
  badge: z.string().trim().max(40).optional().or(z.literal("")),
  sortOrder: z.number().int().min(0).max(100000).optional(),
});

async function requireAdmin() {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  if (user.role !== "admin") return Response.json({ error: "无权访问创作应用管理" }, { status: 403 });
  return user;
}

export async function GET() {
  const user = await requireAdmin();
  if (user instanceof Response) return user;

  const apps = await tryListAdminCreationApps();
  return Response.json({ apps, mode: "server" });
}

export async function PATCH(request: Request) {
  const user = await requireAdmin();
  if (user instanceof Response) return user;

  const input = updateSchema.parse(await request.json());
  const app = await tryUpdateAdminCreationApp({
    appId: input.appId,
    status: input.status,
    featured: input.featured,
    pointsCost: input.pointsCost,
    badge: input.badge || null,
    sortOrder: input.sortOrder,
  });
  if (!app) return Response.json({ error: "创作应用更新失败" }, { status: 503 });

  await tryCreateAdminAuditLog({
    adminUserId: user.id,
    action: "creation_app.update",
    targetType: "creation_app",
    targetId: input.appId,
    detail: input,
  });

  return Response.json({ app, mode: "server" });
}
