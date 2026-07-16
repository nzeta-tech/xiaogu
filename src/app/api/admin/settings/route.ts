import { z } from "zod";
import { requireSessionUser } from "@/lib/auth/session";
import { tryCreateAdminAuditLog, tryGetSystemSettings, tryUpdateSystemSettings } from "@/lib/db/repositories";

const schema = z.object({
  site: z.object({
    siteName: z.string().trim().min(1).max(40),
    siteSubtitle: z.string().trim().min(1).max(120),
    supportContact: z.string().trim().max(180),
    footerNote: z.string().trim().max(300),
  }).optional(),
  auth: z.object({
    allowRegistration: z.boolean(),
    requireInviteCode: z.boolean(),
    passwordHint: z.string().trim().min(1).max(120),
  }).optional(),
  payment: z.object({
    enableStripe: z.boolean(),
    enableManualTransfer: z.boolean().optional(),
    displaySubscriptions: z.boolean(),
    purchaseNotice: z.string().trim().max(500),
  }).optional(),
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
  await tryCreateAdminAuditLog({
    adminUserId: user.id,
    action: "settings.update",
    targetType: "system_settings",
    detail: input,
  });
  return Response.json({ settings, mode: "server" });
}
