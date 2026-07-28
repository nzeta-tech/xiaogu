export type SystemSettings = {
  site: {
    siteName: string;
    siteSubtitle: string;
    supportContact: string;
    footerNote: string;
    maintenanceMode: boolean;
    maintenanceMessage: string;
    logoUrl: string;
    helpUrl: string;
    homeContent: string;
    customNavItems: Array<{
      id: string;
      label: string;
      url: string;
      visibility: "user" | "admin";
      sortOrder: number;
    }>;
  };
  ui: {
    tableDefaultPageSize: number;
    tablePageSizeOptions: number[];
  };
  legal: {
    termsEnabled: boolean;
    termsVersion: string;
    termsUpdatedAt: string;
    requireReaccept: boolean;
    displayMode: "checkbox" | "modal";
    documents: Array<{
      slug: string;
      title: string;
      content: string;
    }>;
  };
  auth: {
    allowRegistration: boolean;
    requireInviteCode: boolean;
    passwordHint: string;
    emailVerificationEnabled: boolean;
    passwordResetEnabled: boolean;
    sessionDays: number;
    loginAttemptLimit: number;
    loginWindowMinutes: number;
    allowedEmailDomains: string[];
    turnstileEnabled: boolean;
    turnstileSiteKey: string;
    turnstileSecretEncrypted: string;
    totpEnabled: boolean;
    totpIssuer: string;
  };
  defaults: {
    signupCredits: number;
    dailyCreationLimit: number;
    monthlyCreationLimit: number;
    maxConcurrentCreations: number;
    creationRpmLimit: number;
  };
  features: {
    complianceEnabled: boolean;
    imageGenerationEnabled: boolean;
    hotTopicsEnabled: boolean;
    feedbackEnabled: boolean;
    localAgentEnabled: boolean;
  };
  payment: {
    enableStripe: boolean;
    enableAirwallex: boolean;
    enableAlipay: boolean;
    enableWechat: boolean;
    enableManualTransfer: boolean;
    displaySubscriptions: boolean;
    purchaseNotice: string;
    orderTimeoutMinutes: number;
    maxPendingOrders: number;
    minPurchaseCredits: number;
    maxPurchaseCredits: number;
    minOrderAmountCents: number;
    maxOrderAmountCents: number;
    dailyPaidAmountLimitCents: number;
    feeRatePercent: number;
    productName: string;
    helpImageUrl: string;
    lowBalanceNotifyEnabled: boolean;
    lowBalanceThreshold: number;
    lowBalanceCooldownHours: number;
    loadBalanceStrategy: "round_robin" | "least_amount";
    cancelRateLimitEnabled: boolean;
    cancelRateLimitWindowMinutes: number;
    cancelRateLimitMax: number;
  };
  affiliate: {
    enabled: boolean;
    rebateRatePercent: number;
    freezeHours: number;
    durationDays: number;
    perInviteeCap: number;
  };
  email: {
    enabled: boolean;
    host: string;
    port: number;
    secure: boolean;
    username: string;
    passwordEncrypted: string;
    fromEmail: string;
    fromName: string;
    verificationSubject: string;
    verificationBody: string;
    passwordResetSubject: string;
    passwordResetBody: string;
    lowBalanceSubject: string;
    lowBalanceBody: string;
    creditChangeSubject: string;
    creditChangeBody: string;
  };
  backup: {
    retentionCount: number;
    scheduleEnabled: boolean;
    intervalHours: number;
    cronExpression: string;
    retentionDays: number;
    s3Enabled: boolean;
    s3Endpoint: string;
    s3Region: string;
    s3Bucket: string;
    s3Prefix: string;
    s3AccessKeyId: string;
    s3SecretEncrypted: string;
    s3ForcePathStyle: boolean;
  };
  runtime: {
    modelFallbackEnabled: boolean;
    fallbackBaseUrl: string;
    fallbackModel: string;
    fallbackApiKeyEncrypted: string;
    requestTimeoutSeconds: number;
    circuitBreakerEnabled: boolean;
    circuitFailureThreshold: number;
    circuitCooldownSeconds: number;
  };
};

