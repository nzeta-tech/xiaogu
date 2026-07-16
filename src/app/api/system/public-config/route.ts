import { tryGetSystemSettings } from "@/lib/db/repositories";

export async function GET() {
  const settings = await tryGetSystemSettings();
  return Response.json({
    site: {
      siteName: String(settings.site.siteName ?? "小谷"),
      siteSubtitle: String(settings.site.siteSubtitle ?? "保险内容增长助手"),
      supportContact: String(settings.site.supportContact ?? ""),
      footerNote: String(settings.site.footerNote ?? ""),
    },
    auth: {
      allowRegistration: settings.auth.allowRegistration !== false,
      requireInviteCode: settings.auth.requireInviteCode === true,
      passwordHint: String(settings.auth.passwordHint ?? "至少 8 位密码"),
    },
    payment: {
      enableStripe: settings.payment.enableStripe !== false,
      displayCreditPackages: settings.payment.displaySubscriptions !== false,
      purchaseNotice: String(settings.payment.purchaseNotice ?? ""),
    },
  });
}
