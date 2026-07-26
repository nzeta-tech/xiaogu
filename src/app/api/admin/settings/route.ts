import { z } from "zod";
import { requireSessionUser } from "@/lib/auth/session";
import { tryCreateAdminAuditLog, tryGetSystemSettings, tryUpdateSystemSettings } from "@/lib/db/repositories";
import { encryptSettingSecret } from "@/lib/security/secrets";
import type { SystemSettings } from "@/lib/system/settings";
import { configureBackupScheduler } from "@/lib/system/backup-scheduler";
import { Cron } from "croner";

const schema = z.object({
  site: z.object({
    siteName: z.string().trim().min(1).max(40), siteSubtitle: z.string().trim().min(1).max(120), supportContact: z.string().trim().max(180), footerNote: z.string().trim().max(300), maintenanceMode: z.boolean(), maintenanceMessage: z.string().trim().min(1).max(300),
    logoUrl: z.string().trim().max(1000), helpUrl: z.string().trim().max(1000), homeContent: z.string().trim().max(10000),
    customNavItems: z.array(z.object({ id: z.string().trim().regex(/^[a-z0-9_-]+$/).max(40), label: z.string().trim().min(1).max(40), url: z.string().trim().min(1).max(1000), visibility: z.enum(["user", "admin"]), sortOrder: z.number().int().min(-1000).max(1000) })).max(20),
  }).optional(),
  ui: z.object({
    tableDefaultPageSize: z.number().int().min(5).max(200),
    tablePageSizeOptions: z.array(z.number().int().min(5).max(200)).min(1).max(8)
      .refine((options) => new Set(options).size === options.length, "分页选项不能重复"),
  }).refine((value) => value.tablePageSizeOptions.includes(value.tableDefaultPageSize), "默认分页数量必须包含在分页选项中").optional(),
  legal: z.object({
    termsEnabled: z.boolean(), termsVersion: z.string().trim().min(1).max(40), termsUpdatedAt: z.string().trim().min(1).max(40), requireReaccept: z.boolean(),
    displayMode: z.enum(["checkbox", "modal"]),
    documents: z.array(z.object({ slug: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{0,62}$/), title: z.string().trim().min(1).max(80), content: z.string().trim().min(1).max(50000) })).min(2).max(20)
      .refine((documents) => new Set(documents.map((document) => document.slug)).size === documents.length, "协议文档标识不能重复")
      .refine((documents) => ["terms", "privacy"].every((slug) => documents.some((document) => document.slug === slug)), "必须保留用户协议和隐私政策"),
  }).optional(),
  auth: z.object({
    allowRegistration: z.boolean(), requireInviteCode: z.boolean(), passwordHint: z.string().trim().min(1).max(120),
    emailVerificationEnabled: z.boolean(), passwordResetEnabled: z.boolean(), sessionDays: z.number().int().min(1).max(30),
    loginAttemptLimit: z.number().int().min(3).max(100), loginWindowMinutes: z.number().int().min(1).max(1440),
    allowedEmailDomains: z.array(z.string().trim().toLowerCase().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/)).max(100),
    turnstileEnabled: z.boolean(), turnstileSiteKey: z.string().trim().max(200), turnstileSecret: z.string().max(500).optional(),
    totpEnabled: z.boolean(), totpIssuer: z.string().trim().min(1).max(80),
  }).optional(),
  defaults: z.object({ signupCredits: z.number().int().min(0).max(100000), dailyCreationLimit: z.number().int().min(0).max(10000), monthlyCreationLimit: z.number().int().min(0).max(100000), maxConcurrentCreations: z.number().int().min(1).max(20), creationRpmLimit: z.number().int().min(1).max(1000) }).optional(),
  features: z.object({ complianceEnabled: z.boolean(), imageGenerationEnabled: z.boolean(), hotTopicsEnabled: z.boolean(), feedbackEnabled: z.boolean(), localAgentEnabled: z.boolean() }).optional(),
  payment: z.object({
    enableStripe: z.boolean(), enableAirwallex: z.boolean(), enableAlipay: z.boolean(), enableWechat: z.boolean(), enableManualTransfer: z.boolean(), displaySubscriptions: z.boolean(), purchaseNotice: z.string().trim().max(500),
    orderTimeoutMinutes: z.number().int().min(5).max(1440), maxPendingOrders: z.number().int().min(1).max(100),
    minPurchaseCredits: z.number().int().min(1).max(1000000), maxPurchaseCredits: z.number().int().min(1).max(1000000),
    minOrderAmountCents: z.number().int().min(0).max(100000000), maxOrderAmountCents: z.number().int().min(0).max(100000000), dailyPaidAmountLimitCents: z.number().int().min(0).max(1000000000),
    feeRatePercent: z.number().min(0).max(100), productName: z.string().trim().min(1).max(120), helpImageUrl: z.string().trim().max(1000),
    lowBalanceNotifyEnabled: z.boolean(), lowBalanceThreshold: z.number().int().min(0).max(1000000), lowBalanceCooldownHours: z.number().int().min(1).max(720),
    loadBalanceStrategy: z.enum(["round_robin", "least_amount"]), cancelRateLimitEnabled: z.boolean(), cancelRateLimitWindowMinutes: z.number().int().min(1).max(10080), cancelRateLimitMax: z.number().int().min(1).max(1000),
  }).optional(),
  affiliate: z.object({ enabled: z.boolean(), rebateRatePercent: z.number().min(0).max(100), freezeHours: z.number().int().min(0).max(720), durationDays: z.number().int().min(0).max(3650), perInviteeCap: z.number().int().min(0).max(1000000) }).optional(),
  email: z.object({
    enabled: z.boolean(), host: z.string().trim().max(240), port: z.number().int().min(1).max(65535), secure: z.boolean(), username: z.string().trim().max(240), password: z.string().max(1000).optional(), fromEmail: z.union([z.literal(""), z.string().trim().email()]), fromName: z.string().trim().max(120),
    verificationSubject: z.string().trim().min(1).max(200), verificationBody: z.string().trim().min(1).max(5000),
    passwordResetSubject: z.string().trim().min(1).max(200), passwordResetBody: z.string().trim().min(1).max(5000),
    lowBalanceSubject: z.string().trim().min(1).max(200), lowBalanceBody: z.string().trim().min(1).max(5000),
  }).optional(),
  backup: z.object({
    retentionCount: z.number().int().min(1).max(100), scheduleEnabled: z.boolean(), intervalHours: z.number().int().min(1).max(720), cronExpression: z.string().trim().min(5).max(120).refine(isValidCron, "Cron 表达式无效"), retentionDays: z.number().int().min(0).max(3650),
    s3Enabled: z.boolean(), s3Endpoint: z.string().trim().max(1000), s3Region: z.string().trim().min(1).max(80), s3Bucket: z.string().trim().max(200), s3Prefix: z.string().trim().max(500), s3AccessKeyId: z.string().trim().max(500), s3Secret: z.string().max(1000).optional(), s3ForcePathStyle: z.boolean(),
  }).optional(),
  runtime: z.object({ modelFallbackEnabled: z.boolean(), fallbackBaseUrl: z.string().trim().max(1000), fallbackModel: z.string().trim().max(200), fallbackApiKey: z.string().max(1000).optional(), requestTimeoutSeconds: z.number().int().min(5).max(900), circuitBreakerEnabled: z.boolean(), circuitFailureThreshold: z.number().int().min(1).max(100), circuitCooldownSeconds: z.number().int().min(10).max(86400) }).optional(),
});

