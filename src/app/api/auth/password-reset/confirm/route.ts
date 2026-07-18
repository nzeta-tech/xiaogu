import { z } from "zod";
import { consumePasswordResetToken } from "@/lib/auth/actions";
import { tryGetSystemSettings } from "@/lib/db/repositories";

export async function POST(request: Request) {
  const settings = await tryGetSystemSettings();
  if (!settings.auth.passwordResetEnabled) return Response.json({ error: "密码找回暂未开放" }, { status: 403 });
  const parsed = z.object({ token: z.string().min(20), newPassword: z.string().min(8).max(120) }).safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "链接或新密码格式不正确" }, { status: 400 });
  const ok = await consumePasswordResetToken(parsed.data.token, parsed.data.newPassword);
  return ok ? Response.json({ ok: true }) : Response.json({ error: "重置链接无效或已过期" }, { status: 400 });
}
