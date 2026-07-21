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
import { safeAuthRedirect } from "@/lib/auth/redirect";

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  const isJsonRequest = contentType.includes("application/json");
  const requestUrl = new URL(request.url);
  try {
    const rateLimit = checkRateLimit(`register:${requestClientKey(request)}`, 5, 60 * 60 * 1000);
    if (!rateLimit.ok) {
      return Response.json(
        { error: "注册尝试过多，请稍后再试" },
        { status: 429, headers: { "retry-after": String(rateLimit.retryAfter) } },
      );
    }
    const schema = authInputSchema.extend({
      name: authInputSchema.shape.name.unwrap(),
      inviteCode: z.string().trim().max(120).optional(),
      referralCode: z.string().trim().max(32).optional(),
      acceptedTerms: z.boolean().optional(),
      turnstileToken: z.string().optional(),
    });
    const input = schema.parse(
      isJsonRequest
        ? await request.json()
        : normalizeRegisterFormBody(Object.fromEntries((await request.formData()).entries())),
    );
    const settings = await tryGetSystemSettings();
    if (settings.site.maintenanceMode) {
      return isJsonRequest
        ? Response.json({ error: settings.site.maintenanceMessage }, { status: 503 })
        : redirectToRegister(request, requestUrl, settings.site.maintenanceMessage, input.email, input.referralCode);
    }
    if (settings.auth.allowRegistration === false) {
      return isJsonRequest
        ? Response.json({ error: "当前暂未开放新用户注册" }, { status: 403 })
        : redirectToRegister(request, requestUrl, "当前暂未开放新用户注册", input.email, input.referralCode);
    }
    if (settings.legal.termsEnabled && input.acceptedTerms !== true) {
      return isJsonRequest
        ? Response.json({ error: "请先阅读并同意用户协议和隐私政策" }, { status: 400 })
        : redirectToRegister(request, requestUrl, "请先阅读并同意用户协议和隐私政策", input.email, input.referralCode);
    }
    if (settings.auth.requireInviteCode === true) {
      const expectedCode = process.env.REGISTRATION_INVITE_CODE;
      if (!expectedCode) {
        return isJsonRequest
          ? Response.json({ error: "邀请码注册尚未完成配置" }, { status: 503 })
          : redirectToRegister(request, requestUrl, "邀请码注册尚未完成配置", input.email, input.referralCode);
      }
      if (input.inviteCode !== expectedCode) {
        return isJsonRequest
          ? Response.json({ error: "邀请码无效" }, { status: 403 })
          : redirectToRegister(request, requestUrl, "邀请码无效", input.email, input.referralCode);
      }
    }
    const emailDomain = input.email.split("@")[1]?.toLowerCase() ?? "";
    if (settings.auth.allowedEmailDomains.length > 0 && !settings.auth.allowedEmailDomains.includes(emailDomain)) {
      return isJsonRequest
        ? Response.json({ error: "该邮箱域名不在允许注册范围内" }, { status: 403 })
        : redirectToRegister(request, requestUrl, "该邮箱域名不在允许注册范围内", input.email, input.referralCode);
    }
    if (!await verifyTurnstile({ settings, token: input.turnstileToken, clientIp: requestClientKey(request) })) {
      return isJsonRequest
        ? Response.json({ error: "人机验证失败，请重试" }, { status: 400 })
        : redirectToRegister(request, requestUrl, "人机验证失败，请重试", input.email, input.referralCode);
    }
    if (settings.affiliate.enabled && input.referralCode) {
      const referral = await validateAffiliateReferralCode(input.referralCode);
      if (!referral.ok) {
        return isJsonRequest
          ? Response.json({ error: referral.error }, { status: 400 })
          : redirectToRegister(request, requestUrl, referral.error, input.email, input.referralCode);
      }
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
      return isJsonRequest
        ? Response.json({ user, requiresEmailVerification: true, emailSent })
        : redirectToLoginAfterRegister(request, requestUrl, emailSent ? "验证邮件已发送，请完成邮箱验证后登录。" : "账号已创建，但验证邮件发送失败，请联系管理员或稍后重发。", user.email);
    }
    await query("update users set email_verified_at=coalesce(email_verified_at,now()) where id=$1", [user.id]);
    user.termsAcceptedVersion = settings.legal.termsVersion;
    await createSession(user);
    return isJsonRequest
      ? Response.json({ user, requiresEmailVerification: false })
      : Response.redirect(new URL(safeAuthRedirect(requestUrl.searchParams.get("next")), publicOrigin(request, requestUrl)), 303);
  } catch (error) {
    if (error instanceof ZodError) {
      return isJsonRequest
        ? Response.json({ error: "输入信息不完整或格式不正确" }, { status: 400 })
        : redirectToRegister(request, requestUrl, "输入信息不完整或格式不正确");
    }
    if (String(error).includes("duplicate key")) {
      return isJsonRequest
        ? Response.json({ error: "该邮箱已经注册" }, { status: 409 })
        : redirectToRegister(request, requestUrl, "该邮箱已经注册");
    }
    return isJsonRequest
      ? Response.json({ error: "注册服务暂不可用，请检查数据库配置" }, { status: 503 })
      : redirectToRegister(request, requestUrl, "注册服务暂不可用，请稍后再试");
  }
}

function normalizeRegisterFormBody(rawBody: Record<string, FormDataEntryValue>) {
  return {
    ...rawBody,
    acceptedTerms: rawBody.acceptedTerms === "on",
  };
}

function redirectToRegister(request: Request, requestUrl: URL, error: string, email?: string, referralCode?: string) {
  const destination = new URL("/register", publicOrigin(request, requestUrl));
  const next = requestUrl.searchParams.get("next");
  if (next) destination.searchParams.set("next", next);
  if (referralCode) destination.searchParams.set("ref", referralCode);
  if (email) destination.searchParams.set("email", email);
  destination.searchParams.set("error", error);
  return Response.redirect(destination, 303);
}

function redirectToLoginAfterRegister(request: Request, requestUrl: URL, message: string, email: string) {
  const destination = new URL("/login", publicOrigin(request, requestUrl));
  const next = requestUrl.searchParams.get("next");
  if (next) destination.searchParams.set("next", next);
  destination.searchParams.set("email", email);
  destination.searchParams.set("error", message);
  return Response.redirect(destination, 303);
}

function publicOrigin(request: Request, requestUrl: URL) {
  const forwardedHost = firstHeaderValue(request.headers.get("x-forwarded-host"));
  const host = forwardedHost || firstHeaderValue(request.headers.get("host"));
  const forwardedProto = firstHeaderValue(request.headers.get("x-forwarded-proto"));
  const proto = forwardedProto || requestUrl.protocol.replace(":", "") || "https";
  return host ? `${proto}://${host}` : requestUrl.origin;
}

function firstHeaderValue(value: string | null) {
  return value?.split(",")[0]?.trim() || "";
}
