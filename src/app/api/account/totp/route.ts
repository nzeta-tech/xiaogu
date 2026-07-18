import { z } from "zod";
import { requireSessionUser } from "@/lib/auth/session";
import { verifyUser } from "@/lib/auth/users";
import { query } from "@/lib/db/client";
import { tryGetSystemSettings } from "@/lib/db/repositories";
import { createTotpSetup, disableTotp, enableTotp } from "@/lib/security/totp";

export async function GET() {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  const settings = await tryGetSystemSettings();
  const result = await query<{ totp_enabled: boolean; totp_secret_encrypted: string }>("select totp_enabled,totp_secret_encrypted from users where id=$1", [user.id]);
  return Response.json({ available: settings.auth.totpEnabled, enabled: result.rows[0]?.totp_enabled === true, setupPending: Boolean(result.rows[0]?.totp_secret_encrypted) && result.rows[0]?.totp_enabled !== true });
}

export async function POST(request: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  const parsed = z.discriminatedUnion("action", [
    z.object({ action: z.literal("setup"), password: z.string().min(1) }),
    z.object({ action: z.literal("enable"), token: z.string().min(6).max(20) }),
    z.object({ action: z.literal("disable"), password: z.string().min(1), token: z.string().min(6).max(20) }),
  ]).safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "二次验证参数不正确" }, { status: 400 });
  const settings = await tryGetSystemSettings();
  if (!settings.auth.totpEnabled) return Response.json({ error: "管理员尚未开放二次验证" }, { status: 403 });

  if (parsed.data.action === "setup") {
    if (!await verifyUser(user.email, parsed.data.password)) return Response.json({ error: "当前密码不正确" }, { status: 403 });
    return Response.json({ setup: await createTotpSetup({ userId: user.id, email: user.email, issuer: settings.auth.totpIssuer }) });
  }
  if (parsed.data.action === "enable") {
    const recoveryCodes = await enableTotp(user.id, parsed.data.token);
    return recoveryCodes ? Response.json({ enabled: true, recoveryCodes }) : Response.json({ error: "验证码不正确" }, { status: 400 });
  }
  if (!await verifyUser(user.email, parsed.data.password)) return Response.json({ error: "当前密码不正确" }, { status: 403 });
  return await disableTotp(user.id, parsed.data.token)
    ? Response.json({ enabled: false })
    : Response.json({ error: "验证码或恢复码不正确" }, { status: 400 });
}
