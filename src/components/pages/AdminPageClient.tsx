"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { adminMenuItems, getAdminSection, type AdminSectionId } from "@/lib/admin/navigation";
import { apiPath } from "@/lib/client/url";
import { defaultSystemSettings, type SystemSettings } from "@/lib/system/settings";
import {
  AdminConfirmDialog,
  AdminDrawer,
  AdminEmptyState,
  AdminField,
  AdminLoadingRows,
  AdminPagination,
  AdminStatus,
  AdminToast,
  AdminToolbar,
  downloadAdminCsv,
  type AdminConfirmConfig,
  type AdminToastMessage,
} from "@/components/admin/AdminPrimitives";

type Summary = {
  users: number;
  activeUsers: number;
  conversations: number;
  drafts: number;
  orders: number;
  paidUsers: number;
  paidAmountCents: number;
  todayRevenueCents: number;
  yesterdayRevenueCents: number;
  newUsersToday: number;
  newUsersYesterday: number;
  openFeedback: number;
  failedRuns: number;
  quotaConsumed: number;
  publishedAnnouncements: number;
  activePromoCodes: number;
  recentUsers: AdminUser[];
  recentOrders: AdminOrder[];
  recentUsage: AdminUsage[];
};

type ContentOverview = {
  totals: {
    worksTotal: number;
    worksUsed: number;
    worksFavorite: number;
    appRunsTotal: number;
    appRunsFailed: number;
    complianceReportsTotal: number;
    questionnairesTotal: number;
    questionnairesCompleted: number;
    questionnaireAvgCompletion: number;
  };
  complianceRisk: Array<{ riskLevel: string; count: number }>;
  recentWorks: AdminWork[];
  recentComplianceReports: AdminComplianceReport[];
  appUsage: AdminAppUsage[];
};

type AdminWork = {
  id: string;
  title: string;
  status: string;
  compliance_risk: string;
  source_channel: string;
  updated_at: string;
  user_email: string | null;
  app_name: string | null;
  content_preview: string;
};

type AdminComplianceReport = {
  id: string;
  risk_level: string;
  checked_text: string;
  created_at: string;
  user_email: string | null;
  issue_count: number;
};

type AdminAppUsage = {
  app_code: string | null;
  app_name: string | null;
  run_count: number;
  success_count: number;
  failed_count: number;
  quota_total: number;
};

type AdminViralContent = {
  id: string; title: string; platform: string; content_type: string; category: string; tags: string[];
  source_url: string; source_title: string; source_author: string; thumbnail_url: string | null;
  media_url: string | null; embed_url: string | null; article_body: string; summary: string;
  metric_label: string; metric_value: number | null; metric_unit: string; insight: string;
  creation_scenes: string[]; risk_note: string; status: string; is_pinned: boolean; is_featured: boolean;
  sort_order: number; publish_at: string | null; expire_at: string | null; updated_at: string;
};

type AdminViralCreator = {
  id: string; platform: string; display_name: string; profile_url: string | null; bio: string;
  status: "active" | "paused" | "excluded" | string; relevance_score: number; source_kind: string;
  quality_score: number; discovery_evidence_count: number; follower_count: number | null;
  platform_work_count: number | null; is_verified: boolean;
  discovery_query: string | null; refresh_status: string; last_discovered_at: string; last_refreshed_at: string | null;
  discovered_work_count: number; work_count: number; latest_work_at: string | null;
};

type AdminAppRun = {
  id: string; status: string; error_message: string | null; quota_cost: number; model: string | null; created_at: string; completed_at: string | null; app_name: string | null; app_slug: string | null; user_email: string | null; work_id: string | null;
};

type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
  usage_total?: number;
  order_total?: number;
  gift_total?: number;
  current_balance?: number;
};

type AdminOrder = {
  id: string;
  provider: string;
  status: string;
  amount_cents: number;
  currency: string;
  quota_amount: number;
  created_at: string;
  user_email: string;
};

type AdminUsage = {
  id: string;
  action_type: string;
  quota_cost: number;
  model: string | null;
  created_at: string;
  user_email: string | null;
};

type PromoCode = {
  id: string;
  code: string;
  reward_type: string;
  credit_amount: number;
  discount_percent: number;
  status: string;
  max_redemptions: number;
  redeemed_count: number;
  expires_at?: string | null;
  notes?: string;
};

type AdminOrderDetail = AdminOrder & {
  provider_order_id: string | null;
  checkout_url: string | null;
  metadata: Record<string, unknown>;
  paid_at: string | null;
  user_id: string;
  user_name: string;
};

type AdminCreationApp = {
  id: string;
  code: string;
  slug: string;
  name: string;
  emoji: string;
  description: string;
  badge: string | null;
  points_cost: number;
  result_type: string;
  requires_thinking: boolean;
  featured: boolean;
  status: string;
  sort_order: number;
  category_name: string | null;
  run_count: number;
  updated_at: string;
};

type FeedbackTicket = {
  id: string;
  title: string;
  content: string;
  category: string;
  status: string;
  priority: string;
  admin_reply: string;
  created_at: string;
  updated_at: string;
  user_email: string | null;
  user_name: string | null;
  assigned_admin_email: string | null;
};

type AuditLog = {
  id: string;
  action: string;
  target_type: string;
  target_id: string;
  detail: Record<string, unknown>;
  created_at: string;
  admin_email: string | null;
  admin_name: string | null;
};

type Announcement = {
  id: string;
  title: string;
  content: string;
  kind: string;
  placement: string;
  status: string;
  is_pinned: boolean;
  published_at?: string | null;
  link_url?: string | null;
};

type Plan = {
  code: string;
  name: string;
  quotaAmount: number;
  amountCents: number;
  currency: string;
  description: string;
  recommended?: boolean;
  status?: string;
  sortOrder?: number;
};

type AdminUserDetail = {
  user: AdminUser;
  balance: number;
  orders: AdminOrderDetail[];
  usage: AdminUsage[];
  gifts: Array<{ id: string; source_type: string; source_label: string; quota_amount: number; status: string; created_at: string }>;
  works: Array<{ id: string; title: string; status: string; updated_at: string; platform: string }>;
  totals: {
    orderAmountCents: number;
    quotaPurchased: number;
    quotaGifted: number;
    quotaConsumed: number;
    worksTotal: number;
  };
};

type Settings = SystemSettings & {
  auth: SystemSettings["auth"] & { turnstileSecretConfigured?: boolean };
  email: SystemSettings["email"] & { passwordConfigured?: boolean };
  backup: SystemSettings["backup"] & { s3SecretConfigured?: boolean };
  runtime: SystemSettings["runtime"] & { fallbackApiKeyConfigured?: boolean };
};

type AffiliateRecord = {
  invitee_id: string;
  invitee_email: string;
  inviter_id: string;
  inviter_email: string;
  referral_code: string;
  created_at: string;
  accrued_credits: number;
  custom_rebate_rate_percent: number | null;
};

type AffiliateLedgerRecord = { id: string; action: string; credits: number; created_at: string; source_order_id: string | null; user_email: string; source_email: string | null };
type AffiliateStats = { visits: number; invitees: number; payers: number; accruedCredits: number };
type SettingsTab = "general" | "legal" | "features" | "security" | "defaults" | "services" | "runtime" | "payment" | "email" | "backup";
type ServiceHealth = { checks: Array<{ key: string; label: string; ok: boolean; required: boolean; latencyMs: number; error: string }>; lastStripeWebhook: { lastWebhookAt?: string; lastEventType?: string } | null; checkedAt: string };
type ModelRuntimeStatus = { events: Array<{ id: string; provider: string; model: string; outcome: string; latency_ms: number; error_message: string; created_at: string }>; circuit: { failures: number; openUntil: number } };
type BackupRecord = { id: string; filename: string; status: string; size_bytes: number; table_count: number; row_count: number; checksum: string; error_message: string | null; remote_key: string | null; remote_status: string; expires_at: string | null; trigger_type: string; created_at: string; completed_at: string | null; restored_at: string | null };
type PaymentProvider = { id: string; name: string; providerKey: "stripe" | "airwallex" | "easypay" | "alipay" | "wxpay"; enabled: boolean; sortOrder: number; supportedMethods: string[]; config: Record<string, string>; minAmountCents: number; maxAmountCents: number; dailyLimitCents: number; refundEnabled: boolean; lastHealthStatus: string; lastError: string };
type PaymentProviderForm = { id: string; name: string; providerKey: PaymentProvider["providerKey"]; enabled: boolean; sortOrder: number; supportedMethods: string; secretKey: string; publishableKey: string; webhookSecret: string; currency: string; configJson?: string };

const defaultSettings = structuredClone(defaultSystemSettings) as Settings;
const settingsTabs: Array<[SettingsTab, string]> = [['general','通用设置'],['legal','登录条款'],['features','功能开关'],['security','安全认证'],['defaults','用户默认值'],['services','服务状态'],['runtime','模型运行'],['payment','支付设置'],['email','邮件设置'],['backup','数据备份']];

