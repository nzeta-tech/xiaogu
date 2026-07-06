import { z } from "zod";
import { requireSessionUser } from "@/lib/auth/session";
import { tryGetSystemSettings, tryUpdateSystemSettings } from "@/lib/db/repositories";

const schema = z.object({
  site: z.record(z.string(), z.unknown()).optional(),
  auth: z.record(z.string(), z.unknown()).optional(),
  payment: z.record(z.string(), z.unknown()).optional(),
});

async function requireAdmin() {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  if (user.role !== "admin") return Response.json({ error: "无权访问系统配置" }, { status: 403 });
  return user;
}

export async function GET() {
  const user = await requireAdmin();
  if (user instanceof Response) return user;

  const settings = await tryGetSystemSettings();
  return Response.json({ settings, mode: "server" });
}

export async function PATCH(request: Request) {
  const user = await requireAdmin();
  if (user instanceof Response) return user;

  const input = schema.parse(await request.json());
  const settings = await tryUpdateSystemSettings(input);
  if (!settings) {
    return Response.json({ error: "系统配置保存失败" }, { status: 503 });
  }
  return Response.json({ settings, mode: "server" });
}
