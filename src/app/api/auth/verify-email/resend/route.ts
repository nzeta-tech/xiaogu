import { z } from "zod";
import { createAndSendAuthToken, findActiveUserForEmail } from "@/lib/auth/actions";
import { checkRateLimit, requestClientKey } from "@/lib/security/rate-limit";
import { tryGetSystemSettings } from "@/lib/db/repositories";

export async function POST(request: Request) {
  const settings = await tryGetSystemSettings();
  if (!settings.auth.emailVerificationEnabled || !settings.email.enabled) return Response.json({ error: "邮箱验证暂未开放" }, { status: 403 });
  const limit = checkRateLimit(`verify-email:${requestClientKey(request)}`, 5, 60 * 60 * 1000);
  if (!limit.ok) return Response.json({ error: "请求过于频繁" }, { status: 429 });
  const parsed = z.object({ email: z.string().trim().email() }).safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "邮箱格式不正确" }, { status: 400 });
  const user = await findActiveUserForEmail(parsed.data.email);
  if (user && !user.email_verified_at) await createAndSendAuthToken({ userId: user.id, email: user.email, name: user.name, type: "verify_email" });
  return Response.json({ ok: true });
}