export function AdminPageClient() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [orders, setOrders] = useState<AdminOrderDetail[]>([]);
  const [creationApps, setCreationApps] = useState<AdminCreationApp[]>([]);
  const [feedbackTickets, setFeedbackTickets] = useState<FeedbackTicket[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [contentOverview, setContentOverview] = useState<ContentOverview | null>(null);
  const [appRuns, setAppRuns] = useState<AdminAppRun[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [planForm, setPlanForm] = useState<Plan>({ code: "", name: "", quotaAmount: 100, amountCents: 9900, currency: "CNY", description: "", recommended: false, status: "active", sortOrder: 0 });
  const [selectedUserDetail, setSelectedUserDetail] = useState<AdminUserDetail | null>(null);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [affiliateRecords, setAffiliateRecords] = useState<AffiliateRecord[]>([]);
  const [affiliateLedger, setAffiliateLedger] = useState<AffiliateLedgerRecord[]>([]);
  const [affiliateStats, setAffiliateStats] = useState<AffiliateStats>({ visits: 0, invitees: 0, payers: 0, accruedCredits: 0 });
  const [tab, setTab] = useState<AdminSectionId>("overview");
  const [error, setError] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [orderStatusFilter, setOrderStatusFilter] = useState("all");
  const [orderSearch, setOrderSearch] = useState("");
  const [appStatusFilter, setAppStatusFilter] = useState("all");
  const [feedbackStatusFilter, setFeedbackStatusFilter] = useState("all");
  const [feedbackSearch, setFeedbackSearch] = useState("");
  const [auditSearch, setAuditSearch] = useState("");
  const [grantAmount, setGrantAmount] = useState(100);
  const [loading, setLoading] = useState(true);
  const [feedbackReplies, setFeedbackReplies] = useState<Record<string, string>>({});
  const [loadedSections, setLoadedSections] = useState<Partial<Record<AdminSectionId, boolean>>>({});
  const [actionKey, setActionKey] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [toast, setToast] = useState<AdminToastMessage | null>(null);
  const [confirmConfig, setConfirmConfig] = useState<AdminConfirmConfig | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [viralContents, setViralContents] = useState<AdminViralContent[]>([]);
  const [viralCreators, setViralCreators] = useState<AdminViralCreator[]>([]);
  const [creatorSearch, setCreatorSearch] = useState("");
  const [creatorPlatformFilter, setCreatorPlatformFilter] = useState("all");
  const [creatorStatusFilter, setCreatorStatusFilter] = useState("all");
  const [creatorSort, setCreatorSort] = useState<"relevance" | "recent" | "works">("relevance");
  const [selectedCreatorIds, setSelectedCreatorIds] = useState<string[]>([]);
  const [contentView, setContentView] = useState<"works" | "apps" | "runs" | "compliance" | "viral" | "creators">("works");
  const [commerceView, setCommerceView] = useState<"orders" | "plans" | "promos">("orders");
  const [supportView, setSupportView] = useState<"tickets" | "audit">("tickets");
  const [pageSize, setPageSize] = useState(20);
  const [pages, setPages] = useState<Partial<Record<AdminSectionId, number>>>({});
  const [settingsBaseline, setSettingsBaseline] = useState<Settings>(defaultSettings);
  const [announcementDrawerOpen, setAnnouncementDrawerOpen] = useState(false);
  const [viralDrawerOpen, setViralDrawerOpen] = useState(false);
  const [planDrawerOpen, setPlanDrawerOpen] = useState(false);
  const [promoDrawerOpen, setPromoDrawerOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<FeedbackTicket | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<AdminOrderDetail | null>(null);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [hasSavedView, setHasSavedView] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("general");
  const [serviceHealth, setServiceHealth] = useState<ServiceHealth | null>(null);
  const [modelRuntime, setModelRuntime] = useState<ModelRuntimeStatus | null>(null);
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [paymentProviders, setPaymentProviders] = useState<PaymentProvider[]>([]);
  const [providerForm, setProviderForm] = useState<PaymentProviderForm>({ id: "", name: "", providerKey: "stripe", enabled: false, sortOrder: 0, supportedMethods: "card", secretKey: "", publishableKey: "", webhookSecret: "", currency: "CNY", configJson: "{}" });
  const [turnstileSecret, setTurnstileSecret] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [testEmailRecipient, setTestEmailRecipient] = useState("");
  const [s3Secret, setS3Secret] = useState("");
  const [fallbackApiKey, setFallbackApiKey] = useState("");

  useEffect(() => {
    function syncTab() {
      const nextTab = getAdminSection(window.location.hash);
      const params = new URL(window.location.href).searchParams;
      const view = params.get("view");
      setTab(nextTab);
      if (nextTab === "users") setUserSearch(params.get("q") ?? "");
      if (nextTab === "content" && ["works", "apps", "runs", "compliance", "viral", "creators"].includes(view ?? "")) setContentView(view as typeof contentView);
      if (nextTab === "commerce") {
        setOrderSearch(params.get("q") ?? "");
        setOrderStatusFilter(params.get("status") ?? "all");
        if (["orders", "plans", "promos"].includes(view ?? "")) setCommerceView(view as typeof commerceView);
      }
      if (nextTab === "support") {
        setFeedbackStatusFilter(params.get("status") ?? "all");
        if (["tickets", "audit"].includes(view ?? "")) setSupportView(view as typeof supportView);
        if (view === "audit") setAuditSearch(params.get("q") ?? "");
        else setFeedbackSearch(params.get("q") ?? "");
      }
    }

    syncTab();
    window.addEventListener("hashchange", syncTab);
    return () => window.removeEventListener("hashchange", syncTab);
  }, []);

  const [announcementForm, setAnnouncementForm] = useState({
    id: "",
    title: "",
    content: "",
    kind: "notice",
    placement: "global",
    status: "draft",
    isPinned: false,
    linkUrl: "",
  });
  const [viralForm, setViralForm] = useState({
    id: "", title: "", platform: "抖音", contentType: "短视频", category: "健康医疗", tags: "",
    sourceUrl: "", sourceTitle: "", sourceAuthor: "", thumbnailUrl: "", mediaUrl: "", articleBody: "",
    summary: "", metricLabel: "热度待核验", metricValue: "", metricUnit: "", insight: "", creationScenes: "",
    riskNote: "", status: "draft", isPinned: false, isFeatured: false, sortOrder: "0", publishAt: "", expireAt: "",
  });
  const [promoForm, setPromoForm] = useState({
    code: "",
    rewardType: "credit",
    creditAmount: 100,
    discountPercent: 0,
    status: "active",
    maxRedemptions: 100,
    notes: "",
    startsAt: "",
    expiresAt: "",
  });

  const showToast = useCallback((message: string, tone: AdminToastMessage["tone"] = "success") => {
    setToast({ id: Date.now(), message, tone });
  }, []);

  const loadSection = useCallback(async (section: AdminSectionId, signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    async function read<T>(path: string): Promise<T> {
      const response = await fetch(apiPath(path), { signal });
      const raw = await response.text();
      let payload: (T & { error?: string }) | null = null;
      try {
        payload = raw ? JSON.parse(raw) as T & { error?: string } : null;
      } catch {
        throw new Error(`${path} 返回了无效响应（HTTP ${response.status}）`);
      }
      if (!payload) throw new Error(`${path} 返回了空响应（HTTP ${response.status}）`);
      if (!response.ok) throw new Error(payload.error ?? "后台数据加载失败");
      return payload;
    }

    try {
      if (section === "overview") {
        const payload = await read<{ summary?: Summary }>("/api/admin/summary");
        setSummary(payload.summary ?? null);
      } else if (section === "users") {
        const payload = await read<{ users?: AdminUser[] }>("/api/admin/users?limit=200");
        setUsers(payload.users ?? []);
      } else if (section === "content") {
        const [contentPayload, appsPayload, runsPayload, viralPayload, creatorsPayload] = await Promise.all([
          read<{ content?: ContentOverview }>("/api/admin/content"),
          read<{ apps?: AdminCreationApp[] }>("/api/admin/apps"),
          read<{ runs?: AdminAppRun[] }>("/api/admin/runs?limit=200"),
          read<{ contents?: AdminViralContent[] }>("/api/admin/viral-contents"),
          read<{ creators?: AdminViralCreator[] }>("/api/admin/viral-creators"),
        ]);
        setContentOverview(contentPayload.content ?? null);
        setCreationApps(appsPayload.apps ?? []);
        setAppRuns(runsPayload.runs ?? []);
        setViralContents(viralPayload.contents ?? []);
        setViralCreators(creatorsPayload.creators ?? []);
      } else if (section === "commerce") {
        const [summaryPayload, ordersPayload, plansPayload, promosPayload] = await Promise.all([
          read<{ summary?: Summary }>("/api/admin/summary"),
          read<{ orders?: AdminOrderDetail[] }>("/api/admin/orders?limit=500"),
          read<{ plans?: Plan[] }>("/api/admin/billing-plans"),
          read<{ promoCodes?: PromoCode[] }>("/api/admin/promo-codes"),
        ]);
        setSummary(summaryPayload.summary ?? null);
        setOrders(ordersPayload.orders ?? []);
        setPlans(plansPayload.plans ?? []);
        setPromoCodes(promosPayload.promoCodes ?? []);
      } else if (section === "growth") {
        const payload = await read<{ announcements?: Announcement[] }>("/api/admin/announcements");
        setAnnouncements(payload.announcements ?? []);
      } else if (section === "support") {
        const [feedbackPayload, auditPayload] = await Promise.all([
          read<{ tickets?: FeedbackTicket[] }>("/api/admin/feedback?limit=300"),
          read<{ logs?: AuditLog[] }>("/api/admin/audit-logs?limit=300"),
        ]);
        setFeedbackTickets(feedbackPayload.tickets ?? []);
        setAuditLogs(auditPayload.logs ?? []);
      } else if (section === "settings") {
        const [settingsPayload, affiliatesPayload, backupsPayload, providersPayload] = await Promise.all([
          read<{ settings?: Settings }>("/api/admin/settings"),
          read<{ records?: AffiliateRecord[]; ledger?: AffiliateLedgerRecord[]; stats?: AffiliateStats }>("/api/admin/affiliates"),
          read<{ backups?: BackupRecord[] }>("/api/admin/backups"),
          read<{ providers?: PaymentProvider[] }>("/api/admin/payment-providers"),
        ]);
        const nextSettings = settingsPayload.settings ?? defaultSettings;
        setSettings(nextSettings);
        setSettingsBaseline(nextSettings);
        setPageSize(nextSettings.ui.tableDefaultPageSize);
        setAffiliateRecords(affiliatesPayload.records ?? []);
        setAffiliateLedger(affiliatesPayload.ledger ?? []);
        setAffiliateStats(affiliatesPayload.stats ?? { visits: 0, invitees: 0, payers: 0, accruedCredits: 0 });
        setBackups(backupsPayload.backups ?? []);
        setPaymentProviders(providersPayload.providers ?? []);
      }
      setLoadedSections((current) => ({ ...current, [section]: true }));
      setLastUpdatedAt(new Date());
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === "AbortError")) {
        const message = cause instanceof Error ? cause.message : "后台数据加载失败，请检查网络或服务状态";
        setError(message);
        showToast(message, "error");
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [showToast]);

  async function updateUser(userId: string, input: { status?: string; role?: string }) {
    const response = await fetch(apiPath("/api/admin/users"), {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId, ...input }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "用户更新失败");
      return;
    }
    await loadSection("users");
    showToast("用户状态已更新");
  }

  async function updateUsersBatch(status: "active" | "suspended") {
    const response = await fetch(apiPath("/api/admin/users"), {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userIds: selectedUserIds, status }),
    });
    const payload = await response.json() as { error?: string };
    if (!response.ok) {
      showToast(payload.error ?? "批量更新失败", "error");
      return;
    }
    setSelectedUserIds([]);
    await loadSection("users");
    showToast(`已批量${status === "active" ? "恢复" : "停用"}用户`);
  }

  async function loadUserDetail(userId: string) {
    const response = await fetch(apiPath(`/api/admin/users/detail?userId=${encodeURIComponent(userId)}`));
    const payload = (await response.json()) as { detail?: AdminUserDetail; error?: string };
    if (!response.ok) {
      setError(payload.error ?? "用户详情加载失败");
      return;
    }
    setSelectedUserDetail(payload.detail ?? null);
  }

  async function grantCredits(userId: string, quotaAmount: number) {
    const response = await fetch(apiPath("/api/admin/users/credits"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId, quotaAmount, note: "运营赠送" }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "赠送额度失败");
      return;
    }
    await loadSection("users");
    showToast(`已赠送 ${quotaAmount} 点`);
  }

  async function updateOrder(orderId: string, status: string) {
    const response = await fetch(apiPath("/api/admin/orders"), {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderId, status }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "订单更新失败");
      return;
    }
    await loadSection("commerce");
    showToast("订单状态已更新");
  }

  async function updateCreationApp(appId: string, input: { status?: string; featured?: boolean; pointsCost?: number; badge?: string; sortOrder?: number }) {
    const response = await fetch(apiPath("/api/admin/apps"), {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ appId, ...input }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "创作应用更新失败");
      return;
    }
    await loadSection("content");
    showToast("创作应用已更新");
  }

  async function saveViralContent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const toIso = (value: string) => value ? new Date(value).toISOString() : null;
    const response = await fetch(apiPath("/api/admin/viral-contents"), {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: viralForm.id || undefined, title: viralForm.title, platform: viralForm.platform, contentType: viralForm.contentType,
        category: viralForm.category, tags: viralForm.tags.split(/[、,\s]+/).map((item) => item.trim()).filter(Boolean), sourceUrl: viralForm.sourceUrl,
        sourceTitle: viralForm.sourceTitle, sourceAuthor: viralForm.sourceAuthor, thumbnailUrl: viralForm.thumbnailUrl,
        mediaUrl: viralForm.mediaUrl, articleBody: viralForm.articleBody, summary: viralForm.summary, metricLabel: viralForm.metricLabel,
        metricValue: viralForm.metricValue ? Number(viralForm.metricValue) : null, metricUnit: viralForm.metricUnit, insight: viralForm.insight,
        creationScenes: viralForm.creationScenes.split(/[、,\s]+/).map((item) => item.trim()).filter(Boolean), riskNote: viralForm.riskNote,
        status: viralForm.status, isPinned: viralForm.isPinned, isFeatured: viralForm.isFeatured, sortOrder: Number(viralForm.sortOrder) || 0,
        publishAt: toIso(viralForm.publishAt), expireAt: toIso(viralForm.expireAt),
      }),
    });
    const payload = await response.json() as { error?: string };
    if (!response.ok) return showToast(payload.error ?? "爆款资源保存失败", "error");
    setViralDrawerOpen(false);
    await loadSection("content");
    showToast("爆款资源已保存");
  }

  async function updateViralContentStatus(id: string, status: string) {
    const response = await fetch(apiPath("/api/admin/viral-contents"), { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, status }) });
    const payload = await response.json() as { error?: string };
    if (!response.ok) return showToast(payload.error ?? "爆款资源状态更新失败", "error");
    await loadSection("content");
    showToast("爆款资源状态已更新");
  }

  async function updateViralCreatorStatus(ids: string[], status: "active" | "paused" | "excluded") {
    const response = await fetch(apiPath("/api/admin/viral-creators"), { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids, status }) });
    const payload = await response.json() as { error?: string };
    if (!response.ok) return showToast(payload.error ?? "作者状态更新失败", "error");
    setSelectedCreatorIds([]);
    await loadSection("content");
    const countLabel = ids.length > 1 ? `${ids.length} 位作者` : "作者";
    showToast(status === "active" ? `已将${countLabel}加入重点跟踪` : status === "paused" ? `已暂停${countLabel}跟踪` : `已将${countLabel}从候选池排除`);
  }

  async function terminateRun(runId: string) {
    const response = await fetch(apiPath("/api/admin/runs"), { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ runId, action: "terminate" }) });
    const payload = await response.json() as { error?: string };
    if (!response.ok) { setError(payload.error ?? "任务终止失败"); return; }
    await loadSection("content");
    showToast("任务已终止");
  }

  async function updateAnnouncementStatus(id: string, status: string) {
    const response = await fetch(apiPath("/api/admin/announcements"), {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "公告状态更新失败");
      return;
    }
    await loadSection("growth");
    showToast("公告状态已更新");
  }

  async function deleteAnnouncement(id: string) {
    const response = await fetch(apiPath(`/api/admin/announcements?id=${encodeURIComponent(id)}`), { method: "DELETE" });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "公告删除失败");
      return;
    }
    await loadSection("growth");
    showToast("公告已删除");
  }

  async function updatePromoStatus(id: string, status: string) {
    const response = await fetch(apiPath("/api/admin/promo-codes"), {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "优惠码状态更新失败");
      return;
    }
    await loadSection("commerce");
    showToast("优惠码状态已更新");
  }

  async function deletePromo(id: string) {
    const response = await fetch(apiPath(`/api/admin/promo-codes?id=${encodeURIComponent(id)}`), { method: "DELETE" });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "优惠码删除失败");
      return;
    }
    await loadSection("commerce");
    showToast("优惠码已删除");
  }

  async function updateFeedback(id: string, input: { status?: string; priority?: string; adminReply?: string }) {
    const response = await fetch(apiPath("/api/admin/feedback"), {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, ...input }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "反馈更新失败");
      return;
    }
    await loadSection("support");
    showToast("反馈工单已更新");
  }

  async function savePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch(apiPath("/api/admin/billing-plans"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(planForm),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "套餐保存失败");
      return;
    }
    setPlanForm({ code: "", name: "", quotaAmount: 100, amountCents: 9900, currency: "CNY", description: "", recommended: false, status: "active", sortOrder: 0 });
    await loadSection("commerce");
    setPlanDrawerOpen(false);
    showToast("套餐已保存");
  }

  async function saveAnnouncement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch(apiPath("/api/admin/announcements"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...announcementForm, id: announcementForm.id || undefined, linkUrl: announcementForm.linkUrl || undefined }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "公告保存失败");
      return;
    }
    setAnnouncementForm({ id: "", title: "", content: "", kind: "notice", placement: "global", status: "draft", isPinned: false, linkUrl: "" });
    await loadSection("growth");
    setAnnouncementDrawerOpen(false);
    showToast("公告已保存");
  }

  async function savePromo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch(apiPath("/api/admin/promo-codes"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...promoForm,
        creditAmount: promoForm.rewardType === "credit" ? promoForm.creditAmount : 0,
        discountPercent: promoForm.rewardType === "discount" ? promoForm.discountPercent : 0,
        startsAt: promoForm.startsAt ? new Date(promoForm.startsAt).toISOString() : undefined,
        expiresAt: promoForm.expiresAt ? new Date(promoForm.expiresAt).toISOString() : undefined,
      }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "优惠码保存失败");
      return;
    }
    setPromoForm({
      code: "",
      rewardType: "credit",
      creditAmount: 100,
      discountPercent: 0,
      status: "active",
      maxRedemptions: 100,
      notes: "",
      startsAt: "",
      expiresAt: "",
    });
    await loadSection("commerce");
    setPromoDrawerOpen(false);
    showToast("优惠码已创建");
  }

  async function saveSettings() {
    const response = await fetch(apiPath("/api/admin/settings"), {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...settings,
        auth: { ...settings.auth, turnstileSecret: turnstileSecret || undefined },
        email: { ...settings.email, password: emailPassword || undefined },
        backup: { ...settings.backup, s3Secret: s3Secret || undefined },
        runtime: { ...settings.runtime, fallbackApiKey: fallbackApiKey || undefined },
      }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "配置保存失败");
      return;
    }
    const savedSettings = (payload as { settings?: Settings }).settings ?? settings;
    setSettings(savedSettings);
    setSettingsBaseline(savedSettings);
    setPageSize(savedSettings.ui.tableDefaultPageSize);
    setTurnstileSecret("");
    setEmailPassword("");
    setS3Secret("");
    setFallbackApiKey("");
    showToast("系统配置已保存");
  }

  async function savePaymentProvider(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    let extraConfig: Record<string, string> = {};
    try { extraConfig = JSON.parse(providerForm.configJson || "{}"); } catch { return showToast("服务商 JSON 配置格式不正确", "error"); }
    const response = await fetch(apiPath("/api/admin/payment-providers"), {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: providerForm.id || undefined, name: providerForm.name, providerKey: providerForm.providerKey,
        enabled: providerForm.enabled, sortOrder: providerForm.sortOrder,
        supportedMethods: providerForm.supportedMethods.split(",").map((item) => item.trim()).filter(Boolean),
        config: { ...extraConfig, ...(providerForm.providerKey === "stripe" ? { secretKey: providerForm.secretKey, publishableKey: providerForm.publishableKey, webhookSecret: providerForm.webhookSecret, currency: providerForm.currency } : {}) },
        minAmountCents: 0, maxAmountCents: 0, dailyLimitCents: 0, refundEnabled: false,
      }),
    });
    const payload = await response.json() as { provider?: PaymentProvider; error?: string };
    if (!response.ok) return showToast(payload.error ?? "支付服务商保存失败", "error");
    setPaymentProviders((current) => payload.provider ? [...current.filter((item) => item.id !== payload.provider?.id), payload.provider] : current);
    setProviderForm({ id: "", name: "", providerKey: "stripe", enabled: false, sortOrder: 0, supportedMethods: "card", secretKey: "", publishableKey: "", webhookSecret: "", currency: "CNY", configJson: "{}" });
    showToast("支付服务商已保存");
  }

  async function deletePaymentProvider(id: string) {
    const response = await fetch(apiPath(`/api/admin/payment-providers?id=${encodeURIComponent(id)}`), { method: "DELETE" });
    const payload = await response.json() as { error?: string };
    if (!response.ok) return showToast(payload.error ?? "支付服务商删除失败", "error");
    setPaymentProviders((current) => current.filter((item) => item.id !== id));
    showToast("支付服务商已删除");
  }

  async function refreshServiceHealth() {
    setActionKey("services");
    const response = await fetch(apiPath("/api/admin/services"));
    const payload = await response.json() as { health?: ServiceHealth; runtime?: ModelRuntimeStatus; error?: string };
    if (response.ok) { setServiceHealth(payload.health ?? null); setModelRuntime(payload.runtime ?? null); } else showToast(payload.error ?? "服务检测失败", "error");
    setActionKey("");
  }

  async function testEmail() {
    setActionKey("email-test");
    const response = await fetch(apiPath("/api/admin/email/test"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ recipient: testEmailRecipient || undefined }) });
    const payload = await response.json() as { error?: string };
    showToast(response.ok ? (testEmailRecipient ? "测试邮件已发送" : "SMTP 连接正常") : payload.error ?? "邮件测试失败", response.ok ? "success" : "error");
    setActionKey("");
  }

  async function backupAction(action: "create" | "delete" | "restore" | "test_s3", id?: string) {
    setActionKey(`backup-${action}`);
    const response = await fetch(apiPath("/api/admin/backups"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, id, ...(action === "restore" ? { confirmation: "恢复数据库" } : {}) }) });
    const payload = await response.json() as { error?: string };
    if (!response.ok) showToast(payload.error ?? "备份操作失败", "error");
    else { showToast(action === "create" ? "备份已创建" : action === "delete" ? "备份已删除" : action === "test_s3" ? "S3/R2 连接正常" : "数据库已恢复"); if (action !== "test_s3") await loadSection("settings"); }
    setActionKey("");
  }

  async function saveAffiliateRate(userId: string, rate: number | null) {
    const response = await fetch(apiPath("/api/admin/affiliates"), { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId, rate }) });
    const payload = await response.json() as { error?: string };
    if (!response.ok) return showToast(payload.error ?? "专属返利保存失败", "error");
    setAffiliateRecords((current) => current.map((record) => record.inviter_id === userId ? { ...record, custom_rebate_rate_percent: rate } : record));
    showToast(rate === null ? "已恢复全局返利比例" : "专属返利比例已保存");
  }

  function requestSaveSettings() {
    const riskyChanges: string[] = [];
    if (settingsBaseline.auth.allowRegistration && !settings.auth.allowRegistration) riskyChanges.push("关闭新用户注册");
    if (!settingsBaseline.site.maintenanceMode && settings.site.maintenanceMode) riskyChanges.push("开启维护模式");
    if (!settingsBaseline.legal.requireReaccept && settings.legal.requireReaccept) riskyChanges.push("要求全体用户重新确认协议");
    if (!settingsBaseline.auth.emailVerificationEnabled && settings.auth.emailVerificationEnabled) riskyChanges.push("启用邮箱强制验证");
    if (settingsBaseline.payment.enableStripe && !settings.payment.enableStripe) riskyChanges.push("关闭 Stripe 支付入口");
    if (settingsBaseline.affiliate.enabled && !settings.affiliate.enabled) riskyChanges.push("关闭邀请返利");
    if (riskyChanges.length === 0) {
      void saveSettings();
      return;
    }
    requestConfirm({
      title: "保存高影响配置？",
      description: `${riskyChanges.join("、")}。保存后会立即影响用户端功能。`,
      confirmLabel: "保存配置",
      danger: true,
      requireText: "保存",
      onConfirm: saveSettings,
    });
  }

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void loadSection(tab, controller.signal), 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [loadSection, tab]);

  const filteredUsers = users.filter((user) => {
    const keyword = userSearch.trim().toLowerCase();
    if (!keyword) return true;
    return `${user.name} ${user.email} ${user.role} ${user.status}`.toLowerCase().includes(keyword);
  });
  const filteredOrders = orders.filter((order) => {
    const matchesStatus = orderStatusFilter === "all" || order.status === orderStatusFilter;
    const keyword = orderSearch.trim().toLowerCase();
    return matchesStatus && (!keyword || `${order.user_email} ${order.user_name} ${order.provider} ${order.id}`.toLowerCase().includes(keyword));
  });
  const filteredCreationApps = creationApps.filter((app) => appStatusFilter === "all" || app.status === appStatusFilter);
  const filteredViralCreators = viralCreators.filter((creator) => {
    const matchesPlatform = creatorPlatformFilter === "all" || creator.platform === creatorPlatformFilter;
    const matchesStatus = creatorStatusFilter === "all" || creator.status === creatorStatusFilter;
    const keyword = creatorSearch.trim().toLowerCase();
    return matchesPlatform && matchesStatus && (!keyword || `${creator.display_name} ${creator.platform} ${creator.discovery_query ?? ""}`.toLowerCase().includes(keyword));
  }).sort((left, right) => creatorSort === "recent"
    ? new Date(right.last_discovered_at).getTime() - new Date(left.last_discovered_at).getTime()
    : creatorSort === "works"
      ? right.work_count - left.work_count || right.quality_score - left.quality_score
      : right.quality_score - left.quality_score || right.relevance_score - left.relevance_score || new Date(right.last_discovered_at).getTime() - new Date(left.last_discovered_at).getTime());
  const filteredFeedbackTickets = feedbackTickets.filter((ticket) => {
    const keyword = feedbackSearch.trim().toLowerCase();
    const matchesStatus = feedbackStatusFilter === "all" || ticket.status === feedbackStatusFilter;
    return matchesStatus && (!keyword || `${ticket.title} ${ticket.content} ${ticket.user_email ?? ""} ${ticket.category}`.toLowerCase().includes(keyword));
  });
  const filteredAuditLogs = auditLogs.filter((log) => {
    const keyword = auditSearch.trim().toLowerCase();
    return !keyword || `${log.action} ${log.target_type} ${log.target_id} ${log.admin_email ?? ""}`.toLowerCase().includes(keyword);
  });
  const currentPage = pages[tab] ?? 1;
  const pageSlice = useCallback(<T,>(items: T[]) => items.slice((currentPage - 1) * pageSize, currentPage * pageSize), [currentPage, pageSize]);
  const pagedUsers = useMemo(() => pageSlice(filteredUsers), [filteredUsers, pageSlice]);
  const pagedOrders = useMemo(() => pageSlice(filteredOrders), [filteredOrders, pageSlice]);
  const pagedApps = useMemo(() => pageSlice(filteredCreationApps), [filteredCreationApps, pageSlice]);
  const pagedViralCreators = useMemo(() => pageSlice(filteredViralCreators), [filteredViralCreators, pageSlice]);
  const pagedTickets = useMemo(() => pageSlice(filteredFeedbackTickets), [filteredFeedbackTickets, pageSlice]);
  const pagedAuditLogs = useMemo(() => pageSlice(filteredAuditLogs), [filteredAuditLogs, pageSlice]);
  const settingsDirty = useMemo(() => JSON.stringify(settings) !== JSON.stringify(settingsBaseline) || Boolean(turnstileSecret || emailPassword || s3Secret || fallbackApiKey), [emailPassword, fallbackApiKey, s3Secret, settings, settingsBaseline, turnstileSecret]);

  function updatePage(page: number) {
    setPages((current) => ({ ...current, [tab]: page }));
  }

  function exportCurrentView() {
    const stamp = new Date().toISOString().slice(0, 10);
    if (tab === "users") {
      downloadAdminCsv(`users-${stamp}.csv`, [["邮箱", "姓名", "角色", "状态", "余额", "累计消费"], ...filteredUsers.map((user) => [user.email, user.name, user.role, user.status, user.current_balance, user.order_total])]);
    } else if (tab === "commerce") {
      downloadAdminCsv(`orders-${stamp}.csv`, [["订单号", "用户", "渠道", "状态", "金额", "点数", "创建时间"], ...filteredOrders.map((order) => [order.id, order.user_email, order.provider, order.status, order.amount_cents / 100, order.quota_amount, order.created_at])]);
    } else if (tab === "support") {
      downloadAdminCsv(`support-${stamp}.csv`, [["标题", "用户", "分类", "优先级", "状态", "更新时间"], ...filteredFeedbackTickets.map((ticket) => [ticket.title, ticket.user_email, ticket.category, ticket.priority, ticket.status, ticket.updated_at])]);
    } else if (tab === "content" && contentView === "creators") {
      downloadAdminCsv(`creator-pool-${stamp}.csv`, [["作者", "平台", "状态", "候选质量", "粉丝量", "平台作品", "已入库作品", "认证", "作者简介", "最近发现"], ...filteredViralCreators.map((creator) => [creator.display_name, creator.platform, creator.status, creator.quality_score, creator.follower_count, creator.platform_work_count, creator.work_count, creator.is_verified ? "已认证" : "未认证", creator.bio, creator.last_discovered_at])]);
    } else if (tab === "content") {
      downloadAdminCsv(`apps-${stamp}.csv`, [["应用", "标识", "状态", "点数", "运行次数", "排序"], ...filteredCreationApps.map((app) => [app.name, app.slug, app.status, app.points_cost, app.run_count, app.sort_order])]);
    }
    showToast("CSV 已导出");
  }

  function requestConfirm(config: AdminConfirmConfig) {
    setConfirmText("");
    setConfirmConfig({
      ...config,
      onConfirm: async () => {
        setActionKey("confirm");
        try {
          await config.onConfirm();
          setConfirmConfig(null);
        } finally {
          setActionKey("");
        }
      },
    });
  }

  useEffect(() => {
    function warnUnsaved(event: BeforeUnloadEvent) {
      if (!settingsDirty || tab !== "settings") return;
      event.preventDefault();
    }
    window.addEventListener("beforeunload", warnUnsaved);
    return () => window.removeEventListener("beforeunload", warnUnsaved);
  }, [settingsDirty, tab]);

  useEffect(() => {
    const url = new URL(window.location.href);
    ["q", "status", "view"].forEach((key) => url.searchParams.delete(key));
    if (tab === "users" && userSearch) url.searchParams.set("q", userSearch);
    if (tab === "commerce") {
      if (orderSearch) url.searchParams.set("q", orderSearch);
      if (orderStatusFilter !== "all") url.searchParams.set("status", orderStatusFilter);
      url.searchParams.set("view", commerceView);
    }
    if (tab === "content") url.searchParams.set("view", contentView);
    if (tab === "support") {
      if (auditSearch || feedbackSearch) url.searchParams.set("q", auditSearch || feedbackSearch);
      if (feedbackStatusFilter !== "all") url.searchParams.set("status", feedbackStatusFilter);
      url.searchParams.set("view", supportView);
    }
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, [auditSearch, commerceView, contentView, feedbackSearch, feedbackStatusFilter, orderSearch, orderStatusFilter, supportView, tab, userSearch]);

  useEffect(() => {
    const timer = window.setTimeout(() => setHasSavedView(Boolean(window.localStorage.getItem(`admin-saved-view:${tab}`))), 0);
    return () => window.clearTimeout(timer);
  }, [tab]);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isEditing = target?.matches("input, textarea, select, [contenteditable='true']");
      if (event.key === "Escape" && isEditing) {
        target?.blur();
        return;
      }
      if (isEditing || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "/") {
        const search = document.querySelector<HTMLInputElement>(".adminToolbar input");
        if (search) {
          event.preventDefault();
          search.focus();
        }
      } else if (event.key.toLowerCase() === "r") {
        event.preventDefault();
        void loadSection(tab);
      } else if (event.key.toLowerCase() === "n") {
        if (tab === "growth") setAnnouncementDrawerOpen(true);
        if (tab === "commerce" && commerceView === "plans") setPlanDrawerOpen(true);
        if (tab === "commerce" && commerceView === "promos") setPromoDrawerOpen(true);
      }
    }
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [commerceView, loadSection, tab]);

  function saveCurrentView() {
    window.localStorage.setItem(`admin-saved-view:${tab}`, `${window.location.pathname}${window.location.search}${window.location.hash}`);
    setHasSavedView(true);
    showToast("当前筛选视图已保存");
  }

  function applySavedView() {
    const saved = window.localStorage.getItem(`admin-saved-view:${tab}`);
    if (saved) window.location.assign(saved);
  }

  return (
    <div className="adminConsole">
      <AdminToast toast={toast} onDismiss={() => setToast(null)} />
      <AdminConfirmDialog
        busy={actionKey === "confirm"}
        config={confirmConfig}
        confirmText={confirmText}
        onCancel={() => !actionKey && setConfirmConfig(null)}
        onConfirmTextChange={setConfirmText}
      />
      <section className="adminMainSurface">
        {tab === "settings" && loadedSections.settings ? <AffiliateStatsStrip stats={affiliateStats} /> : null}
        <div className="adminHeaderBar">
          <div>
            <h1>{adminMenuItems.find((item) => item.id === tab)?.label ?? "管理后台"}</h1>
            <p>围绕用户、内容、订单、活动和系统配置开展日常运营。</p>
          </div>
          <div className="adminHeaderActions">
            <span>{lastUpdatedAt ? `${lastUpdatedAt.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })} 更新` : "等待同步"}</span>
            {hasSavedView ? <button className="secondaryButton" onClick={applySavedView} type="button">应用视图</button> : null}
            {["users", "content", "commerce", "support"].includes(tab) ? <button className="secondaryButton" onClick={saveCurrentView} type="button">保存视图</button> : null}
            {["users", "content", "commerce", "support"].includes(tab) ? <button className="secondaryButton" onClick={exportCurrentView} type="button">导出 CSV</button> : null}
            <button className="secondaryButton" onClick={() => void loadSection(tab)} disabled={loading} type="button">{loading ? "刷新中…" : "刷新"}</button>
          </div>
        </div>

      {error ? <div className="panel alertPanel">{error}</div> : null}
      {loading && !loadedSections[tab] ? <AdminLoadingRows rows={7} /> : null}

      {tab === "overview" ? (
        <>
          <div className="metricGrid adminMetrics">
            <Metric label="总用户" value={summary?.users ?? 0} />
            <Metric label="活跃用户" value={summary?.activeUsers ?? 0} />
            <Metric label="付费用户" value={summary?.paidUsers ?? 0} />
            <TrendMetric label="今日收入" value={`¥${((summary?.todayRevenueCents ?? 0) / 100).toFixed(0)}`} current={summary?.todayRevenueCents ?? 0} previous={summary?.yesterdayRevenueCents ?? 0} />
            <TrendMetric label="今日新增用户" value={summary?.newUsersToday ?? 0} current={summary?.newUsersToday ?? 0} previous={summary?.newUsersYesterday ?? 0} />
            <Metric label="累计收入" value={`¥${((summary?.paidAmountCents ?? 0) / 100).toFixed(0)}`} />
            <Metric label="累计消耗" value={`${summary?.quotaConsumed ?? 0} 点`} />
          </div>

          <AdminPanel title="今日待办">
            <div className="adminTodoGrid">
              <a href="#support"><span>待处理工单</span><strong>{summary?.openFeedback ?? 0}</strong><small>进入反馈队列</small></a>
              <a href="#content" onClick={() => setContentView("runs")}><span>24 小时失败任务</span><strong>{summary?.failedRuns ?? 0}</strong><small>检查失败原因</small></a>
              <a href="#commerce"><span>待支付订单</span><strong>{(summary?.recentOrders ?? []).filter((order) => order.status === "pending").length}</strong><small>进入订单管理</small></a>
              <a href="#growth"><span>生效中优惠码</span><strong>{summary?.activePromoCodes ?? 0}</strong><small>检查活动配置</small></a>
            </div>
          </AdminPanel>

          <div className="adminGrid">
            <AdminPanel title="最近订单">
              {(summary?.recentOrders ?? []).map((order) => (
                <Row
                  key={order.id}
                  title={order.user_email}
                  meta={`${order.provider} · ${order.status} · ${order.quota_amount} 点 · ${formatMoney(order.amount_cents, order.currency)}`}
                />
              ))}
            </AdminPanel>
            <AdminPanel title="最近用户">
              {(summary?.recentUsers ?? []).map((user) => (
                <Row key={user.id} title={user.email} meta={`${user.name} · ${user.role} · ${user.status}`} />
              ))}
            </AdminPanel>
          </div>

          <div className="adminGrid">
            <AdminPanel title="最近用量">
              {(summary?.recentUsage ?? []).map((usage) => (
                <Row key={usage.id} title={usage.user_email ?? "未知用户"} meta={`${usage.action_type} · ${usage.quota_cost} 点 · ${usage.model ?? "-"}`} />
              ))}
            </AdminPanel>
            <AdminPanel title="运营概览">
              <Row title="公告数量" meta={`当前已发布 ${summary?.publishedAnnouncements ?? 0} 条公告`} />
              <Row title="优惠码数量" meta={`当前有 ${summary?.activePromoCodes ?? 0} 个生效中的优惠码`} />
              <Row title="作品沉淀" meta={`累计沉淀 ${summary?.drafts ?? 0} 份内容作品`} />
            </AdminPanel>
          </div>
        </>
      ) : null}

      {tab === "users" ? (
        <section className="panel sectionBlock">
          <div className="panelHeader">
            <h2>用户管理</h2>
            <p>查询账号、查看经营数据，并执行额度与权限操作。</p>
          </div>
          <AdminToolbar actions={selectedUserIds.length ? <><span>已选 {selectedUserIds.length} 人</span><button className="secondaryButton" onClick={() => requestConfirm({ title: "批量停用用户？", description: `${selectedUserIds.length} 个用户将无法继续登录，历史数据会保留。`, confirmLabel: "批量停用", danger: true, requireText: "停用", onConfirm: () => updateUsersBatch("suspended") })} type="button">批量停用</button><button className="secondaryButton" onClick={() => void updateUsersBatch("active")} type="button">批量恢复</button></> : undefined}>
            <input aria-label="搜索用户" value={userSearch} placeholder="搜索姓名、邮箱、角色或状态" onChange={(event) => { setUserSearch(event.target.value); updatePage(1); }} />
          </AdminToolbar>
          <div className="adminDataTable" style={{ "--admin-columns": "42px minmax(250px,1.5fr) 110px 110px 120px minmax(250px,auto)" } as CSSProperties}>
            <div className="adminDataHeader"><label className="adminSelectCell"><input aria-label="选择当前页所有用户" checked={pagedUsers.length > 0 && pagedUsers.every((user) => selectedUserIds.includes(user.id))} type="checkbox" onChange={(event) => setSelectedUserIds((current) => event.target.checked ? [...new Set([...current, ...pagedUsers.map((user) => user.id)])] : current.filter((id) => !pagedUsers.some((user) => user.id === id)))} /></label><span>用户</span><span>角色</span><span>状态</span><span>可用积分</span><span>操作</span></div>
            {pagedUsers.map((user) => (
              <div className="adminDataRow" key={user.id}>
                <label className="adminSelectCell"><input aria-label={`选择 ${user.email}`} checked={selectedUserIds.includes(user.id)} type="checkbox" onChange={(event) => setSelectedUserIds((current) => event.target.checked ? [...current, user.id] : current.filter((id) => id !== user.id))} /></label>
                <div className="adminDataCell"><strong>{user.email}</strong><span>{user.name} · 注册于 {formatDate(user.created_at)}</span></div>
                <div><AdminStatus value={user.role} /></div>
                <div><AdminStatus value={user.status} /></div>
                <div className="adminDataCell"><strong>{user.current_balance ?? 0} 点</strong><span>消费 ¥{((user.order_total ?? 0) / 100).toFixed(0)}</span></div>
                <div className="adminRowMenu">
                  <button className="secondaryButton" onClick={() => void loadUserDetail(user.id)} type="button">查看详情</button>
                  <button className="secondaryButton" onClick={() => requestConfirm({ title: user.status === "active" ? "停用这个用户？" : "恢复这个用户？", description: `${user.email} ${user.status === "active" ? "将无法继续登录和创作，历史数据会保留。" : "将重新获得登录和使用权限。"}`, confirmLabel: user.status === "active" ? "确认停用" : "确认恢复", danger: user.status === "active", onConfirm: () => updateUser(user.id, { status: user.status === "active" ? "suspended" : "active" }) })} type="button">{user.status === "active" ? "停用" : "恢复"}</button>
                </div>
              </div>
            ))}
            {!loading && filteredUsers.length === 0 ? <AdminEmptyState title="没有匹配的用户" description="尝试清除搜索词或调整查询条件。" /> : null}
          </div>
          <AdminPagination page={currentPage} pageSize={pageSize} pageSizeOptions={settings.ui.tablePageSizeOptions} total={filteredUsers.length} onPageChange={updatePage} onPageSizeChange={(size) => { setPageSize(size); updatePage(1); }} />
          <AdminDrawer
            open={Boolean(selectedUserDetail)}
            title={selectedUserDetail?.user.email ?? "用户详情"}
            description={selectedUserDetail ? `${selectedUserDetail.user.name} · ${selectedUserDetail.totals.worksTotal} 份作品` : undefined}
            onClose={() => setSelectedUserDetail(null)}
            footer={selectedUserDetail ? <>
              <button className="secondaryButton" onClick={() => requestConfirm({ title: selectedUserDetail.user.role === "admin" ? "取消管理员权限？" : "授予管理员权限？", description: `权限变更将立即作用于 ${selectedUserDetail.user.email}。`, confirmLabel: "确认变更", danger: selectedUserDetail.user.role === "admin", requireText: selectedUserDetail.user.role === "admin" ? "确认" : undefined, onConfirm: () => updateUser(selectedUserDetail.user.id, { role: selectedUserDetail.user.role === "admin" ? "broker" : "admin" }) })} type="button">{selectedUserDetail.user.role === "admin" ? "取消管理员" : "设为管理员"}</button>
              <button className="primaryButton" onClick={() => requestConfirm({ title: "确认赠送积分？", description: `将向 ${selectedUserDetail.user.email} 赠送 ${grantAmount} 点，操作会写入审计日志。`, confirmLabel: `赠送 ${grantAmount} 点`, onConfirm: () => grantCredits(selectedUserDetail.user.id, grantAmount) })} type="button">赠送积分</button>
            </> : undefined}
          >
            {selectedUserDetail ? <div className="pageStack">
              <AdminField label="本次赠送积分" hint="赠送记录会进入用户额度明细和管理员审计日志。"><input min="1" type="number" value={grantAmount} onChange={(event) => setGrantAmount(Math.max(Number(event.target.value), 1))} /></AdminField>
              <div className="metricGrid adminMetrics">
                <Metric label="可用积分" value={selectedUserDetail.balance} />
                <Metric label="付费金额" value={`¥${(selectedUserDetail.totals.orderAmountCents / 100).toFixed(0)}`} />
                <Metric label="购买积分" value={selectedUserDetail.totals.quotaPurchased} />
                <Metric label="累计消耗" value={selectedUserDetail.totals.quotaConsumed} />
              </div>
              <AdminPanel title="最近订单">{selectedUserDetail.orders.slice(0, 8).map((order) => <Row key={order.id} title={formatMoney(order.amount_cents, order.currency)} meta={`${order.quota_amount} 点 · ${order.status} · ${formatDate(order.created_at)}`} />)}</AdminPanel>
              <AdminPanel title="最近作品">{selectedUserDetail.works.slice(0, 8).map((work) => <Row key={work.id} title={work.title} meta={`${work.platform} · ${work.status} · ${formatDate(work.updated_at)}`} href={adminWorkHref(work.id)} />)}</AdminPanel>
            </div> : null}
          </AdminDrawer>
        </section>
      ) : null}

      {tab === "content" ? (
        <div className="pageStack">
          <div className="adminSegmented" role="tablist" aria-label="内容运营视图">
            <button className={contentView === "works" ? "active" : ""} onClick={() => setContentView("works")} role="tab" type="button">作品概览</button>
            <button className={contentView === "apps" ? "active" : ""} onClick={() => setContentView("apps")} role="tab" type="button">应用管理</button>
            <button className={contentView === "runs" ? "active" : ""} onClick={() => setContentView("runs")} role="tab" type="button">运行任务</button>
            <button className={contentView === "compliance" ? "active" : ""} onClick={() => setContentView("compliance")} role="tab" type="button">合规分析</button>
            <button className={contentView === "viral" ? "active" : ""} onClick={() => setContentView("viral")} role="tab" type="button">爆款资源</button>
            <button className={contentView === "creators" ? "active" : ""} onClick={() => setContentView("creators")} role="tab" type="button">作者候选池</button>
          </div>
          {contentView === "works" ? <div className="metricGrid adminMetrics">
            <Metric label="作品总数" value={contentOverview?.totals.worksTotal ?? 0} />
            <Metric label="已使用作品" value={contentOverview?.totals.worksUsed ?? 0} />
            <Metric label="收藏作品" value={contentOverview?.totals.worksFavorite ?? 0} />
            <Metric label="创作运行" value={contentOverview?.totals.appRunsTotal ?? 0} />
            <Metric label="失败运行" value={contentOverview?.totals.appRunsFailed ?? 0} />
            <Metric label="合规报告" value={contentOverview?.totals.complianceReportsTotal ?? 0} />
          </div> : null}

          {contentView === "works" ? <div className="adminGrid">
            <AdminPanel title="最近作品">
              {(contentOverview?.recentWorks ?? []).map((work) => (
                <Row
                  key={work.id}
                  title={work.title}
                  meta={`${work.user_email ?? "未知用户"} · ${work.app_name ?? work.source_channel ?? "未知应用"} · ${work.status} · 合规 ${work.compliance_risk} · ${formatDate(work.updated_at)}`}
                  href={adminWorkHref(work.id)}
                />
              ))}
              {(contentOverview?.recentWorks ?? []).length === 0 ? <div className="emptyState">暂无作品数据。</div> : null}
            </AdminPanel>

            <AdminPanel title="应用使用排行">
              {(contentOverview?.appUsage ?? []).map((item) => (
                <Row
                  key={item.app_code ?? item.app_name ?? "unknown"}
                  title={item.app_name ?? item.app_code ?? "未知应用"}
                  meta={`运行 ${item.run_count} 次 · 成功 ${item.success_count} · 失败 ${item.failed_count} · 消耗 ${item.quota_total} 点`}
                />
              ))}
              {(contentOverview?.appUsage ?? []).length === 0 ? <div className="emptyState">暂无应用运行数据。</div> : null}
            </AdminPanel>
          </div> : null}

          {contentView === "compliance" ? <>
          <div className="adminGrid">
            <AdminPanel title="合规风险分布">
              {(contentOverview?.complianceRisk ?? []).map((item) => (
                <Row key={item.riskLevel} title={riskLabel(item.riskLevel)} meta={`${item.count} 份报告`} />
              ))}
              {(contentOverview?.complianceRisk ?? []).length === 0 ? <div className="emptyState">暂无合规报告。</div> : null}
            </AdminPanel>

            <AdminPanel title="画像问卷沉淀">
              <Metric label="问卷总数" value={contentOverview?.totals.questionnairesTotal ?? 0} />
              <Metric label="已完成" value={contentOverview?.totals.questionnairesCompleted ?? 0} />
              <Metric label="平均完成度" value={`${contentOverview?.totals.questionnaireAvgCompletion ?? 0}%`} />
            </AdminPanel>
          </div>

          <AdminPanel title="最近合规报告">
            <div className="tableList">
              {(contentOverview?.recentComplianceReports ?? []).map((report) => (
                <div className="tableRow" key={report.id}>
                  <div>
                    <strong>{report.user_email ?? "未知用户"}</strong>
                    <span>
                      {riskLabel(report.risk_level)} · {report.issue_count} 个问题 · {formatDate(report.created_at)} · {report.checked_text || "无检测文本"}
                    </span>
                  </div>
                  <div className="rowActions">
                    <span className={`statusPill ${report.risk_level}`}>{report.risk_level}</span>
                  </div>
                </div>
              ))}
              {(contentOverview?.recentComplianceReports ?? []).length === 0 ? <div className="emptyState">暂无合规报告。</div> : null}
            </div>
          </AdminPanel>
          </> : null}

          {contentView === "apps" ? <AdminPanel title="创作应用管理">
            <AdminToolbar>
              <select value={appStatusFilter} onChange={(event) => setAppStatusFilter(event.target.value)}>
                <option value="all">全部应用</option>
                <option value="active">已上架</option>
                <option value="inactive">已下架</option>
              </select>
            </AdminToolbar>
            <div className="adminDataTable" style={{ "--admin-columns": "minmax(240px,1.5fr) 110px 100px 100px minmax(320px,auto)" } as CSSProperties}>
              <div className="adminDataHeader"><span>应用</span><span>状态</span><span>积分</span><span>运行</span><span>操作</span></div>
              {pagedApps.map((app) => (
                <div className="adminDataRow" key={app.id}>
                  <div className="adminDataCell"><strong>{app.emoji} {app.name}</strong><span>{app.slug}{app.featured ? " · 推荐" : ""}</span></div>
                  <div><AdminStatus value={app.status} /></div>
                  <strong>{app.points_cost} 点</strong>
                  <span>{app.run_count} 次</span>
                  <div className="adminRowMenu">
                    <button className="secondaryButton" onClick={() => void updateCreationApp(app.id, { sortOrder: Math.max(app.sort_order - 1, 0) })}>上移</button>
                    <button className="secondaryButton" onClick={() => void updateCreationApp(app.id, { sortOrder: app.sort_order + 1 })}>下移</button>
                    <button className="secondaryButton" onClick={() => void updateCreationApp(app.id, { pointsCost: Math.max(app.points_cost - 1, 0) })}>-1 点</button>
                    <button className="secondaryButton" onClick={() => void updateCreationApp(app.id, { pointsCost: app.points_cost + 1 })}>+1 点</button>
                    <button className="secondaryButton" onClick={() => void updateCreationApp(app.id, { featured: !app.featured })}>
                      {app.featured ? "取消推荐" : "设为推荐"}
                    </button>
                    <button className="secondaryButton" onClick={() => requestConfirm({ title: app.status === "active" ? "下架这个应用？" : "重新上架应用？", description: `${app.name}${app.status === "active" ? "下架后用户将无法从工作空间进入。" : "将重新对用户可见。"}`, confirmLabel: app.status === "active" ? "确认下架" : "确认上架", danger: app.status === "active", onConfirm: () => updateCreationApp(app.id, { status: app.status === "active" ? "inactive" : "active" }) })}>
                      {app.status === "active" ? "下架" : "上架"}
                    </button>
                  </div>
                </div>
              ))}
              {filteredCreationApps.length === 0 ? <AdminEmptyState title="暂无应用" description="当前筛选条件下没有应用。" /> : null}
            </div>
            <AdminPagination page={currentPage} pageSize={pageSize} pageSizeOptions={settings.ui.tablePageSizeOptions} total={filteredCreationApps.length} onPageChange={updatePage} onPageSizeChange={(size) => { setPageSize(size); updatePage(1); }} />
          </AdminPanel> : null}

          {contentView === "runs" ? <AdminPanel title="失败与运行任务">
            <div className="tableList">
              {appRuns.map((run) => <div className="tableRow" key={run.id}><div><strong>{run.app_name ?? run.app_slug ?? "未知应用"}</strong><span>{run.user_email ?? "未知用户"} · {run.quota_cost} 点 · {run.model ?? "未记录模型"} · {formatDate(run.created_at)}</span>{run.error_message ? <span>错误：{run.error_message}</span> : null}</div><div className="rowActions"><AdminStatus value={run.status} />{run.work_id ? <a className="secondaryButton linkButton" href={adminWorkHref(run.work_id)}>查看作品</a> : null}{run.status === "running" ? <button className="secondaryButton" onClick={() => requestConfirm({ title: "终止运行中的任务？", description: "任务将标记为失败；已发出的上游模型请求可能无法立即取消。", confirmLabel: "终止任务", danger: true, onConfirm: () => terminateRun(run.id) })}>终止任务</button> : null}</div></div>)}
              {appRuns.length === 0 ? <div className="emptyState">当前没有失败或运行中的任务。</div> : null}
            </div>
          </AdminPanel> : null}

          {contentView === "viral" ? <AdminPanel title="爆款资源运营">
            <AdminToolbar>
              <span>{viralContents.filter((item) => item.status === "published").length} 条已发布 · 人工内容会优先于自动热榜展示</span>
              <button className="primaryButton" onClick={() => { setViralForm({ id: "", title: "", platform: "抖音", contentType: "短视频", category: "健康医疗", tags: "", sourceUrl: "", sourceTitle: "", sourceAuthor: "", thumbnailUrl: "", mediaUrl: "", articleBody: "", summary: "", metricLabel: "热度待核验", metricValue: "", metricUnit: "", insight: "", creationScenes: "", riskNote: "", status: "draft", isPinned: false, isFeatured: false, sortOrder: "0", publishAt: "", expireAt: "" }); setViralDrawerOpen(true); }} type="button">新增爆款</button>
            </AdminToolbar>
            <div className="tableList">
              {viralContents.map((item) => <div className="tableRow" key={item.id}>
                <div><strong>{item.title}</strong><span>{item.platform} · {item.content_type} · {item.category} · {item.is_pinned ? "置顶 · " : ""}{item.is_featured ? "重点推荐 · " : ""}{item.metric_label}{item.metric_value ? ` ${item.metric_value}${item.metric_unit}` : ""}</span><span>{item.insight || "尚未填写推荐角度"}</span></div>
                <div className="rowActions"><AdminStatus value={item.status} /><button className="secondaryButton" onClick={() => { setViralForm({ id: item.id, title: item.title, platform: item.platform, contentType: item.content_type, category: item.category, tags: item.tags.join("、"), sourceUrl: item.source_url, sourceTitle: item.source_title, sourceAuthor: item.source_author, thumbnailUrl: item.thumbnail_url ?? "", mediaUrl: item.media_url ?? "", articleBody: item.article_body, summary: item.summary, metricLabel: item.metric_label, metricValue: item.metric_value?.toString() ?? "", metricUnit: item.metric_unit, insight: item.insight, creationScenes: item.creation_scenes.join("、"), riskNote: item.risk_note, status: item.status, isPinned: item.is_pinned, isFeatured: item.is_featured, sortOrder: item.sort_order.toString(), publishAt: item.publish_at ? item.publish_at.slice(0, 16) : "", expireAt: item.expire_at ? item.expire_at.slice(0, 16) : "" }); setViralDrawerOpen(true); }} type="button">编辑</button><button className="secondaryButton" onClick={() => void updateViralContentStatus(item.id, item.status === "published" ? "offline" : "published")} type="button">{item.status === "published" ? "下线" : "发布"}</button></div>
              </div>)}
              {viralContents.length === 0 ? <AdminEmptyState title="暂无人工爆款资源" description="自动热榜仍会正常展示；新增资源后可通过置顶和推荐角度影响用户创作。" /> : null}
            </div>
          </AdminPanel> : null}

          {contentView === "creators" ? <AdminPanel title="各平台作者候选池">
            <AdminToolbar>
              <div className="adminToolbarFilters">
                <input aria-label="搜索作者候选池" value={creatorSearch} onChange={(event) => { setCreatorSearch(event.target.value); updatePage(1); }} placeholder="搜索作者、平台或发现关键词" />
                <select aria-label="作者候选池平台" value={creatorPlatformFilter} onChange={(event) => { setCreatorPlatformFilter(event.target.value); updatePage(1); }}><option value="all">全部平台</option>{[...new Set(viralCreators.map((creator) => creator.platform))].sort().map((platform) => <option key={platform} value={platform}>{platform}</option>)}</select>
                <select aria-label="作者候选池状态" value={creatorStatusFilter} onChange={(event) => { setCreatorStatusFilter(event.target.value); updatePage(1); }}>
                  <option value="all">全部状态</option><option value="active">重点跟踪</option><option value="paused">暂停跟踪</option><option value="excluded">已排除</option>
                </select>
                <select aria-label="作者候选池排序" value={creatorSort} onChange={(event) => { setCreatorSort(event.target.value as typeof creatorSort); updatePage(1); }}>
                  <option value="relevance">按候选质量</option><option value="recent">按最近发现</option><option value="works">按作品量</option>
                </select>
              </div>
              <div className="adminToolbarActions"><span>{viralCreators.filter((item) => item.status === "active").length} 位重点跟踪 · {viralCreators.length} 位已入池</span></div>
            </AdminToolbar>
            <div className="creatorPoolMetrics" aria-label="作者候选池概况">
              <div><span>重点跟踪</span><strong>{viralCreators.filter((item) => item.status === "active").length}</strong></div>
              <div><span>待运营</span><strong>{viralCreators.filter((item) => item.status !== "active" && item.status !== "excluded").length}</strong></div>
              <div><span>已获取简介</span><strong>{viralCreators.filter((item) => Boolean(item.bio.trim())).length}</strong></div>
              <div><span>已沉淀作品</span><strong>{viralCreators.reduce((total, item) => total + item.work_count, 0)}</strong></div>
            </div>
            {selectedCreatorIds.length > 0 ? <div className="creatorBatchBar"><strong>已选 {selectedCreatorIds.length} 位作者</strong><div><button className="secondaryButton" onClick={() => void updateViralCreatorStatus(selectedCreatorIds, "active")} type="button">重点跟踪</button><button className="secondaryButton" onClick={() => void updateViralCreatorStatus(selectedCreatorIds, "paused")} type="button">暂停</button><button className="secondaryButton" onClick={() => requestConfirm({ title: `排除已选 ${selectedCreatorIds.length} 位作者？`, description: "历史作品和发现记录会保留，但这些作者不再出现在正常运营候选池。", confirmLabel: "确认排除", danger: true, onConfirm: () => updateViralCreatorStatus(selectedCreatorIds, "excluded") })} type="button">批量排除</button><button className="adminIconButton" aria-label="取消选择" title="取消选择" onClick={() => setSelectedCreatorIds([])} type="button">×</button></div></div> : null}
            <div className="adminDataTable" style={{ "--admin-columns": "42px minmax(260px,1.35fr) 110px 110px 110px 110px 150px minmax(260px,auto)" } as CSSProperties}>
              <div className="adminDataHeader"><label className="adminSelectCell"><input aria-label="选择当前页全部作者" checked={pagedViralCreators.length > 0 && pagedViralCreators.every((creator) => selectedCreatorIds.includes(creator.id))} type="checkbox" onChange={(event) => setSelectedCreatorIds((current) => event.target.checked ? [...new Set([...current, ...pagedViralCreators.map((creator) => creator.id)])] : current.filter((id) => !pagedViralCreators.some((creator) => creator.id === id)))} /></label><span>作者画像</span><span title="重点跟踪：纳入日常监测；暂停跟踪：保留记录但暂不处理；已排除：不再进入候选队列。">运营状态</span><span>粉丝量</span><span>平台作品</span><span>已入库</span><span>发现与刷新</span><span>操作</span></div>
              {pagedViralCreators.map((creator) => <div className="adminDataRow" key={creator.id}>
                <label className="adminSelectCell"><input aria-label={`选择 ${creator.display_name}`} checked={selectedCreatorIds.includes(creator.id)} type="checkbox" onChange={(event) => setSelectedCreatorIds((current) => event.target.checked ? [...new Set([...current, creator.id])] : current.filter((id) => id !== creator.id))} /></label>
                <div className="adminDataCell"><strong>{creator.display_name}</strong><span>{creator.platform} · {creator.source_kind}{creator.discovery_query ? ` · ${creator.discovery_query}` : ""}</span><span>{creator.bio || "作者主页简介未获取"}</span></div>
                <div><CreatorStatus value={creator.status} /></div>
                <strong>{formatCreatorCount(creator.follower_count)}</strong>
                <strong>{formatCreatorCount(creator.platform_work_count)}</strong>
                <strong>{creator.work_count} 条</strong>
                <div className="adminDataCell"><strong>{formatDate(creator.last_discovered_at)}</strong><span>{creator.last_refreshed_at ? `刷新 ${formatDate(creator.last_refreshed_at)}` : "未刷新"} · {creator.refresh_status}</span></div>
                <div className="adminRowMenu">
                  {creator.profile_url ? <a className="secondaryButton linkButton" href={creator.profile_url} target="_blank" rel="noreferrer">主页</a> : null}
                  {creator.status !== "active" ? <button className="secondaryButton" onClick={() => void updateViralCreatorStatus([creator.id], "active")} type="button">重点跟踪</button> : null}
                  {creator.status === "active" ? <button className="secondaryButton" onClick={() => void updateViralCreatorStatus([creator.id], "paused")} type="button">暂停</button> : null}
                  {creator.status !== "excluded" ? <button className="secondaryButton" onClick={() => requestConfirm({ title: "从候选池排除该作者？", description: `${creator.display_name} 将停止出现在运营候选池；历史作品与发现记录会保留。`, confirmLabel: "确认排除", danger: true, onConfirm: () => updateViralCreatorStatus([creator.id], "excluded") })} type="button">排除</button> : null}
                </div>
              </div>)}
              {!loading && filteredViralCreators.length === 0 ? <AdminEmptyState title="暂无匹配作者" description="爆款数据任务发现作者后，会自动沉淀到这里供运营筛选与跟踪。" /> : null}
            </div>
            <AdminPagination page={currentPage} pageSize={pageSize} pageSizeOptions={settings.ui.tablePageSizeOptions} total={filteredViralCreators.length} onPageChange={updatePage} onPageSizeChange={(size) => { setPageSize(size); updatePage(1); }} />
          </AdminPanel> : null}

          <AdminDrawer open={viralDrawerOpen} title={viralForm.id ? "编辑爆款资源" : "新增爆款资源"} description="发布后会优先展示在用户端爆款模块" onClose={() => setViralDrawerOpen(false)}>
            <form className="stackForm" onSubmit={saveViralContent}>
              <AdminField label="标题"><input required maxLength={160} value={viralForm.title} onChange={(event) => setViralForm((current) => ({ ...current, title: event.target.value }))} /></AdminField>
              <div className="settingsFormGrid"><AdminField label="平台"><select value={viralForm.platform} onChange={(event) => setViralForm((current) => ({ ...current, platform: event.target.value }))}><option>抖音</option><option>视频号</option><option>小红书</option><option>公众号</option></select></AdminField><AdminField label="内容类型"><select value={viralForm.contentType} onChange={(event) => setViralForm((current) => ({ ...current, contentType: event.target.value }))}><option>短视频</option><option>爆文</option><option>图文</option><option>直播切片</option></select></AdminField><AdminField label="业务分类"><input required value={viralForm.category} onChange={(event) => setViralForm((current) => ({ ...current, category: event.target.value }))} /></AdminField><AdminField label="运营排序"><input min="0" type="number" value={viralForm.sortOrder} onChange={(event) => setViralForm((current) => ({ ...current, sortOrder: event.target.value }))} /></AdminField></div>
              <AdminField label="来源链接"><input required type="url" value={viralForm.sourceUrl} onChange={(event) => setViralForm((current) => ({ ...current, sourceUrl: event.target.value }))} /></AdminField>
              <AdminField label="标签" hint="用逗号或顿号分隔"><input value={viralForm.tags} onChange={(event) => setViralForm((current) => ({ ...current, tags: event.target.value }))} /></AdminField>
              <AdminField label="推荐角度" hint="发布前必填，将用于用户端展示和 AI 二创参考"><textarea required value={viralForm.insight} onChange={(event) => setViralForm((current) => ({ ...current, insight: event.target.value }))} /></AdminField>
              <AdminField label="内容摘要"><textarea value={viralForm.summary} onChange={(event) => setViralForm((current) => ({ ...current, summary: event.target.value }))} /></AdminField>
              <AdminField label="文章正文/转写稿"><textarea rows={8} value={viralForm.articleBody} onChange={(event) => setViralForm((current) => ({ ...current, articleBody: event.target.value }))} /></AdminField>
              <div className="settingsFormGrid"><AdminField label="封面地址"><input type="url" value={viralForm.thumbnailUrl} onChange={(event) => setViralForm((current) => ({ ...current, thumbnailUrl: event.target.value }))} /></AdminField><AdminField label="热度数值"><input min="0" type="number" value={viralForm.metricValue} onChange={(event) => setViralForm((current) => ({ ...current, metricValue: event.target.value }))} /></AdminField><AdminField label="热度单位"><input value={viralForm.metricUnit} onChange={(event) => setViralForm((current) => ({ ...current, metricUnit: event.target.value }))} /></AdminField></div>
              <AdminField label="风险提示"><textarea value={viralForm.riskNote} onChange={(event) => setViralForm((current) => ({ ...current, riskNote: event.target.value }))} /></AdminField>
              <div className="settingsFormGrid"><AdminField label="状态"><select value={viralForm.status} onChange={(event) => setViralForm((current) => ({ ...current, status: event.target.value }))}><option value="draft">草稿</option><option value="pending_review">待审核</option><option value="published">已发布</option><option value="offline">已下线</option></select></AdminField><AdminField label="开始展示"><input type="datetime-local" value={viralForm.publishAt} onChange={(event) => setViralForm((current) => ({ ...current, publishAt: event.target.value }))} /></AdminField><AdminField label="结束展示"><input type="datetime-local" value={viralForm.expireAt} onChange={(event) => setViralForm((current) => ({ ...current, expireAt: event.target.value }))} /></AdminField></div>
              <label className="checkboxRow"><input checked={viralForm.isPinned} type="checkbox" onChange={(event) => setViralForm((current) => ({ ...current, isPinned: event.target.checked }))} />置顶</label><label className="checkboxRow"><input checked={viralForm.isFeatured} type="checkbox" onChange={(event) => setViralForm((current) => ({ ...current, isFeatured: event.target.checked }))} />重点推荐</label>
              <button className="primaryButton" type="submit">保存爆款资源</button>
            </form>
          </AdminDrawer>
        </div>
      ) : null}

      {tab === "commerce" ? (
        <div className="pageStack">
          <div className="adminSegmented" role="tablist" aria-label="商业化视图">
            <button className={commerceView === "orders" ? "active" : ""} onClick={() => setCommerceView("orders")} type="button">订单</button>
            <button className={commerceView === "plans" ? "active" : ""} onClick={() => setCommerceView("plans")} type="button">套餐</button>
            <button className={commerceView === "promos" ? "active" : ""} onClick={() => setCommerceView("promos")} type="button">优惠码</button>
          </div>

          {commerceView === "orders" ? <>
            <div className="metricGrid adminMetrics">
              <Metric label="订单总数" value={summary?.orders ?? 0} />
              <Metric label="付费用户" value={summary?.paidUsers ?? 0} />
              <Metric label="今日收入" value={`¥${((summary?.todayRevenueCents ?? 0) / 100).toFixed(0)}`} />
              <Metric label="累计收入" value={`¥${((summary?.paidAmountCents ?? 0) / 100).toFixed(0)}`} />
            </div>
            <AdminPanel title="订单管理">
              <AdminToolbar>
                <input aria-label="搜索订单" value={orderSearch} onChange={(event) => { setOrderSearch(event.target.value); updatePage(1); }} placeholder="搜索用户、订单号或支付渠道" />
                <select aria-label="订单状态" value={orderStatusFilter} onChange={(event) => { setOrderStatusFilter(event.target.value); updatePage(1); }}>
                  <option value="all">全部状态</option><option value="pending">待支付</option><option value="paid">已支付</option><option value="failed">失败</option><option value="refunded">已退款</option>
                </select>
              </AdminToolbar>
              <div className="adminDataTable" style={{ "--admin-columns": "minmax(250px,1.5fr) 110px 110px 130px minmax(280px,auto)" } as CSSProperties}>
                <div className="adminDataHeader"><span>用户 / 订单</span><span>状态</span><span>渠道</span><span>金额</span><span>操作</span></div>
                {pagedOrders.map((order) => <div className="adminDataRow" key={order.id}>
                  <div className="adminDataCell"><strong>{order.user_email}</strong><span>{order.id} · {formatDate(order.created_at)}</span></div>
                  <div><AdminStatus value={order.status} /></div><span>{order.provider}</span>
                  <div className="adminDataCell"><strong>{formatMoney(order.amount_cents, order.currency)}</strong><span>{order.quota_amount} 点</span></div>
                  <div className="adminRowMenu">
                    <button className="secondaryButton" onClick={() => setSelectedOrder(order)} type="button">详情</button>
                    {order.status === "pending" && order.provider !== "stripe" ? <button className="secondaryButton" onClick={() => requestConfirm({ title: "确认订单已支付？", description: `确认后将向 ${order.user_email} 发放 ${order.quota_amount} 点积分。`, confirmLabel: "确认并发放积分", onConfirm: () => updateOrder(order.id, "paid") })} type="button">标记已支付</button> : null}
                    {order.status === "pending" ? <button className="secondaryButton" onClick={() => requestConfirm({ title: "标记订单失败？", description: "订单将关闭，关联优惠码占用会被释放。", confirmLabel: "标记失败", danger: true, onConfirm: () => updateOrder(order.id, "failed") })} type="button">标记失败</button> : null}
                    {order.status === "paid" ? <button className="secondaryButton" onClick={() => requestConfirm({ title: "确认退款并回收积分？", description: `${formatMoney(order.amount_cents, order.currency)} 将原路退款，同时回收 ${order.quota_amount} 点积分。此操作不可撤销。`, confirmLabel: "确认退款", danger: true, requireText: "退款", onConfirm: () => updateOrder(order.id, "refunded") })} type="button">退款</button> : null}
                  </div>
                </div>)}
                {!loading && filteredOrders.length === 0 ? <AdminEmptyState title="暂无订单" description="当前筛选条件下没有订单记录。" /> : null}
              </div>
              <AdminPagination page={currentPage} pageSize={pageSize} pageSizeOptions={settings.ui.tablePageSizeOptions} total={filteredOrders.length} onPageChange={updatePage} onPageSizeChange={(size) => { setPageSize(size); updatePage(1); }} />
            </AdminPanel>
          </> : null}

          {commerceView === "plans" ? <AdminPanel title="套餐管理">
            <AdminToolbar><span>用户端套餐配置</span><button className="primaryButton" onClick={() => { setPlanForm({ code: "", name: "", quotaAmount: 100, amountCents: 9900, currency: "CNY", description: "", recommended: false, status: "active", sortOrder: 0 }); setPlanDrawerOpen(true); }} type="button">新建套餐</button></AdminToolbar>
            <div className="tableList">{plans.map((plan) => <div className="tableRow" key={plan.code}><div><strong>{plan.name}{plan.recommended ? " · 推荐" : ""}</strong><span>{plan.quotaAmount} 点 · {formatMoney(plan.amountCents, plan.currency)} · {plan.description}</span></div><div className="rowActions"><AdminStatus value={plan.status ?? "active"} /><button className="secondaryButton" onClick={() => { setPlanForm(plan); setPlanDrawerOpen(true); }} type="button">编辑</button></div></div>)}{plans.length === 0 ? <AdminEmptyState title="暂无套餐" description="创建第一个可供用户购买的积分套餐。" /> : null}</div>
          </AdminPanel> : null}

          {commerceView === "promos" ? <AdminPanel title="优惠码管理">
            <AdminToolbar><span>管理赠送积分和折扣优惠码</span><button className="primaryButton" onClick={() => setPromoDrawerOpen(true)} type="button">新建优惠码</button></AdminToolbar>
            <div className="tableList">{promoCodes.map((item) => <div className="tableRow" key={item.id}><div><strong>{item.code}</strong><span>{item.reward_type === "credit" ? `${item.credit_amount} 点` : `${item.discount_percent}% 折扣`} · 已用 ${item.redeemed_count}/${item.max_redemptions}</span><progress max={Math.max(item.max_redemptions, 1)} value={item.redeemed_count} /></div><div className="rowActions"><AdminStatus value={item.status} /><button className="secondaryButton" onClick={() => void updatePromoStatus(item.id, item.status === "active" ? "inactive" : "active")} type="button">{item.status === "active" ? "停用" : "启用"}</button><button className="secondaryButton" onClick={() => requestConfirm({ title: "删除优惠码？", description: `${item.code} 将被永久删除；已有兑换记录时系统会阻止删除。`, confirmLabel: "删除", danger: true, requireText: item.code, onConfirm: () => deletePromo(item.id) })} type="button">删除</button></div></div>)}{promoCodes.length === 0 ? <AdminEmptyState title="暂无优惠码" description="创建优惠码用于拉新、补偿或促销活动。" /> : null}</div>
          </AdminPanel> : null}

          <AdminDrawer open={planDrawerOpen} title={planForm.code ? "编辑套餐" : "新建套餐"} description="保存后会同步影响用户购买页" onClose={() => setPlanDrawerOpen(false)}>
            <form className="stackForm" id="admin-plan-form" onSubmit={savePlan}>
              <AdminField label="套餐代码"><input required value={planForm.code} onChange={(event) => setPlanForm((current) => ({ ...current, code: event.target.value }))} /></AdminField>
              <AdminField label="套餐名称"><input required value={planForm.name} onChange={(event) => setPlanForm((current) => ({ ...current, name: event.target.value }))} /></AdminField>
              <AdminField label="积分数量（点）"><input min="1" required type="number" value={planForm.quotaAmount} onChange={(event) => setPlanForm((current) => ({ ...current, quotaAmount: Number(event.target.value) }))} /></AdminField>
              <AdminField label="销售价格（元）" hint={`用户端预览：${planForm.name || "套餐"} · ${planForm.quotaAmount} 点 · ¥${(planForm.amountCents / 100).toFixed(2)}`}><input min="0" step="0.01" type="number" value={planForm.amountCents / 100} onChange={(event) => setPlanForm((current) => ({ ...current, amountCents: Math.round(Number(event.target.value) * 100) }))} /></AdminField>
              <AdminField label="套餐说明"><textarea required value={planForm.description} onChange={(event) => setPlanForm((current) => ({ ...current, description: event.target.value }))} /></AdminField>
              <AdminField label="状态"><select value={planForm.status ?? "active"} onChange={(event) => setPlanForm((current) => ({ ...current, status: event.target.value }))}><option value="active">上架</option><option value="inactive">下架</option></select></AdminField>
              <label className="checkboxRow"><input checked={Boolean(planForm.recommended)} type="checkbox" onChange={(event) => setPlanForm((current) => ({ ...current, recommended: event.target.checked }))} />推荐套餐</label>
              <button className="primaryButton" type="submit">保存套餐</button>
            </form>
          </AdminDrawer>

          <AdminDrawer open={promoDrawerOpen} title="新建优惠码" description="设置发放内容、有效期和使用上限" onClose={() => setPromoDrawerOpen(false)}>
            <form className="stackForm" onSubmit={savePromo}>
              <AdminField label="优惠码"><input required value={promoForm.code} onChange={(event) => setPromoForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))} /></AdminField>
              <AdminField label="奖励类型"><select value={promoForm.rewardType} onChange={(event) => setPromoForm((current) => ({ ...current, rewardType: event.target.value }))}><option value="credit">赠送积分</option><option value="discount">订单折扣</option></select></AdminField>
              {promoForm.rewardType === "credit" ? <AdminField label="赠送积分（点）"><input min="1" type="number" value={promoForm.creditAmount} onChange={(event) => setPromoForm((current) => ({ ...current, creditAmount: Number(event.target.value) }))} /></AdminField> : <AdminField label="折扣比例（%）"><input min="1" max="100" type="number" value={promoForm.discountPercent} onChange={(event) => setPromoForm((current) => ({ ...current, discountPercent: Number(event.target.value) }))} /></AdminField>}
              <AdminField label="最多兑换次数"><input min="1" type="number" value={promoForm.maxRedemptions} onChange={(event) => setPromoForm((current) => ({ ...current, maxRedemptions: Number(event.target.value) }))} /></AdminField>
              <AdminField label="开始时间"><input type="datetime-local" value={promoForm.startsAt} onChange={(event) => setPromoForm((current) => ({ ...current, startsAt: event.target.value }))} /></AdminField>
              <AdminField label="结束时间"><input type="datetime-local" value={promoForm.expiresAt} onChange={(event) => setPromoForm((current) => ({ ...current, expiresAt: event.target.value }))} /></AdminField>
              <AdminField label="内部备注"><textarea value={promoForm.notes} onChange={(event) => setPromoForm((current) => ({ ...current, notes: event.target.value }))} /></AdminField>
              <button className="primaryButton" type="submit">创建优惠码</button>
            </form>
          </AdminDrawer>

          <AdminDrawer open={Boolean(selectedOrder)} title="订单详情" description={selectedOrder?.id} onClose={() => setSelectedOrder(null)}>
            {selectedOrder ? <div className="pageStack"><AdminPanel title="订单信息"><Row title="用户" meta={`${selectedOrder.user_name} · ${selectedOrder.user_email}`} /><Row title="支付" meta={`${selectedOrder.provider} · ${formatMoney(selectedOrder.amount_cents, selectedOrder.currency)}`} /><Row title="积分" meta={`${selectedOrder.quota_amount} 点`} /><Row title="创建时间" meta={formatDate(selectedOrder.created_at)} /><Row title="支付时间" meta={selectedOrder.paid_at ? formatDate(selectedOrder.paid_at) : "尚未支付"} /></AdminPanel><AdminPanel title="状态时间线"><div className="adminTimeline"><span>订单创建</span><strong>{formatDate(selectedOrder.created_at)}</strong>{selectedOrder.paid_at ? <><span>支付完成</span><strong>{formatDate(selectedOrder.paid_at)}</strong></> : null}</div></AdminPanel></div> : null}
          </AdminDrawer>
        </div>
      ) : null}

      {tab === "growth" ? (
        <div className="pageStack">
          <AdminPanel title="公告列表">
            <AdminToolbar><span>{announcements.filter((item) => item.status === "published").length} 条正在展示</span><button className="primaryButton" onClick={() => { setAnnouncementForm({ id: "", title: "", content: "", kind: "notice", placement: "global", status: "draft", isPinned: false, linkUrl: "" }); setAnnouncementDrawerOpen(true); }} type="button">新建公告</button></AdminToolbar>
            <div className="tableList">
              {announcements.map((item) => (
                <div className="tableRow" key={item.id}>
                  <div>
                    <strong>{item.title}</strong>
                    <span>{item.kind} · {item.placement} · {item.status}{item.is_pinned ? " · 已置顶" : ""}</span>
                  </div>
                  <div className="rowActions">
                    <AdminStatus value={item.status} />
                    <button className="secondaryButton" onClick={() => { setAnnouncementForm({ id: item.id, title: item.title, content: item.content, kind: item.kind, placement: item.placement, status: item.status, isPinned: item.is_pinned, linkUrl: item.link_url ?? "" }); setAnnouncementDrawerOpen(true); }} type="button">编辑</button>
                    <button className="secondaryButton" onClick={() => void updateAnnouncementStatus(item.id, item.status === "published" ? "draft" : "published")}>
                      {item.status === "published" ? "下线" : "发布"}
                    </button>
                    <button className="secondaryButton" onClick={() => requestConfirm({ title: "删除公告？", description: `${item.title} 将永久删除，历史审计记录仍会保留。`, confirmLabel: "删除", danger: true, onConfirm: () => deleteAnnouncement(item.id) })}>删除</button>
                  </div>
                </div>
              ))}
              {announcements.length === 0 ? <div className="emptyState">暂无公告。</div> : null}
            </div>
          </AdminPanel>
          <AdminDrawer open={announcementDrawerOpen} title={announcementForm.id ? "编辑公告" : "新建公告"} description="公告可按用户访问场景投放" onClose={() => setAnnouncementDrawerOpen(false)}>
            <form className="stackForm" onSubmit={saveAnnouncement}>
              <AdminField label="公告标题"><input required value={announcementForm.title} onChange={(event) => setAnnouncementForm((current) => ({ ...current, title: event.target.value }))} /></AdminField>
              <AdminField label="公告内容"><textarea required value={announcementForm.content} onChange={(event) => setAnnouncementForm((current) => ({ ...current, content: event.target.value }))} /></AdminField>
              <AdminField label="跳转链接" hint="可选，使用完整的 https:// 地址。"><input value={announcementForm.linkUrl} onChange={(event) => setAnnouncementForm((current) => ({ ...current, linkUrl: event.target.value }))} /></AdminField>
              <AdminField label="类型"><select value={announcementForm.kind} onChange={(event) => setAnnouncementForm((current) => ({ ...current, kind: event.target.value }))}><option value="notice">通知</option><option value="campaign">活动</option><option value="update">产品更新</option></select></AdminField>
              <AdminField label="展示位置"><select value={announcementForm.placement} onChange={(event) => setAnnouncementForm((current) => ({ ...current, placement: event.target.value }))}><option value="global">全站</option><option value="dashboard">今日灵感</option><option value="billing">充值中心</option><option value="benefits">邀请有礼</option></select></AdminField>
              <AdminField label="发布状态"><select value={announcementForm.status} onChange={(event) => setAnnouncementForm((current) => ({ ...current, status: event.target.value }))}><option value="draft">保存草稿</option><option value="published">立即发布</option></select></AdminField>
              <label className="checkboxRow"><input checked={announcementForm.isPinned} type="checkbox" onChange={(event) => setAnnouncementForm((current) => ({ ...current, isPinned: event.target.checked }))} />置顶公告</label>
              <div className="adminAnnouncementPreview"><span>用户端预览</span><strong>{announcementForm.title || "公告标题"}</strong><p>{announcementForm.content || "公告内容会显示在这里。"}</p></div>
              <button className="primaryButton" type="submit">{announcementForm.id ? "保存修改" : announcementForm.status === "published" ? "发布公告" : "保存草稿"}</button>
            </form>
          </AdminDrawer>
        </div>
      ) : null}

      {tab === "support" ? (
        <div className="pageStack">
          <div className="adminSegmented" role="tablist" aria-label="反馈与审计视图">
            <button className={supportView === "tickets" ? "active" : ""} onClick={() => setSupportView("tickets")} type="button">反馈工单</button>
            <button className={supportView === "audit" ? "active" : ""} onClick={() => setSupportView("audit")} type="button">操作审计</button>
          </div>
          {supportView === "tickets" ? <>
            <div className="metricGrid adminMetrics">
              <Metric label="待处理" value={feedbackTickets.filter((item) => item.status === "open").length} />
              <Metric label="处理中" value={feedbackTickets.filter((item) => item.status === "in_progress").length} />
              <Metric label="高优先级" value={feedbackTickets.filter((item) => item.priority === "high" && !["resolved", "closed"].includes(item.status)).length} />
              <Metric label="已解决" value={feedbackTickets.filter((item) => item.status === "resolved").length} />
            </div>
            <AdminPanel title="工单队列">
              <AdminToolbar>
                <input aria-label="搜索工单" value={feedbackSearch} onChange={(event) => { setFeedbackSearch(event.target.value); updatePage(1); }} placeholder="搜索标题、用户、分类或内容" />
                <select aria-label="工单状态" value={feedbackStatusFilter} onChange={(event) => { setFeedbackStatusFilter(event.target.value); updatePage(1); }}><option value="all">全部状态</option><option value="open">待处理</option><option value="in_progress">处理中</option><option value="resolved">已解决</option><option value="closed">已关闭</option></select>
              </AdminToolbar>
              <div className="adminDataTable" style={{ "--admin-columns": "minmax(280px,1.6fr) 140px 110px 140px 120px" } as CSSProperties}>
                <div className="adminDataHeader"><span>工单</span><span>用户</span><span>优先级</span><span>状态</span><span>操作</span></div>
                {pagedTickets.map((ticket) => <div className="adminDataRow" key={ticket.id}>
                  <div className="adminDataCell"><strong>{ticket.title}</strong><span>{ticket.category} · {ticket.content}</span></div>
                  <div className="adminDataCell"><strong>{ticket.user_name ?? "未知用户"}</strong><span>{ticket.user_email ?? "-"}</span></div>
                  <div><AdminStatus value={ticket.priority} /></div><div><AdminStatus value={ticket.status} /></div>
                  <div className="adminRowMenu"><button className="secondaryButton" onClick={() => { setSelectedTicket(ticket); if (!feedbackReplies[ticket.id]) setFeedbackReplies((current) => ({ ...current, [ticket.id]: ticket.admin_reply ?? "" })); }} type="button">处理</button></div>
                </div>)}
                {!loading && filteredFeedbackTickets.length === 0 ? <AdminEmptyState title="没有匹配的工单" description="尝试清除筛选条件，或切换到其他状态。" /> : null}
              </div>
              <AdminPagination page={currentPage} pageSize={pageSize} pageSizeOptions={settings.ui.tablePageSizeOptions} total={filteredFeedbackTickets.length} onPageChange={updatePage} onPageSizeChange={(size) => { setPageSize(size); updatePage(1); }} />
            </AdminPanel>
          </> : null}

          {supportView === "audit" ? <AdminPanel title="管理员操作审计">
            <AdminToolbar><input aria-label="搜索审计日志" value={auditSearch} onChange={(event) => { setAuditSearch(event.target.value); updatePage(1); }} placeholder="搜索管理员、动作或目标" /></AdminToolbar>
            <div className="tableList">{pagedAuditLogs.map((log) => <details className="adminAuditRow" key={log.id}><summary><span><strong>{adminActionLabel(log.action)}</strong><small>{log.admin_email ?? "未知管理员"} · {log.target_type} · {formatDate(log.created_at)}</small></span><AdminStatus value="active" /></summary>{Object.keys(log.detail ?? {}).length ? <pre>{JSON.stringify(log.detail, null, 2)}</pre> : <p>没有附加变更信息。</p>}</details>)}{filteredAuditLogs.length === 0 ? <AdminEmptyState title="没有审计记录" description="当前搜索条件下没有匹配的管理员操作。" /> : null}</div>
            <AdminPagination page={currentPage} pageSize={pageSize} pageSizeOptions={settings.ui.tablePageSizeOptions} total={filteredAuditLogs.length} onPageChange={updatePage} onPageSizeChange={(size) => { setPageSize(size); updatePage(1); }} />
          </AdminPanel> : null}

          <AdminDrawer open={Boolean(selectedTicket)} title={selectedTicket?.title ?? "处理工单"} description={selectedTicket ? `${selectedTicket.user_email ?? "未知用户"} · ${formatDate(selectedTicket.updated_at)}` : undefined} onClose={() => setSelectedTicket(null)}>
            {selectedTicket ? <div className="pageStack">
              <div className="adminTicketMeta"><AdminStatus value={selectedTicket.priority} /><AdminStatus value={selectedTicket.status} /><span>{selectedTicket.category}</span></div>
              <AdminPanel title="用户反馈"><p className="adminLongText">{selectedTicket.content}</p></AdminPanel>
              {selectedTicket.admin_reply ? <AdminPanel title="最近回复"><p className="adminLongText">{selectedTicket.admin_reply}</p></AdminPanel> : null}
              <AdminField label="回复用户"><textarea value={feedbackReplies[selectedTicket.id] ?? ""} onChange={(event) => setFeedbackReplies((current) => ({ ...current, [selectedTicket.id]: event.target.value }))} placeholder="输入清晰、可执行的处理结果" /></AdminField>
              <div className="adminDrawerActionGrid">
                <button className="secondaryButton" onClick={() => void updateFeedback(selectedTicket.id, { status: "in_progress" })} type="button">标记处理中</button>
                <button className="secondaryButton" onClick={() => void updateFeedback(selectedTicket.id, { priority: selectedTicket.priority === "high" ? "normal" : "high" })} type="button">{selectedTicket.priority === "high" ? "降为普通" : "设为高优先级"}</button>
                <button className="primaryButton" onClick={() => { void updateFeedback(selectedTicket.id, { status: "resolved", adminReply: feedbackReplies[selectedTicket.id] || selectedTicket.admin_reply || "已处理，感谢反馈。" }); setSelectedTicket(null); }} type="button">回复并解决</button>
                <button className="secondaryButton" onClick={() => requestConfirm({ title: selectedTicket.status === "closed" ? "重新打开工单？" : "关闭工单？", description: selectedTicket.status === "closed" ? "工单将回到待处理队列。" : "关闭后仍保留全部处理记录。", confirmLabel: selectedTicket.status === "closed" ? "重新打开" : "关闭工单", danger: selectedTicket.status !== "closed", onConfirm: async () => { await updateFeedback(selectedTicket.id, { status: selectedTicket.status === "closed" ? "open" : "closed" }); setSelectedTicket(null); } })} type="button">{selectedTicket.status === "closed" ? "重新打开" : "关闭工单"}</button>
              </div>
            </div> : null}
          </AdminDrawer>
        </div>
      ) : null}

      {tab === "settings" ? (
        <div className="pageStack adminSettingsWorkspace">
          <nav className="settingsTabs" aria-label="系统设置分区" onKeyDown={(event) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            const currentIndex = settingsTabs.findIndex(([key]) => key === settingsTab);
            const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? settingsTabs.length - 1 : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + settingsTabs.length) % settingsTabs.length;
            const nextTab = settingsTabs[nextIndex][0];
            setSettingsTab(nextTab);
            if (nextTab === "services" && !serviceHealth) void refreshServiceHealth();
            window.requestAnimationFrame(() => document.getElementById(`settings-tab-${nextTab}`)?.focus());
          }} role="tablist">
            {settingsTabs.map(([key,label]) => <button aria-controls="settings-tabpanel" aria-selected={settingsTab === key} className={settingsTab === key ? "active" : ""} id={`settings-tab-${key}`} key={key} onClick={() => { setSettingsTab(key); if (key === "services" && !serviceHealth) void refreshServiceHealth(); }} role="tab" tabIndex={settingsTab === key ? 0 : -1} type="button">{label}</button>)}
          </nav>

          <div aria-labelledby={`settings-tab-${settingsTab}`} id="settings-tabpanel" role="tabpanel">
          {settingsTab === "payment" ? <><PaymentSettingsSwitches settings={settings} setSettings={setSettings} /><PaymentCancellationPanel settings={settings} setSettings={setSettings} /><PaymentProviderPanel providers={paymentProviders} form={providerForm} setForm={setProviderForm} onSave={savePaymentProvider} onDelete={deletePaymentProvider} /></> : null}

          {settingsTab === "general" ? <AdminPanel title="站点与维护">
            <div className="settingsFormGrid">
              <SettingsField label="站点名称" hint="显示在登录页、侧栏和标题区域"><input value={settings.site.siteName} onChange={(event) => setSettings((current) => ({ ...current, site: { ...current.site, siteName: event.target.value } }))} /></SettingsField>
              <SettingsField label="站点副标题"><input value={settings.site.siteSubtitle} onChange={(event) => setSettings((current) => ({ ...current, site: { ...current.site, siteSubtitle: event.target.value } }))} /></SettingsField>
              <SettingsField label="客服联系方式"><input value={settings.site.supportContact} onChange={(event) => setSettings((current) => ({ ...current, site: { ...current.site, supportContact: event.target.value } }))} /></SettingsField>
              <SettingsField label="页脚文案"><textarea value={settings.site.footerNote} onChange={(event) => setSettings((current) => ({ ...current, site: { ...current.site, footerNote: event.target.value } }))} /></SettingsField>
              <SettingsNumber label="后台默认每页条数" value={settings.ui.tableDefaultPageSize} min={5} max={200} onChange={(value) => setSettings((current) => ({ ...current, ui: { ...current.ui, tableDefaultPageSize: value } }))} />
              <SettingsField label="可选分页条数" hint="英文逗号分隔，默认值必须包含在内。"><input value={settings.ui.tablePageSizeOptions.join(", ")} onChange={(event) => setSettings((current) => ({ ...current, ui: { ...current.ui, tablePageSizeOptions: event.target.value.split(",").map((item) => Number(item.trim())).filter((item) => Number.isInteger(item) && item > 0) } }))} /></SettingsField>
              <SettingsField label="品牌 Logo 地址" hint="支持站内路径或 HTTPS 地址。"><input value={settings.site.logoUrl} onChange={(event) => setSettings((current) => ({ ...current, site: { ...current.site, logoUrl: event.target.value } }))} /></SettingsField>
              <SettingsField label="帮助中心地址"><input value={settings.site.helpUrl} onChange={(event) => setSettings((current) => ({ ...current, site: { ...current.site, helpUrl: event.target.value } }))} /></SettingsField>
              <SettingsField label="首页运营提示"><textarea value={settings.site.homeContent} onChange={(event) => setSettings((current) => ({ ...current, site: { ...current.site, homeContent: event.target.value } }))} /></SettingsField>
            </div>
            <div className="settingsSubsection"><div className="panelHeaderActions"><strong>自定义导航</strong><button className="secondaryButton" onClick={() => setSettings((current) => ({ ...current, site: { ...current.site, customNavItems: [...current.site.customNavItems, { id: `nav-${Date.now()}`, label: "新入口", url: "/help", visibility: "user", sortOrder: current.site.customNavItems.length * 10 }] } }))} type="button">新增入口</button></div><div className="tableList">{settings.site.customNavItems.map((item, index) => <div className="settingsNavEditor" key={item.id}><input aria-label="入口名称" value={item.label} onChange={(event) => setSettings((current) => ({ ...current, site: { ...current.site, customNavItems: current.site.customNavItems.map((entry, itemIndex) => itemIndex === index ? { ...entry, label: event.target.value } : entry) } }))} /><input aria-label="入口地址" value={item.url} onChange={(event) => setSettings((current) => ({ ...current, site: { ...current.site, customNavItems: current.site.customNavItems.map((entry, itemIndex) => itemIndex === index ? { ...entry, url: event.target.value } : entry) } }))} /><select aria-label="可见范围" value={item.visibility} onChange={(event) => setSettings((current) => ({ ...current, site: { ...current.site, customNavItems: current.site.customNavItems.map((entry, itemIndex) => itemIndex === index ? { ...entry, visibility: event.target.value as "user" | "admin" } : entry) } }))}><option value="user">用户导航</option><option value="admin">管理导航</option></select><input aria-label="排序" type="number" value={item.sortOrder} onChange={(event) => setSettings((current) => ({ ...current, site: { ...current.site, customNavItems: current.site.customNavItems.map((entry, itemIndex) => itemIndex === index ? { ...entry, sortOrder: Number(event.target.value) } : entry) } }))} /><button className="secondaryButton" onClick={() => setSettings((current) => ({ ...current, site: { ...current.site, customNavItems: current.site.customNavItems.filter((_, itemIndex) => itemIndex !== index) } }))} type="button">删除</button></div>)}{settings.site.customNavItems.length === 0 ? <AdminEmptyState title="暂无自定义入口" description="可添加帮助文档、活动页或内部运营入口。" /> : null}</div></div>
            <SettingsToggle title="维护模式" hint="开启后普通用户无法注册、登录、创作或下单，管理员仍可进入后台。" checked={settings.site.maintenanceMode} onChange={(checked) => setSettings((current) => ({ ...current, site: { ...current.site, maintenanceMode: checked } }))} />
            {settings.site.maintenanceMode ? <SettingsField label="维护提示"><textarea value={settings.site.maintenanceMessage} onChange={(event) => setSettings((current) => ({ ...current, site: { ...current.site, maintenanceMessage: event.target.value } }))} /></SettingsField> : null}
          </AdminPanel> : null}
          {settingsTab === "features" ? <AdminPanel title="本地 Agent 发布开关"><SettingsToggle title="爆款二创本地 Agent" hint="兼容 Agent 已在线后再开启；此开关会同时作用于全部 Web 节点。" checked={settings.features.localAgentEnabled} onChange={(checked) => setSettings((current) => ({ ...current, features: { ...current.features, localAgentEnabled: checked } }))} /></AdminPanel> : null}

          {settingsTab === "legal" ? <div className="pageStack"><AdminPanel title="协议生效规则"><div className="settingsFormGrid"><SettingsField label="协议版本"><input value={settings.legal.termsVersion} onChange={(event) => setSettings((current) => ({ ...current, legal: { ...current.legal, termsVersion: event.target.value } }))} /></SettingsField><SettingsField label="更新日期"><input type="date" value={settings.legal.termsUpdatedAt} onChange={(event) => setSettings((current) => ({ ...current, legal: { ...current.legal, termsUpdatedAt: event.target.value } }))} /></SettingsField><SettingsField label="注册展示方式" hint="勾选模式更简洁；弹窗模式可在注册页内完整阅读。"><select value={settings.legal.displayMode} onChange={(event) => setSettings((current) => ({ ...current, legal: { ...current.legal, displayMode: event.target.value as SystemSettings["legal"]["displayMode"] } }))}><option value="checkbox">勾选确认</option><option value="modal">弹窗阅读</option></select></SettingsField></div><SettingsToggle title="启用登录条款" hint="注册时要求同意全部协议文档。" checked={settings.legal.termsEnabled} onChange={(checked) => setSettings((current) => ({ ...current, legal: { ...current.legal, termsEnabled: checked } }))} /><SettingsToggle title="要求老用户重新确认" hint="协议版本不一致的用户登录后必须确认新版本。" checked={settings.legal.requireReaccept} onChange={(checked) => setSettings((current) => ({ ...current, legal: { ...current.legal, requireReaccept: checked } }))} /><button className="secondaryButton" onClick={() => setSettings((current) => ({ ...current, legal: { ...current.legal, documents: [...current.legal.documents, { slug: `document-${current.legal.documents.length + 1}`, title: "新协议文档", content: "## 文档说明\n\n请编辑协议正文。" }] } }))} type="button">新增协议文档</button></AdminPanel>{settings.legal.documents.map((document, index) => <AdminPanel key={`${document.slug}-${index}`} title={document.title || "协议文档"}><div className="settingsLegalEditor"><div className="settingsFormGrid"><SettingsField label="文档标识" hint={document.slug === "terms" || document.slug === "privacy" ? "核心文档不可删除" : "用于 /legal/标识 路由"}><input disabled={document.slug === "terms" || document.slug === "privacy"} value={document.slug} onChange={(event) => setSettings((current) => ({ ...current, legal: { ...current.legal, documents: current.legal.documents.map((item, itemIndex) => itemIndex === index ? { ...item, slug: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") } : item) } }))} /></SettingsField><SettingsField label="文档标题"><input value={document.title} onChange={(event) => setSettings((current) => ({ ...current, legal: { ...current.legal, documents: current.legal.documents.map((item, itemIndex) => itemIndex === index ? { ...item, title: event.target.value } : item) } }))} /></SettingsField></div><SettingsField label="Markdown 正文" hint={`公开地址：${document.slug === "terms" || document.slug === "privacy" ? `/${document.slug}` : `/legal/${document.slug}`}`}><textarea rows={16} value={document.content} onChange={(event) => setSettings((current) => ({ ...current, legal: { ...current.legal, documents: current.legal.documents.map((item, itemIndex) => itemIndex === index ? { ...item, content: event.target.value } : item) } }))} /></SettingsField><div className="rowActions"><button className="secondaryButton" disabled={index === 0} onClick={() => setSettings((current) => ({ ...current, legal: { ...current.legal, documents: moveItem(current.legal.documents, index, index - 1) } }))} type="button">上移</button><button className="secondaryButton" disabled={index === settings.legal.documents.length - 1} onClick={() => setSettings((current) => ({ ...current, legal: { ...current.legal, documents: moveItem(current.legal.documents, index, index + 1) } }))} type="button">下移</button>{document.slug !== "terms" && document.slug !== "privacy" ? <button className="secondaryButton" onClick={() => setSettings((current) => ({ ...current, legal: { ...current.legal, documents: current.legal.documents.filter((_, itemIndex) => itemIndex !== index) } }))} type="button">删除</button> : null}</div></div></AdminPanel>)}</div> : null}

          {settingsTab === "features" ? <div className="pageStack"><AdminPanel title="业务功能开关"><SettingsToggle title="合规预检" hint="关闭后合规接口拒绝新检查。" checked={settings.features.complianceEnabled} onChange={(checked) => setSettings((current) => ({ ...current, features: { ...current.features, complianceEnabled: checked } }))} /><SettingsToggle title="图片生成" hint="关闭后图片类创作应用不可执行。" checked={settings.features.imageGenerationEnabled} onChange={(checked) => setSettings((current) => ({ ...current, features: { ...current.features, imageGenerationEnabled: checked } }))} /><SettingsToggle title="热点服务" hint="关闭后停止获取和计费热点内容。" checked={settings.features.hotTopicsEnabled} onChange={(checked) => setSettings((current) => ({ ...current, features: { ...current.features, hotTopicsEnabled: checked } }))} /><SettingsToggle title="用户反馈" hint="关闭后用户不能提交或查看反馈工单。" checked={settings.features.feedbackEnabled} onChange={(checked) => setSettings((current) => ({ ...current, features: { ...current.features, feedbackEnabled: checked } }))} /></AdminPanel><AdminPanel title="邀请返利"><SettingsToggle title="启用邀请返利" hint="关闭后新充值不再产生返利，已有返利仍可转入。" checked={settings.affiliate.enabled} onChange={(checked) => setSettings((current) => ({ ...current, affiliate: { ...current.affiliate, enabled: checked } }))} />{settings.affiliate.enabled ? <div className="settingsFormGrid"><SettingsNumber label="全局比例（%）" value={settings.affiliate.rebateRatePercent} min={0} max={100} onChange={(value) => setSettings((current) => ({ ...current, affiliate: { ...current.affiliate, rebateRatePercent: value } }))} /><SettingsNumber label="冻结期（小时）" value={settings.affiliate.freezeHours} min={0} max={720} onChange={(value) => setSettings((current) => ({ ...current, affiliate: { ...current.affiliate, freezeHours: value } }))} /><SettingsNumber label="有效期（天，0=永久）" value={settings.affiliate.durationDays} min={0} max={3650} onChange={(value) => setSettings((current) => ({ ...current, affiliate: { ...current.affiliate, durationDays: value } }))} /><SettingsNumber label="单人上限（0=不限）" value={settings.affiliate.perInviteeCap} min={0} max={1000000} onChange={(value) => setSettings((current) => ({ ...current, affiliate: { ...current.affiliate, perInviteeCap: value } }))} /></div> : null}<div className="tableList settingsAffiliateRecords">{affiliateRecords.map((record) => <div className="tableRow" key={record.invitee_id}><div><strong>{record.inviter_email}</strong><span>邀请 {record.invitee_email} · {record.referral_code}</span></div><b>{record.accrued_credits} 点</b></div>)}{affiliateRecords.length === 0 ? <div className="emptyState">暂无邀请关系。</div> : null}</div>{affiliateLedger.length > 0 ? <div className="tableList settingsAffiliateRecords">{affiliateLedger.slice(0, 30).map((entry) => <div className="tableRow" key={entry.id}><div><strong>{affiliateActionLabel(entry.action)} · {entry.user_email}</strong><span>{entry.source_email ?? "系统"} · {formatDate(entry.created_at)}</span></div><b>{entry.action === "reverse" ? "-" : "+"}{entry.credits} 点</b></div>)}</div> : null}</AdminPanel></div> : null}

          {settingsTab === "security" ? <AdminPanel title="注册与登录安全"><SettingsToggle title="允许新用户注册" hint="关闭后注册接口立即停止创建账号。" checked={settings.auth.allowRegistration} onChange={(checked) => setSettings((current) => ({ ...current, auth: { ...current.auth, allowRegistration: checked } }))} /><SettingsToggle title="注册要求平台准入码" hint="固定准入码与返利邀请码相互独立。" checked={settings.auth.requireInviteCode} onChange={(checked) => setSettings((current) => ({ ...current, auth: { ...current.auth, requireInviteCode: checked } }))} /><SettingsToggle title="邮箱验证" hint="启用后新账号必须验证邮箱才能登录。" checked={settings.auth.emailVerificationEnabled} onChange={(checked) => setSettings((current) => ({ ...current, auth: { ...current.auth, emailVerificationEnabled: checked } }))} /><SettingsToggle title="找回密码" hint="通过一次性邮件链接重置密码。" checked={settings.auth.passwordResetEnabled} onChange={(checked) => setSettings((current) => ({ ...current, auth: { ...current.auth, passwordResetEnabled: checked } }))} /><div className="settingsFormGrid"><SettingsNumber label="会话有效期（天）" value={settings.auth.sessionDays} min={1} max={30} onChange={(value) => setSettings((current) => ({ ...current, auth: { ...current.auth, sessionDays: value } }))} /><SettingsNumber label="登录失败上限" value={settings.auth.loginAttemptLimit} min={3} max={100} onChange={(value) => setSettings((current) => ({ ...current, auth: { ...current.auth, loginAttemptLimit: value } }))} /><SettingsNumber label="限制窗口（分钟）" value={settings.auth.loginWindowMinutes} min={1} max={1440} onChange={(value) => setSettings((current) => ({ ...current, auth: { ...current.auth, loginWindowMinutes: value } }))} /><SettingsField label="允许邮箱域名" hint="英文逗号分隔，留空允许所有域名。"><input value={settings.auth.allowedEmailDomains.join(", ")} onChange={(event) => setSettings((current) => ({ ...current, auth: { ...current.auth, allowedEmailDomains: event.target.value.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean) } }))} /></SettingsField></div><SettingsToggle title="Cloudflare Turnstile" hint="登录和注册都必须通过服务端人机验证。" checked={settings.auth.turnstileEnabled} onChange={(checked) => setSettings((current) => ({ ...current, auth: { ...current.auth, turnstileEnabled: checked } }))} />{settings.auth.turnstileEnabled ? <div className="settingsFormGrid"><SettingsField label="Site Key"><input value={settings.auth.turnstileSiteKey} onChange={(event) => setSettings((current) => ({ ...current, auth: { ...current.auth, turnstileSiteKey: event.target.value } }))} /></SettingsField><SettingsField label="Secret" hint={settings.auth.turnstileSecretConfigured ? "已配置；留空保持原值" : "尚未配置"}><input type="password" value={turnstileSecret} onChange={(event) => setTurnstileSecret(event.target.value)} /></SettingsField></div> : null}</AdminPanel> : null}

          {settingsTab === "defaults" ? <AdminPanel title="新用户默认值"><div className="settingsFormGrid"><SettingsNumber label="注册赠送积分" value={settings.defaults.signupCredits} min={0} max={100000} onChange={(value) => setSettings((current) => ({ ...current, defaults: { ...current.defaults, signupCredits: value } }))} /><SettingsNumber label="每日创作次数（0=不限）" value={settings.defaults.dailyCreationLimit} min={0} max={10000} onChange={(value) => setSettings((current) => ({ ...current, defaults: { ...current.defaults, dailyCreationLimit: value } }))} /><SettingsField label="密码规则提示"><input value={settings.auth.passwordHint} onChange={(event) => setSettings((current) => ({ ...current, auth: { ...current.auth, passwordHint: event.target.value } }))} /></SettingsField></div></AdminPanel> : null}

          {settingsTab === "services" ? <AdminPanel title="外部服务状态"><div className="panelHeaderActions"><button className="secondaryButton" disabled={actionKey === "services"} onClick={() => void refreshServiceHealth()} type="button">{actionKey === "services" ? "检测中" : "重新检测"}</button></div><div className="serviceHealthGrid">{serviceHealth?.checks.map((check) => <article className={check.ok ? "healthy" : "unhealthy"} key={check.key}><div><strong>{check.label}</strong><AdminStatus value={check.ok ? "active" : check.required ? "failed" : "inactive"} /></div><span>{check.latencyMs} ms</span><p>{check.ok ? "连接正常" : check.error}</p></article>)}{!serviceHealth ? <AdminEmptyState title="尚未检测" description="点击重新检测查看数据库、模型、支付、邮件和遥测服务状态。" /> : null}</div>{serviceHealth?.lastStripeWebhook ? <p className="subtleText">最近 Stripe Webhook：{serviceHealth.lastStripeWebhook.lastWebhookAt ?? "未知"} · {serviceHealth.lastStripeWebhook.lastEventType ?? "未知事件"}</p> : null}</AdminPanel> : null}

          {settingsTab === "payment" ? <AdminPanel title="支付运营"><SettingsToggle title="启用 Stripe 支付" hint="密钥仍由服务器环境变量管理。" checked={settings.payment.enableStripe} onChange={(checked) => setSettings((current) => ({ ...current, payment: { ...current.payment, enableStripe: checked } }))} /><SettingsToggle title="显示积分套餐" hint="关闭后保留账单记录，但隐藏购买入口。" checked={settings.payment.displaySubscriptions} onChange={(checked) => setSettings((current) => ({ ...current, payment: { ...current.payment, displaySubscriptions: checked } }))} /><div className="settingsFormGrid"><SettingsNumber label="订单超时（分钟）" value={settings.payment.orderTimeoutMinutes} min={5} max={1440} onChange={(value) => setSettings((current) => ({ ...current, payment: { ...current.payment, orderTimeoutMinutes: value } }))} /><SettingsNumber label="最多待支付订单" value={settings.payment.maxPendingOrders} min={1} max={100} onChange={(value) => setSettings((current) => ({ ...current, payment: { ...current.payment, maxPendingOrders: value } }))} /><SettingsNumber label="最低购买积分" value={settings.payment.minPurchaseCredits} min={1} max={1000000} onChange={(value) => setSettings((current) => ({ ...current, payment: { ...current.payment, minPurchaseCredits: value } }))} /><SettingsNumber label="最高购买积分" value={settings.payment.maxPurchaseCredits} min={1} max={1000000} onChange={(value) => setSettings((current) => ({ ...current, payment: { ...current.payment, maxPurchaseCredits: value } }))} /><SettingsField label="充值说明"><textarea value={settings.payment.purchaseNotice} onChange={(event) => setSettings((current) => ({ ...current, payment: { ...current.payment, purchaseNotice: event.target.value } }))} /></SettingsField></div></AdminPanel> : null}

          {settingsTab === "email" ? <div className="pageStack"><AdminPanel title="SMTP 邮件"><SettingsToggle title="启用邮件服务" hint="密码加密保存，接口永不返回密文。" checked={settings.email.enabled} onChange={(checked) => setSettings((current) => ({ ...current, email: { ...current.email, enabled: checked } }))} /><div className="settingsFormGrid"><SettingsField label="SMTP 主机"><input value={settings.email.host} onChange={(event) => setSettings((current) => ({ ...current, email: { ...current.email, host: event.target.value } }))} /></SettingsField><SettingsNumber label="端口" value={settings.email.port} min={1} max={65535} onChange={(value) => setSettings((current) => ({ ...current, email: { ...current.email, port: value } }))} /><SettingsField label="用户名"><input value={settings.email.username} onChange={(event) => setSettings((current) => ({ ...current, email: { ...current.email, username: event.target.value } }))} /></SettingsField><SettingsField label="密码" hint={settings.email.passwordConfigured ? "已配置；留空保持原值" : "尚未配置"}><input type="password" value={emailPassword} onChange={(event) => setEmailPassword(event.target.value)} /></SettingsField><SettingsField label="发件邮箱"><input type="email" value={settings.email.fromEmail} onChange={(event) => setSettings((current) => ({ ...current, email: { ...current.email, fromEmail: event.target.value } }))} /></SettingsField><SettingsField label="发件名称"><input value={settings.email.fromName} onChange={(event) => setSettings((current) => ({ ...current, email: { ...current.email, fromName: event.target.value } }))} /></SettingsField></div><SettingsToggle title="SSL/TLS 直连" hint="465 端口通常开启，587 通常关闭并使用 STARTTLS。" checked={settings.email.secure} onChange={(checked) => setSettings((current) => ({ ...current, email: { ...current.email, secure: checked } }))} /><div className="inlineFields"><input type="email" placeholder="测试收件邮箱（留空仅测试连接）" value={testEmailRecipient} onChange={(event) => setTestEmailRecipient(event.target.value)} /><button className="secondaryButton" disabled={actionKey === "email-test"} onClick={() => void testEmail()} type="button">{actionKey === "email-test" ? "测试中" : "测试 SMTP"}</button></div></AdminPanel><AdminPanel title="邮箱验证模板"><div className="settingsLegalEditor"><SettingsField label="邮件主题"><input value={settings.email.verificationSubject} onChange={(event) => setSettings((current) => ({ ...current, email: { ...current.email, verificationSubject: event.target.value } }))} /></SettingsField><SettingsField label="纯文本正文" hint="可用变量：{{name}}、{{hours}}、{{url}}、{{purpose}}"><textarea rows={8} value={settings.email.verificationBody} onChange={(event) => setSettings((current) => ({ ...current, email: { ...current.email, verificationBody: event.target.value } }))} /></SettingsField></div></AdminPanel><AdminPanel title="密码重置模板"><div className="settingsLegalEditor"><SettingsField label="邮件主题"><input value={settings.email.passwordResetSubject} onChange={(event) => setSettings((current) => ({ ...current, email: { ...current.email, passwordResetSubject: event.target.value } }))} /></SettingsField><SettingsField label="纯文本正文" hint="可用变量：{{name}}、{{hours}}、{{url}}、{{purpose}}"><textarea rows={8} value={settings.email.passwordResetBody} onChange={(event) => setSettings((current) => ({ ...current, email: { ...current.email, passwordResetBody: event.target.value } }))} /></SettingsField></div></AdminPanel></div> : null}

          {settingsTab === "backup" ? <AdminPanel title="数据库备份"><div className="settingsFormGrid"><SettingsNumber label="保留备份数量" value={settings.backup.retentionCount} min={1} max={100} onChange={(value) => setSettings((current) => ({ ...current, backup: { ...current.backup, retentionCount: value } }))} /><SettingsNumber label="自动备份间隔（小时）" value={settings.backup.intervalHours} min={1} max={720} onChange={(value) => setSettings((current) => ({ ...current, backup: { ...current.backup, intervalHours: value } }))} /></div><SettingsToggle title="启用运行时自动备份" hint="服务进程运行期间按间隔执行；部署平台仍建议配置外部定时唤醒。" checked={settings.backup.scheduleEnabled} onChange={(checked) => setSettings((current) => ({ ...current, backup: { ...current.backup, scheduleEnabled: checked } }))} /><button className="primaryButton" disabled={actionKey.startsWith("backup-")} onClick={() => void backupAction("create")} type="button">立即创建备份</button><div className="tableList">{backups.map((backup) => <div className="tableRow" key={backup.id}><div><strong>{backup.filename}</strong><span>{backup.status} · {formatBytes(backup.size_bytes)} · {backup.row_count} 行 · {formatDate(backup.created_at)}</span></div><div className="rowActions">{backup.status === "ready" ? <a className="secondaryButton" href={apiPath(`/api/admin/backups/${backup.id}/download`)}>下载</a> : null}<button className="secondaryButton" onClick={() => requestConfirm({ title: "恢复这个数据库备份？", description: "当前业务数据将被备份内容替换，系统会先自动创建恢复前快照。", confirmLabel: "确认恢复", danger: true, requireText: "恢复数据库", onConfirm: () => backupAction("restore", backup.id) })} type="button">恢复</button><button className="secondaryButton" onClick={() => requestConfirm({ title: "删除备份？", description: backup.filename, confirmLabel: "删除", danger: true, onConfirm: () => backupAction("delete", backup.id) })} type="button">删除</button></div></div>)}{backups.length === 0 ? <AdminEmptyState title="暂无备份" description="创建第一个业务数据快照。" /> : null}</div></AdminPanel> : null}

          {settingsTab === "features" ? <AdminPanel title="邀请人专属返利"><p className="subtleText">留空使用全局比例；同一邀请人的设置会应用到其全部邀请关系。</p><div className="tableList">{affiliateRecords.filter((record, index, records) => records.findIndex((item) => item.inviter_id === record.inviter_id) === index).map((record) => <div className="settingsNavEditor affiliateRateEditor" key={record.inviter_id}><div><strong>{record.inviter_email}</strong><span>{record.referral_code}</span></div><input aria-label="专属返利比例" max="100" min="0" placeholder={`${settings.affiliate.rebateRatePercent}%`} step="0.01" type="number" value={record.custom_rebate_rate_percent ?? ""} onChange={(event) => setAffiliateRecords((current) => current.map((item) => item.inviter_id === record.inviter_id ? { ...item, custom_rebate_rate_percent: event.target.value === "" ? null : Number(event.target.value) } : item))} /><button className="secondaryButton" onClick={() => void saveAffiliateRate(record.inviter_id, record.custom_rebate_rate_percent)} type="button">保存比例</button></div>)}{affiliateRecords.length === 0 ? <AdminEmptyState title="暂无邀请人" description="产生邀请关系后可设置专属返利比例。" /> : null}</div></AdminPanel> : null}

          {settingsTab === "security" ? <AdminPanel title="身份验证器"><SettingsToggle title="允许用户启用 TOTP 二次验证" hint="启用后，用户可在账号中心绑定身份验证器；已绑定用户登录时必须输入验证码。" checked={settings.auth.totpEnabled} onChange={(checked) => setSettings((current) => ({ ...current, auth: { ...current.auth, totpEnabled: checked } }))} /><SettingsField label="验证器发行方名称"><input value={settings.auth.totpIssuer} onChange={(event) => setSettings((current) => ({ ...current, auth: { ...current.auth, totpIssuer: event.target.value } }))} /></SettingsField></AdminPanel> : null}

          {settingsTab === "defaults" ? <AdminPanel title="创作频率与并发"><div className="settingsFormGrid"><SettingsNumber label="每月创作次数（0=不限）" value={settings.defaults.monthlyCreationLimit} min={0} max={100000} onChange={(value) => setSettings((current) => ({ ...current, defaults: { ...current.defaults, monthlyCreationLimit: value } }))} /><SettingsNumber label="最大并发创作" value={settings.defaults.maxConcurrentCreations} min={1} max={20} onChange={(value) => setSettings((current) => ({ ...current, defaults: { ...current.defaults, maxConcurrentCreations: value } }))} /><SettingsNumber label="每分钟创作请求" value={settings.defaults.creationRpmLimit} min={1} max={1000} onChange={(value) => setSettings((current) => ({ ...current, defaults: { ...current.defaults, creationRpmLimit: value } }))} /></div></AdminPanel> : null}

          {settingsTab === "runtime" ? <div className="pageStack"><AdminPanel title="模型调用策略"><div className="settingsFormGrid"><SettingsNumber label="请求超时（秒）" value={settings.runtime.requestTimeoutSeconds} min={5} max={900} onChange={(value) => setSettings((current) => ({ ...current, runtime: { ...current.runtime, requestTimeoutSeconds: value } }))} /><SettingsNumber label="熔断失败阈值" value={settings.runtime.circuitFailureThreshold} min={1} max={100} onChange={(value) => setSettings((current) => ({ ...current, runtime: { ...current.runtime, circuitFailureThreshold: value } }))} /><SettingsNumber label="熔断冷却（秒）" value={settings.runtime.circuitCooldownSeconds} min={10} max={86400} onChange={(value) => setSettings((current) => ({ ...current, runtime: { ...current.runtime, circuitCooldownSeconds: value } }))} /></div><SettingsToggle title="启用主模型熔断" hint="连续失败达到阈值后，在冷却期内停止请求主模型。" checked={settings.runtime.circuitBreakerEnabled} onChange={(checked) => setSettings((current) => ({ ...current, runtime: { ...current.runtime, circuitBreakerEnabled: checked } }))} /><SettingsToggle title="启用备用模型" hint="主模型失败或熔断时，使用 OpenAI-compatible 备用服务。" checked={settings.runtime.modelFallbackEnabled} onChange={(checked) => setSettings((current) => ({ ...current, runtime: { ...current.runtime, modelFallbackEnabled: checked } }))} />{settings.runtime.modelFallbackEnabled ? <div className="settingsFormGrid"><SettingsField label="备用服务地址"><input value={settings.runtime.fallbackBaseUrl} onChange={(event) => setSettings((current) => ({ ...current, runtime: { ...current.runtime, fallbackBaseUrl: event.target.value } }))} /></SettingsField><SettingsField label="备用模型"><input value={settings.runtime.fallbackModel} onChange={(event) => setSettings((current) => ({ ...current, runtime: { ...current.runtime, fallbackModel: event.target.value } }))} /></SettingsField><SettingsField label="备用 API Key" hint={settings.runtime.fallbackApiKeyConfigured ? "已配置；留空保持原值" : "尚未配置"}><input type="password" value={fallbackApiKey} onChange={(event) => setFallbackApiKey(event.target.value)} /></SettingsField></div> : null}</AdminPanel><AdminPanel title="最近模型事件"><div className="panelHeaderActions"><button className="secondaryButton" onClick={() => void refreshServiceHealth()} type="button">刷新</button></div>{modelRuntime ? <div className="tableList">{modelRuntime.events.map((event) => <div className="tableRow" key={event.id}><div><strong>{event.provider} · {event.model || "默认模型"}</strong><span>{event.outcome} · {event.latency_ms} ms · {formatDate(event.created_at)}</span>{event.error_message ? <small>{event.error_message}</small> : null}</div><AdminStatus value={event.outcome === "success" || event.outcome === "fallback" ? "active" : "failed"} /></div>)}{modelRuntime.events.length === 0 ? <AdminEmptyState title="暂无运行事件" description="模型调用后将在这里记录结果。" /> : null}</div> : <AdminEmptyState title="尚未加载" description="点击刷新读取模型运行状态。" />}</AdminPanel></div> : null}

          {settingsTab === "payment" ? <div className="pageStack"><AdminPanel title="支付金额与手续费"><div className="settingsFormGrid"><MoneySettingsField label="最低支付金额" cents={settings.payment.minOrderAmountCents} onChange={(value) => setSettings((current) => ({ ...current, payment: { ...current.payment, minOrderAmountCents: value } }))} /><MoneySettingsField label="最高支付金额（0=不限）" cents={settings.payment.maxOrderAmountCents} onChange={(value) => setSettings((current) => ({ ...current, payment: { ...current.payment, maxOrderAmountCents: value } }))} /><MoneySettingsField label="每日成功支付上限（0=不限）" cents={settings.payment.dailyPaidAmountLimitCents} onChange={(value) => setSettings((current) => ({ ...current, payment: { ...current.payment, dailyPaidAmountLimitCents: value } }))} /><SettingsField label="手续费率（%）" hint="优惠后金额乘以费率，按分向上取整。"><input max="100" min="0" step="0.01" type="number" value={settings.payment.feeRatePercent} onChange={(event) => setSettings((current) => ({ ...current, payment: { ...current.payment, feeRatePercent: Number(event.target.value) } }))} /></SettingsField><SettingsField label="支付商品名称"><input value={settings.payment.productName} onChange={(event) => setSettings((current) => ({ ...current, payment: { ...current.payment, productName: event.target.value } }))} /></SettingsField><SettingsField label="支付帮助图片"><input value={settings.payment.helpImageUrl} onChange={(event) => setSettings((current) => ({ ...current, payment: { ...current.payment, helpImageUrl: event.target.value } }))} /></SettingsField></div></AdminPanel><AdminPanel title="低余额通知"><SettingsToggle title="启用低余额邮件" hint="用户消耗积分后达到阈值时发送，冷却期内不重复提醒。" checked={settings.payment.lowBalanceNotifyEnabled} onChange={(checked) => setSettings((current) => ({ ...current, payment: { ...current.payment, lowBalanceNotifyEnabled: checked } }))} /><div className="settingsFormGrid"><SettingsNumber label="提醒阈值（点）" value={settings.payment.lowBalanceThreshold} min={0} max={1000000} onChange={(value) => setSettings((current) => ({ ...current, payment: { ...current.payment, lowBalanceThreshold: value } }))} /><SettingsNumber label="提醒冷却（小时）" value={settings.payment.lowBalanceCooldownHours} min={1} max={720} onChange={(value) => setSettings((current) => ({ ...current, payment: { ...current.payment, lowBalanceCooldownHours: value } }))} /></div></AdminPanel></div> : null}

          {settingsTab === "email" ? <div className="pageStack"><AdminPanel title="低余额通知模板"><div className="settingsLegalEditor"><SettingsField label="邮件主题"><input value={settings.email.lowBalanceSubject} onChange={(event) => setSettings((current) => ({ ...current, email: { ...current.email, lowBalanceSubject: event.target.value } }))} /></SettingsField><SettingsField label="纯文本正文" hint="可用变量：{{name}}、{{balance}}、{{threshold}}、{{url}}"><textarea rows={8} value={settings.email.lowBalanceBody} onChange={(event) => setSettings((current) => ({ ...current, email: { ...current.email, lowBalanceBody: event.target.value } }))} /></SettingsField></div></AdminPanel><AdminPanel title="积分变动通知模板"><div className="settingsLegalEditor"><SettingsField label="邮件主题"><input value={settings.email.creditChangeSubject} onChange={(event) => setSettings((current) => ({ ...current, email: { ...current.email, creditChangeSubject: event.target.value } }))} /></SettingsField><SettingsField label="纯文本正文" hint="可用变量：{{name}}、{{changeLabel}}、{{delta}}、{{balance}}、{{orderId}}、{{url}}"><textarea rows={8} value={settings.email.creditChangeBody} onChange={(event) => setSettings((current) => ({ ...current, email: { ...current.email, creditChangeBody: event.target.value } }))} /></SettingsField></div></AdminPanel></div> : null}

          {settingsTab === "backup" ? <div className="pageStack"><AdminPanel title="Cron 与保留策略"><div className="settingsFormGrid"><SettingsField label="Cron 表达式" hint="按北京时间执行，例如每天 02:00：0 2 * * *"><input value={settings.backup.cronExpression} onChange={(event) => setSettings((current) => ({ ...current, backup: { ...current.backup, cronExpression: event.target.value } }))} /></SettingsField><SettingsNumber label="保留天数（0=永久）" value={settings.backup.retentionDays} min={0} max={3650} onChange={(value) => setSettings((current) => ({ ...current, backup: { ...current.backup, retentionDays: value } }))} /></div></AdminPanel><AdminPanel title="S3 / Cloudflare R2"><SettingsToggle title="同步远端备份" hint="本地备份完成后上传；恢复时本地缺失会自动下载。" checked={settings.backup.s3Enabled} onChange={(checked) => setSettings((current) => ({ ...current, backup: { ...current.backup, s3Enabled: checked } }))} />{settings.backup.s3Enabled ? <div className="settingsFormGrid"><SettingsField label="Endpoint"><input value={settings.backup.s3Endpoint} onChange={(event) => setSettings((current) => ({ ...current, backup: { ...current.backup, s3Endpoint: event.target.value } }))} /></SettingsField><SettingsField label="Region"><input value={settings.backup.s3Region} onChange={(event) => setSettings((current) => ({ ...current, backup: { ...current.backup, s3Region: event.target.value } }))} /></SettingsField><SettingsField label="Bucket"><input value={settings.backup.s3Bucket} onChange={(event) => setSettings((current) => ({ ...current, backup: { ...current.backup, s3Bucket: event.target.value } }))} /></SettingsField><SettingsField label="Prefix"><input value={settings.backup.s3Prefix} onChange={(event) => setSettings((current) => ({ ...current, backup: { ...current.backup, s3Prefix: event.target.value } }))} /></SettingsField><SettingsField label="Access Key ID"><input value={settings.backup.s3AccessKeyId} onChange={(event) => setSettings((current) => ({ ...current, backup: { ...current.backup, s3AccessKeyId: event.target.value } }))} /></SettingsField><SettingsField label="Secret Access Key" hint={settings.backup.s3SecretConfigured ? "已配置；留空保持原值" : "尚未配置"}><input type="password" value={s3Secret} onChange={(event) => setS3Secret(event.target.value)} /></SettingsField><SettingsToggle title="强制 Path Style" hint="MinIO 等兼容服务通常需要开启。" checked={settings.backup.s3ForcePathStyle} onChange={(checked) => setSettings((current) => ({ ...current, backup: { ...current.backup, s3ForcePathStyle: checked } }))} /></div> : null}<button className="secondaryButton" disabled={!settings.backup.s3Enabled || actionKey === "backup-test_s3"} onClick={() => void backupAction("test_s3")} type="button">测试远端连接</button></AdminPanel><AdminPanel title="备份副本状态"><div className="tableList">{backups.map((backup) => <div className="tableRow" key={`remote-${backup.id}`}><div><strong>{backup.filename}</strong><span>{backup.trigger_type} · 本地 {backup.status} · 远端 {backup.remote_status}{backup.expires_at ? ` · 到期 ${formatDate(backup.expires_at)}` : ""}</span></div><AdminStatus value={backup.remote_status === "failed" ? "failed" : "active"} /></div>)}</div></AdminPanel></div> : null}
          </div>

          {settingsDirty ? <div className="adminUnsavedBar"><span>你有尚未保存的配置修改</span><div className="rowActions"><button className="secondaryButton" onClick={() => { setSettings(settingsBaseline); setTurnstileSecret(""); setEmailPassword(""); setS3Secret(""); setFallbackApiKey(""); }} type="button">撤销修改</button><button className="primaryButton" onClick={requestSaveSettings} type="button">保存全部配置</button></div></div> : null}
        </div>
      ) : null}
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="panel metric adminMetricCard">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function TrendMetric({ label, value, current, previous }: { label: string; value: string | number; current: number; previous: number }) {
  const trend = current === previous
    ? "与昨日持平"
    : previous === 0
      ? current > 0 ? "今日新增" : "较昨日下降"
      : `${current > previous ? "+" : ""}${Math.round(((current - previous) / previous) * 100)}% 较昨日`;
  return (
    <div className="panel metric adminMetricCard">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{trend}</small>
    </div>
  );
}

function AffiliateStatsStrip({ stats }: { stats: AffiliateStats }) {
  return <div className="affiliateMetrics adminAffiliateStats" aria-label="邀请返利漏斗"><div><span>链接访问</span><strong>{stats.visits}</strong></div><div><span>注册用户</span><strong>{stats.invitees}</strong></div><div><span>付费用户</span><strong>{stats.payers}</strong></div><div><span>累计返利</span><strong>{stats.accruedCredits} 点</strong></div></div>;
}

function AdminPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="panel adminPanelCard">
      <div className="panelHeader">
        <h2>{title}</h2>
      </div>
      <div className="sideBody">{children}</div>
    </section>
  );
}

function CreatorStatus({ value }: { value: string }) {
  const labels: Record<string, { label: string; title: string }> = {
    active: { label: "重点跟踪", title: "纳入日常监测与运营处理" },
    paused: { label: "暂停跟踪", title: "保留作者记录，暂不进入日常处理队列" },
    excluded: { label: "已排除", title: "不再进入候选队列，历史数据仍会保留" },
  };
  const status = labels[value] ?? { label: value, title: value };
  return <span className={`adminStatus ${value}`} title={status.title}>{status.label}</span>;
}

function PaymentSettingsSwitches({ settings, setSettings }: { settings: Settings; setSettings: React.Dispatch<React.SetStateAction<Settings>> }) {
  return <AdminPanel title="支付方式开关"><SettingsToggle title="启用 Airwallex" hint="需先配置对应服务商实例。" checked={settings.payment.enableAirwallex} onChange={(checked) => setSettings((current) => ({ ...current, payment: { ...current.payment, enableAirwallex: checked } }))} /><SettingsToggle title="启用支付宝" hint="需配置支付宝官方或 EasyPay 实例。" checked={settings.payment.enableAlipay} onChange={(checked) => setSettings((current) => ({ ...current, payment: { ...current.payment, enableAlipay: checked } }))} /><SettingsToggle title="启用微信支付" hint="需配置微信支付官方或 EasyPay 实例。" checked={settings.payment.enableWechat} onChange={(checked) => setSettings((current) => ({ ...current, payment: { ...current.payment, enableWechat: checked } }))} /><SettingsToggle title="启用手工转账" hint="手工订单必须经管理员审核后发放积分。" checked={settings.payment.enableManualTransfer} onChange={(checked) => setSettings((current) => ({ ...current, payment: { ...current.payment, enableManualTransfer: checked } }))} /></AdminPanel>;
}

function PaymentCancellationPanel({ settings, setSettings }: { settings: Settings; setSettings: React.Dispatch<React.SetStateAction<Settings>> }) {
  return <AdminPanel title="取消频率限制"><SettingsToggle title="启用取消限制" hint="防止用户频繁创建并取消订单。" checked={settings.payment.cancelRateLimitEnabled} onChange={(checked) => setSettings((current) => ({ ...current, payment: { ...current.payment, cancelRateLimitEnabled: checked } }))} /><div className="settingsFormGrid"><SettingsNumber label="窗口时长（分钟）" value={settings.payment.cancelRateLimitWindowMinutes} min={1} max={10080} onChange={(value) => setSettings((current) => ({ ...current, payment: { ...current.payment, cancelRateLimitWindowMinutes: value } }))} /><SettingsNumber label="窗口内最大取消次数" value={settings.payment.cancelRateLimitMax} min={1} max={1000} onChange={(value) => setSettings((current) => ({ ...current, payment: { ...current.payment, cancelRateLimitMax: value } }))} /></div></AdminPanel>;
}

function PaymentProviderPanel({
  providers,
  form,
  setForm,
  onSave,
  onDelete,
}: {
  providers: PaymentProvider[];
  form: PaymentProviderForm;
  setForm: React.Dispatch<React.SetStateAction<PaymentProviderForm>>;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  onDelete: (id: string) => Promise<void>;
}) {
  return <AdminPanel title="支付服务商实例"><form className="settingsFormGrid" onSubmit={onSave}><SettingsField label="服务商名称"><input required value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="例如 Stripe 主账号" /></SettingsField><SettingsField label="类型"><select value={form.providerKey} onChange={(event) => setForm((current) => ({ ...current, providerKey: event.target.value as PaymentProvider["providerKey"] }))}><option value="stripe">Stripe</option><option value="airwallex">Airwallex</option><option value="easypay">EasyPay</option><option value="alipay">支付宝官方</option><option value="wxpay">微信支付官方</option></select></SettingsField><SettingsField label="前台支付方式" hint="多个值用逗号分隔，例如 card,alipay"><input value={form.supportedMethods} onChange={(event) => setForm((current) => ({ ...current, supportedMethods: event.target.value }))} /></SettingsField><SettingsField label="Secret Key"><input type="password" value={form.secretKey} onChange={(event) => setForm((current) => ({ ...current, secretKey: event.target.value }))} /></SettingsField><SettingsField label="Publishable Key"><input value={form.publishableKey} onChange={(event) => setForm((current) => ({ ...current, publishableKey: event.target.value }))} /></SettingsField><SettingsField label="Webhook Secret"><input type="password" value={form.webhookSecret} onChange={(event) => setForm((current) => ({ ...current, webhookSecret: event.target.value }))} /></SettingsField><SettingsToggle title="启用此实例" hint="启用后仍需开启对应支付渠道。" checked={form.enabled} onChange={(checked) => setForm((current) => ({ ...current, enabled: checked }))} /><div className="rowActions"><button className="primaryButton" type="submit">保存服务商</button>{form.id ? <button className="secondaryButton" type="button" onClick={() => setForm({ id: "", name: "", providerKey: "stripe", enabled: false, sortOrder: 0, supportedMethods: "card", secretKey: "", publishableKey: "", webhookSecret: "", currency: "CNY" })}>取消编辑</button> : null}</div></form><div className="tableList">{providers.map((provider) => <div className="tableRow" key={provider.id}><div><strong>{provider.name}</strong><span>{provider.providerKey} · {provider.supportedMethods.join(", ")} · {provider.enabled ? "已启用" : "已停用"}</span></div><div className="rowActions"><button className="secondaryButton" type="button" onClick={() => setForm({ id: provider.id, name: provider.name, providerKey: provider.providerKey, enabled: provider.enabled, sortOrder: provider.sortOrder, supportedMethods: provider.supportedMethods.join(","), secretKey: "", publishableKey: "", webhookSecret: "", currency: "CNY" })}>编辑</button><button className="secondaryButton" type="button" onClick={() => void onDelete(provider.id)}>删除</button></div></div>)}{providers.length === 0 ? <AdminEmptyState title="暂无服务商实例" description="配置第一个 Stripe、Airwallex、EasyPay、支付宝或微信支付实例。" /> : null}</div></AdminPanel>;
}

function SettingsField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="settingsField"><span>{label}</span>{children}{hint ? <small>{hint}</small> : null}</label>;
}

function SettingsToggle({ title, hint, checked, onChange }: { title: string; hint: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="settingsToggleRow"><span><strong>{title}</strong><small>{hint}</small></span><input checked={checked} type="checkbox" onChange={(event) => onChange(event.target.checked)} /></label>;
}

function SettingsNumber({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return <SettingsField label={label}><input type="number" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} /></SettingsField>;
}

function MoneySettingsField({ label, cents, onChange }: { label: string; cents: number; onChange: (value: number) => void }) {
  return <SettingsField label={label}><input min="0" step="0.01" type="number" value={(cents / 100).toFixed(2)} onChange={(event) => onChange(Math.max(0, Math.round(Number(event.target.value) * 100)))} /></SettingsField>;
}

function moveItem<T>(items: T[], from: number, to: number) {
  const next = [...items];
  const [item] = next.splice(from, 1);
  if (item !== undefined) next.splice(to, 0, item);
  return next;
}

function Row({ title, meta, href }: { title: string; meta: string; href?: string }) {
  const content = (
    <>
      <strong>{title}</strong>
      <p>{meta}</p>
    </>
  );

  if (href) {
    return <a className="adminInfoRow adminInfoRowLink" href={href}>{content}</a>;
  }

  return <div className="adminInfoRow">{content}</div>;
}

function adminWorkHref(workId: string) {
  return apiPath(`/works/${workId}?from=admin&admin=1`);
}

function formatMoney(amountCents: number, currency: string) {
  return `${currency === "CNY" ? "¥" : "$"}${(amountCents / 100).toFixed(0)}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatCreatorCount(value: number | null) {
  if (value === null || !Number.isFinite(value) || value <= 0) return "未获取";
  if (value >= 10_000) return `${(value / 10_000).toFixed(value >= 100_000 ? 0 : 1)} 万`;
  return value.toLocaleString("zh-CN");
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function adminActionLabel(action: string) {
  return ({
    "settings.update": "更新系统设置",
    "user.update": "更新用户",
    "user.grant_credits": "赠送积分",
    "order.mark_paid": "标记订单已支付",
    "order.refund": "订单退款",
    "order.update_status": "更新订单状态",
    "app.update": "更新创作应用",
    "run.terminate": "终止创作任务",
  } as Record<string, string>)[action] ?? action;
}

function affiliateActionLabel(action: string) {
  return ({ accrue: "返利计提", transfer: "转入余额", reverse: "退款冲回" } as Record<string, string>)[action] ?? action;
}

function riskLabel(value: string) {
  const labels: Record<string, string> = {
    high: "高风险",
    medium: "中风险",
    low: "低风险",
    safe: "安全",
    unchecked: "未检查",
  };
  return labels[value] ?? value;
}
