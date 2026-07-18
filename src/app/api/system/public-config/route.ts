import { tryGetSystemSettings } from "@/lib/db/repositories";

export async function GET() {
  const settings = await tryGetSystemSettings();
  return Response.json({
    site: {
      siteName: String(settings.site.siteName ?? "小谷"),
      siteSubtitle: String(settings.site.siteSubtitle ?? "保险内容增长助手"),
      supportContact: String(settings.site.supportContact ?? ""),
      footerNote: String(settings.site.footerNote ?? ""),
      logoUrl: settings.site.logoUrl,
      helpUrl: settings.site.helpUrl,
      homeContent: settings.site.homeContent,
      customNavItems: settings.site.customNavItems,
    },
    auth: {
      allowRegistration: settings.auth.allowRegistration !== false,
      requireInviteCode: settings.auth.requireInviteCode === true,
      passwordHint: String(settings.auth.passwordHint ?? "至少 8 位密码"),
      passwordResetEnabled: settings.auth.passwordResetEnabled,
      turnstileEnabled: settings.auth.turnstileEnabled,
      turnstileSiteKey: settings.auth.turnstileEnabled ? settings.auth.turnstileSiteKey : "",
    },
    payment: {
      enableStripe: settings.payment.enableStripe !== false,
      displayCreditPackages: settings.payment.displaySubscriptions !== false,
      purchaseNotice: String(settings.payment.purchaseNotice ?? ""),
      feeRatePercent: settings.payment.feeRatePercent,
      productName: settings.payment.productName,
      helpImageUrl: settings.payment.helpImageUrl,
    },
    affiliate: {
      enabled: settings.affiliate.enabled === true,
    },
    legal: {
      termsEnabled: settings.legal.termsEnabled,
      termsVersion: settings.legal.termsVersion,
      termsUpdatedAt: settings.legal.termsUpdatedAt,
      displayMode: settings.legal.displayMode,
      documents: settings.legal.documents,
    },
    features: settings.features,
    maintenance: { enabled: settings.site.maintenanceMode, message: settings.site.maintenanceMessage },
  });
}
