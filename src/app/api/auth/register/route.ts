import { z, ZodError } from "zod";
import { createSession } from "@/lib/auth/session";
import { authInputSchema, registerUser } from "@/lib/auth/users";
import { tryGetSystemSettings } from "@/lib/db/repositories";
import { checkRateLimit, requestClientKey } from "@/lib/security/rate-limit";
import { bindAffiliateInviter, ensureAffiliateAccount, validateAffiliateReferralCode } from "@/lib/affiliate/service";
import { createAndSendAuthToken } from "@/lib/auth/actions";
import { tryGrantGiftCredits } from "@/lib/db/repositories";
import { query } from "@/lib/db/client";
import { verifyTurnstile } from "@/lib/security/turnstile";

export async function POST(request: Request) {
  try {
    const rateLimit = checkRateLimit(`register:${requestClientKey(request)}`, 5, 60 * 60 * 1000);
    if (!rateLimit.ok) {
      return Response.json(
        { error: "注册尝试过多，请稍后再试" },
        { status: 429, headers: { "retry-after": String(rateLimit.retryAfter) } },
      );
    }
    const input = authInputSchema.extend({
      name: authInputSchema.shape.name.unwrap(),
      inviteCode: z.string().trim().max(120).optional(),
      referralCode: z.string().trim().max(32).optional(),
      acceptedTerms: z.boolean().optional(),
      turnstileToken: z.string().optional(),
    }).parse(await request.json());
    const settings = await tryGetSystemSettings();
    if (settings.site.maintenanceMode) return Response.json({ error: settings.site.maintenanceMessage }, { status: 503 });
    if (settings.auth.allowRegistration === false) {
      return Response.json({ error: "当前暂未开放新用户注册" }, { status: 403 });
    }
    if (settings.legal.termsEnabled && input.acceptedTerms !== true) {
      return Response.json({ error: "请先阅读并同意用户协议和隐私政策" }, { status: 400 });
    }
    if (settings.auth.requireInviteCode === true) {
      const expectedCode = process.env.REGISTRATION_INVITE_CODE;
      if (!expectedCode) return Response.json({ error: "邀请码注册尚未完成配置" }, { status: 503 });
      if (input.inviteCode !== expectedCode) return Response.json({ error: "邀请码无效" }, { status: 403 });
    }
    const emailDomain = input.email.split("@")[1]?.toLowerCase() ?? "";
    if (settings.auth.allowedEmailDomains.length > 0 && !settings.auth.allowedEmailDomains.includes(emailDomain)) {
      return Response.json({ error: "该邮箱域名不在允许注册范围内" }, { status: 403 });
    }
    if (!await verifyTurnstile({ settings, token: input.turnstileToken, clientIp: requestClientKey(request) })) {
      return Response.json({ error: "人机验证失败，请重试" }, { status: 400 });
    }
    if (settings.affiliate.enabled && input.referralCode) {
      const referral = await validateAffiliateReferralCode(input.referralCode);
      if (!referral.ok) return Response.json({ error: referral.error }, { status: 400 });
    }
    const user = await registerUser(input);
    await query("update users set terms_accepted_version=$2,terms_accepted_at=now() where id=$1", [user.id, settings.legal.termsVersion]);
    await ensureAffiliateAccount(user.id);
    if (settings.affiliate.enabled && input.referralCode) {
      const binding = await bindAffiliateInviter(user.id, input.referralCode);
      if (!binding.ok) return Response.json({ error: binding.error }, { status: 400 });
    }
    if (settings.defaults.signupCredits > 0) {
      await tryGrantGiftCredits({ userId: user.id, quotaAmount: settings.defaults.signupCredits, sourceType: "signup", sourceLabel: "新用户注册赠送" });
    }
    if (settings.auth.emailVerificationEnabled) {
      let emailSent = true;
      try {
        await createAndSendAuthToken({ userId: user.id, email: user.email, name: user.name, type: "verify_email" });
      } catch {
        emailSent = false;
      }
      return Response.json({ user, requiresEmailVerification: true, emailSent });
    }
    await query("update users set email_verified_at=coalesce(email_verified_at,now()) where id=$1", [user.id]);
    user.termsAcceptedVersion = settings.legal.termsVersion;
    await createSession(user);
    return Response.json({ user, requiresEmailVerification: false });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: "输入信息不完整或格式不正确" }, { status: 400 });
    }
    if (String(error).includes("duplicate key")) {
      return Response.json({ error: "该邮箱已经注册" }, { status: 409 });
    }
    return Response.json({ error: "注册服务暂不可用，请检查数据库配置" }, { status: 503 });
  }
}