async function requireAdmin() {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  if (user.role !== "admin") return Response.json({ error: "无权访问系统配置" }, { status: 403 });
  return user;
}

function publicSettings(settings: SystemSettings) {
  return {
    ...settings,
    auth: { ...settings.auth, turnstileSecretEncrypted: "", turnstileSecretConfigured: Boolean(settings.auth.turnstileSecretEncrypted) },
    email: { ...settings.email, passwordEncrypted: "", passwordConfigured: Boolean(settings.email.passwordEncrypted) },
    backup: { ...settings.backup, s3SecretEncrypted: "", s3SecretConfigured: Boolean(settings.backup.s3SecretEncrypted) },
    runtime: { ...settings.runtime, fallbackApiKeyEncrypted: "", fallbackApiKeyConfigured: Boolean(settings.runtime.fallbackApiKeyEncrypted) },
  };
}

export async function GET() {
  const user = await requireAdmin();
  if (user instanceof Response) return user;
  return Response.json({ settings: publicSettings(await tryGetSystemSettings()), mode: "server" });
}

export async function PATCH(request: Request) {
  const user = await requireAdmin();
  if (user instanceof Response) return user;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return Response.json({ error: `${issue?.path.join(".") || "settings"}: ${issue?.message ?? "配置格式不正确"}` }, { status: 400 });
  }
  const current = await tryGetSystemSettings();
  const input: Partial<Record<keyof SystemSettings, Record<string, unknown>>> = parsed.data;
  if (parsed.data.auth) {
    input.auth = { ...parsed.data.auth, turnstileSecretEncrypted: parsed.data.auth.turnstileSecret ? encryptSettingSecret(parsed.data.auth.turnstileSecret) : current.auth.turnstileSecretEncrypted };
    delete input.auth.turnstileSecret;
    if (parsed.data.auth.turnstileEnabled && (!parsed.data.auth.turnstileSiteKey || !input.auth.turnstileSecretEncrypted)) return Response.json({ error: "启用 Turnstile 前必须配置 Site Key 和 Secret" }, { status: 400 });
  }
  if (parsed.data.email) {
    input.email = { ...parsed.data.email, passwordEncrypted: parsed.data.email.password ? encryptSettingSecret(parsed.data.email.password) : current.email.passwordEncrypted };
    delete input.email.password;
    if (parsed.data.email.enabled && (!parsed.data.email.host || !parsed.data.email.fromEmail)) return Response.json({ error: "启用邮件前必须配置 SMTP 主机和发件邮箱" }, { status: 400 });
  }
  if (parsed.data.backup) {
    input.backup = { ...parsed.data.backup, s3SecretEncrypted: parsed.data.backup.s3Secret ? encryptSettingSecret(parsed.data.backup.s3Secret) : current.backup.s3SecretEncrypted };
    delete input.backup.s3Secret;
    if (parsed.data.backup.s3Enabled && (!parsed.data.backup.s3Bucket || !parsed.data.backup.s3AccessKeyId || !input.backup.s3SecretEncrypted)) return Response.json({ error: "启用 S3/R2 前必须配置存储桶、Access Key 和 Secret" }, { status: 400 });
  }
  if (parsed.data.runtime) {
    input.runtime = { ...parsed.data.runtime, fallbackApiKeyEncrypted: parsed.data.runtime.fallbackApiKey ? encryptSettingSecret(parsed.data.runtime.fallbackApiKey) : current.runtime.fallbackApiKeyEncrypted };
    delete input.runtime.fallbackApiKey;
    if (parsed.data.runtime.modelFallbackEnabled && (!parsed.data.runtime.fallbackBaseUrl || !parsed.data.runtime.fallbackModel || !input.runtime.fallbackApiKeyEncrypted)) return Response.json({ error: "启用模型回退前必须配置地址、模型和 API Key" }, { status: 400 });
  }
  const effectiveEmail = { ...current.email, ...(input.email ?? {}) };
  const effectiveAuth = { ...current.auth, ...(input.auth ?? {}) };
  if ((effectiveAuth.emailVerificationEnabled || effectiveAuth.passwordResetEnabled) && !effectiveEmail.enabled) return Response.json({ error: "启用邮箱验证或密码找回前必须先启用邮件服务" }, { status: 400 });
  if (parsed.data.payment && parsed.data.payment.minPurchaseCredits > parsed.data.payment.maxPurchaseCredits) return Response.json({ error: "最低购买积分不能大于最高购买积分" }, { status: 400 });
  if (parsed.data.payment && parsed.data.payment.maxOrderAmountCents > 0 && parsed.data.payment.minOrderAmountCents > parsed.data.payment.maxOrderAmountCents) return Response.json({ error: "最低支付金额不能大于最高支付金额" }, { status: 400 });
  const settings = await tryUpdateSystemSettings(input);
  if (!settings) return Response.json({ error: "系统配置保存失败" }, { status: 503 });
  await tryCreateAdminAuditLog({ adminUserId: user.id, action: "settings.update", targetType: "system_settings", detail: redactSecrets(parsed.data) });
  configureBackupScheduler(settings);
  return Response.json({ settings: publicSettings(settings), mode: "server" });
}

function redactSecrets<T>(value: T): T {
  const clone = structuredClone(value) as Record<string, unknown>;
  if (clone.auth && typeof clone.auth === "object") delete (clone.auth as Record<string, unknown>).turnstileSecret;
  if (clone.email && typeof clone.email === "object") delete (clone.email as Record<string, unknown>).password;
  if (clone.backup && typeof clone.backup === "object") delete (clone.backup as Record<string, unknown>).s3Secret;
  if (clone.runtime && typeof clone.runtime === "object") delete (clone.runtime as Record<string, unknown>).fallbackApiKey;
  return clone as T;
}

function isValidCron(expression: string) {
  try {
    const job = new Cron(expression, { paused: true }, () => undefined);
    job.stop();
    return true;
  } catch {
    return false;
  }
}