export const defaultSystemSettings: SystemSettings = {
  site: {
    siteName: "小谷",
    siteSubtitle: "保险内容增长助手",
    supportContact: "support@nzeta.ai",
    footerNote: "让保险内容生产更稳定、更易运营。",
    maintenanceMode: false,
    maintenanceMessage: "系统正在维护，请稍后再试。",
    logoUrl: "/brand/xiaogu-icon.png",
    helpUrl: "/help",
    homeContent: "",
    customNavItems: [],
  },
  ui: { tableDefaultPageSize: 20, tablePageSizeOptions: [10, 20, 50, 100] },
  legal: {
    termsEnabled: true,
    termsVersion: "2026-07-16",
    termsUpdatedAt: "2026-07-16",
    requireReaccept: false,
    displayMode: "checkbox",
    documents: [
      {
        slug: "terms",
        title: "用户协议",
        content: `## 服务性质

小谷提供保险内容创作、结构分析和运营辅助工具。生成内容不构成保险、法律、医疗、投资或理财建议。

## 用户责任

用户应确保输入资料来源合法并已取得必要授权，对最终发布内容的事实准确性、产品条款和合规性负责。禁止生成虚假承诺、误导宣传或侵犯他人权益的内容。

## 积分与支付

积分包为一次性数字服务额度，不自动续费。支付成功后积分到账；对重复扣款、支付失败或服务未交付的情况，可通过反馈支持提交核查和退款申请。

## AI 输出

AI 结果可能存在遗漏或错误。用户在对外发布或用于客户沟通前应进行人工核验，尤其是保险责任、收益、承保和理赔相关表述。

## 账号管理

用户应保护登录凭证，不得共享账号或绕过额度限制。发现异常使用时，平台可暂时限制账号并通知用户核查。

## 变更与终止

重大服务或协议变更将通过站内公告说明。用户不同意变更时可停止使用，并通过反馈支持申请账号与数据处理。`,
      },
      {
        slug: "privacy",
        title: "隐私政策",
        content: `## 我们处理的信息

为提供账号、创作、计费和支持服务，我们会处理注册信息、创作输入、生成结果、用量、订单和反馈记录。

## 敏感信息

保单、客户资料和候选人简历可能包含敏感个人信息。请仅上传完成任务所必需的内容，并在上传前删除身份证号、银行卡号、详细住址和无关健康信息。不得在未获授权时上传他人资料。

## 使用目的

信息仅用于身份验证、生成用户请求的内容、保存作品、计算积分、处理订单、排查故障和响应反馈，不用于出售个人信息。

## 服务提供方

完成生成、支付和计量时，必要数据可能被发送给已配置的大模型、图片模型、Stripe 和 OpenMeter 服务。我们按完成服务所需的最小范围传输。

## 保存与删除

账号和作品在服务期间保存。用户可通过反馈支持申请导出、更正或删除账号及相关数据；法律或财务记录要求保留的订单信息除外。

## 安全

我们使用加密传输、HttpOnly 会话、访问控制和审计记录保护数据。任何网络服务均无法承诺绝对安全，请勿提交与任务无关的秘密信息。`,
      },
    ],
  },
  auth: {
    allowRegistration: true,
    requireInviteCode: false,
    passwordHint: "至少 8 位密码",
    emailVerificationEnabled: false,
    passwordResetEnabled: false,
    sessionDays: 7,
    loginAttemptLimit: 10,
    loginWindowMinutes: 15,
    allowedEmailDomains: [],
    turnstileEnabled: false,
    turnstileSiteKey: "",
    turnstileSecretEncrypted: "",
    totpEnabled: false,
    totpIssuer: "小谷",
  },
  defaults: { signupCredits: 0, dailyCreationLimit: 0, monthlyCreationLimit: 0, maxConcurrentCreations: 2, creationRpmLimit: 10 },
  features: { complianceEnabled: true, imageGenerationEnabled: true, hotTopicsEnabled: true, feedbackEnabled: true, localAgentEnabled: false },
  payment: {
    enableStripe: true,
    enableAirwallex: false,
    enableAlipay: false,
    enableWechat: false,
    enableManualTransfer: false,
    displaySubscriptions: true,
    purchaseNotice: "充值成功后额度会自动到账，可在账单页查看明细。",
    orderTimeoutMinutes: 30,
    maxPendingOrders: 3,
    minPurchaseCredits: 1,
    maxPurchaseCredits: 100000,
    minOrderAmountCents: 100,
    maxOrderAmountCents: 1000000,
    dailyPaidAmountLimitCents: 5000000,
    feeRatePercent: 0,
    productName: "小谷创作积分",
    helpImageUrl: "",
    lowBalanceNotifyEnabled: false,
    lowBalanceThreshold: 20,
    lowBalanceCooldownHours: 24,
    loadBalanceStrategy: "round_robin",
    cancelRateLimitEnabled: false,
    cancelRateLimitWindowMinutes: 60,
    cancelRateLimitMax: 5,
  },
  affiliate: { enabled: false, rebateRatePercent: 20, freezeHours: 0, durationDays: 0, perInviteeCap: 0 },
  email: {
    enabled: false, host: "", port: 587, secure: false, username: "", passwordEncrypted: "", fromEmail: "", fromName: "小谷",
    verificationSubject: "小谷：验证邮箱",
    verificationBody: "{{name}}，你好。请在 {{hours}} 小时内打开以下链接完成邮箱验证：\n{{url}}\n如果不是你本人操作，请忽略此邮件。",
    passwordResetSubject: "小谷：重置密码",
    passwordResetBody: "{{name}}，你好。请在 {{hours}} 小时内打开以下链接完成密码重置：\n{{url}}\n如果不是你本人操作，请忽略此邮件。",
    lowBalanceSubject: "小谷：创作积分余额提醒",
    lowBalanceBody: "{{name}}，你好。你当前剩余 {{balance}} 点创作积分，已达到提醒阈值 {{threshold}} 点。\n前往账单页充值：{{url}}",
    creditChangeSubject: "小谷：{{changeLabel}}，积分已变动",
    creditChangeBody: "{{name}}，你好。{{changeLabel}}已完成，本次变动 {{delta}} 点，当前可用创作积分为 {{balance}} 点。\n订单号：{{orderId}}\n查看账单：{{url}}",
  },
  backup: {
    retentionCount: 10, scheduleEnabled: false, intervalHours: 24, cronExpression: "0 2 * * *", retentionDays: 14,
    s3Enabled: false, s3Endpoint: "", s3Region: "auto", s3Bucket: "", s3Prefix: "backups/", s3AccessKeyId: "", s3SecretEncrypted: "", s3ForcePathStyle: false,
  },
  runtime: {
    modelFallbackEnabled: false, fallbackBaseUrl: "", fallbackModel: "", fallbackApiKeyEncrypted: "", requestTimeoutSeconds: 120,
    circuitBreakerEnabled: true, circuitFailureThreshold: 3, circuitCooldownSeconds: 300,
  },
};

export const systemSettingKeys = Object.keys(defaultSystemSettings) as Array<keyof SystemSettings>;
