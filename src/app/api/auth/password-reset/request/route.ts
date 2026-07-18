import { z } from "zod";
import { createAndSendAuthToken, findActiveUserForEmail } from "@/lib/auth/actions";
import { tryGetSystemSettings } from "@/lib/db/repositories";
import { checkRateLimit, requestClientKey } from "@/lib/security/rate-limit";

export async function POST(request: Request) {
  const settings = await tryGetSystemSettings();
  if (!settings.auth.passwordResetEnabled || !settings.email.enabled) return Response.json({ error: "密码找回暂未开放" }, { status: 403 });
  const limit = checkRateLimit(`password-reset:${requestClientKey(request)}`, 5, 60 * 60 * 1000);
  if (!limit.ok) return Response.json({ error: "请求过于频繁，请稍后再试" }, { status: 429 });
  const parsed = z.object({ email: z.string().trim().email() }).safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "请输入正确邮箱" }, { status: 400 });
  const user = await findActiveUserForEmail(parsed.data.email);
  if (user) {
    try { await createAndSendAuthToken({ userId: user.id, email: user.email, name: user.name, type: "reset_password" }); } catch { /* Avoid account enumeration. */ }
  }
  return Response.json({ ok: true, message: "如果邮箱已注册，重置邮件会在几分钟内送达。" });
}
