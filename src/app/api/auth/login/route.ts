import { z } from "zod";
import { createSession, createTotpChallenge, verifyTotpChallenge } from "@/lib/auth/session";
import { verifyUser } from "@/lib/auth/users";
import { checkRateLimit, clearRateLimit, requestClientKey } from "@/lib/security/rate-limit";
import { findActiveUserForEmail, recordLoginEvent } from "@/lib/auth/actions";
import { tryGetSystemSettings } from "@/lib/db/repositories";
import { verifyTurnstile } from "@/lib/security/turnstile";
import { verifyTotpForUser } from "@/lib/security/totp";

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
  turnstileToken: z.string().optional(),
  totpCode: z.string().trim().max(20).optional(),
  totpChallenge: z.string().max(2000).optional(),
});

export async function POST(request: Request) {
  try {
    const settings = await tryGetSystemSettings();
    const clientIp = requestClientKey(request);
    const rateLimitKey = `login:${clientIp}`;
    const rateLimit = checkRateLimit(rateLimitKey, settings.auth.loginAttemptLimit, settings.auth.loginWindowMinutes * 60 * 1000);
    if (!rateLimit.ok) {
      return Response.json(
        { error: "登录尝试过多，请稍后再试" },
        { status: 429, headers: { "retry-after": String(rateLimit.retryAfter) } },
      );
    }
    const parsed = loginSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: "请输入正确的邮箱和密码" }, { status: 400 });
    }

    const input = parsed.data;
    if (input.totpChallenge) {
      const challengedUser = await verifyTotpChallenge(input.totpChallenge);
      if (!challengedUser || !input.totpCode || !await verifyTotpForUser(challengedUser.id, input.totpCode)) return Response.json({ error: "验证码或登录挑战已失效", code: "TOTP_INVALID" }, { status: 403 });
      await createSession(challengedUser);
      await recordLoginEvent({ userId: challengedUser.id, email: challengedUser.email, success: true, clientIp, userAgent: request.headers.get("user-agent") ?? "" });
      clearRateLimit(rateLimitKey);
      const requiresTermsAcceptance = settings.legal.termsEnabled && settings.legal.requireReaccept && challengedUser.termsAcceptedVersion !== settings.legal.termsVersion;
      return Response.json({ user: challengedUser, requiresTermsAcceptance });
    }
    if (!await verifyTurnstile({ settings, token: input.turnstileToken, clientIp })) {
      return Response.json({ error: "人机验证失败，请重试" }, { status: 400 });
    }
    const user = await verifyUser(input.email, input.password);
    if (!user) {
      await recordLoginEvent({ email: input.email, success: false, clientIp, userAgent: request.headers.get("user-agent") ?? "", failureReason: "invalid_credentials" });
      return Response.json({ error: "邮箱或密码不正确" }, { status: 401 });
    }

    const state = await findActiveUserForEmail(input.email);
    if (!state) return Response.json({ error: "账号不可用" }, { status: 403 });
    if (settings.auth.emailVerificationEnabled && !state.email_verified_at) {
      await recordLoginEvent({ userId: user.id, email: input.email, success: false, clientIp, userAgent: request.headers.get("user-agent") ?? "", failureReason: "email_unverified" });
      return Response.json({ error: "请先完成邮箱验证", code: "EMAIL_UNVERIFIED" }, { status: 403 });
    }
    if (settings.site.maintenanceMode && user.role !== "admin") {
      return Response.json({ error: settings.site.maintenanceMessage }, { status: 503 });
    }
    if (settings.auth.totpEnabled && state.totp_enabled) {
      if (!input.totpCode) return Response.json({ error: "请输入身份验证器验证码", code: "TOTP_REQUIRED", totpChallenge: await createTotpChallenge(user) }, { status: 403 });
      if (!await verifyTotpForUser(user.id, input.totpCode)) {
        await recordLoginEvent({ userId: user.id, email: input.email, success: false, clientIp, userAgent: request.headers.get("user-agent") ?? "", failureReason: "invalid_totp" });
        return Response.json({ error: "验证码或恢复码不正确", code: "TOTP_INVALID" }, { status: 403 });
      }
    }

    user.termsAcceptedVersion = state.terms_accepted_version;
    await createSession(user);
    await recordLoginEvent({ userId: user.id, email: input.email, success: true, clientIp, userAgent: request.headers.get("user-agent") ?? "" });
    clearRateLimit(rateLimitKey);
    const requiresTermsAcceptance = settings.legal.termsEnabled && settings.legal.requireReaccept && state.terms_accepted_version !== settings.legal.termsVersion;
    return Response.json({ user, requiresTermsAcceptance });
  } catch {
    return Response.json({ error: "登录服务暂不可用，请检查数据库配置" }, { status: 503 });
  }
}
