"use client";

import { FormEvent, useEffect, useState } from "react";
import { adminMenuItems, getAdminSection, type AdminSectionId } from "@/lib/admin/navigation";
import { apiPath } from "@/lib/client/url";

type Summary = {
  users: number;
  activeUsers: number;
  conversations: number;
  drafts: number;
  orders: number;
  paidUsers: number;
  paidAmountCents: number;
  todayRevenueCents: number;
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

type Settings = {
  site: {
    siteName: string;
    siteSubtitle: string;
    supportContact: string;
    footerNote: string;
  };
  auth: {
    allowRegistration: boolean;
    requireInviteCode: boolean;
    passwordHint: string;
  };
  payment: {
    enableStripe: boolean;
    enableManualTransfer: boolean;
    displaySubscriptions: boolean;
    purchaseNotice: string;
  };
};

const defaultSettings: Settings = {
  site: {
    siteName: "小谷",
    siteSubtitle: "保险内容增长助手",
    supportContact: "support@xiaogu.ai",
    footerNote: "让保险内容生产更稳定、更易运营。",
  },
  auth: {
    allowRegistration: true,
    requireInviteCode: false,
    passwordHint: "至少 8 位密码",
  },
  payment: {
    enableStripe: true,
    enableManualTransfer: false,
    displaySubscriptions: true,
    purchaseNotice: "充值成功后额度会自动到账，可在账单页查看明细。",
  },
};

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
  const [plans, setPlans] = useState<Plan[]>([]);
  const [planForm, setPlanForm] = useState<Plan>({ code: "", name: "", quotaAmount: 100, amountCents: 9900, currency: "CNY", description: "", recommended: false, status: "active", sortOrder: 0 });
  const [selectedUserDetail, setSelectedUserDetail] = useState<AdminUserDetail | null>(null);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [tab, setTab] = useState<AdminSectionId>("overview");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [orderStatusFilter, setOrderStatusFilter] = useState("all");
  const [orderSearch, setOrderSearch] = useState("");
  const [appStatusFilter, setAppStatusFilter] = useState("all");
  const [feedbackStatusFilter, setFeedbackStatusFilter] = useState("all");
  const [auditSearch, setAuditSearch] = useState("");
  const [grantAmount, setGrantAmount] = useState(100);
  const [loading, setLoading] = useState(true);
  const [feedbackReplies, setFeedbackReplies] = useState<Record<string, string>>({});

  useEffect(() => {
    function syncTab() {
      setTab(getAdminSection(window.location.hash));
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

  async function loadAll(signal?: AbortSignal) {
    setLoading(true);
    setError("");
    try {
    const [summaryResponse, usersResponse, ordersResponse, appsResponse, feedbackResponse, auditResponse, promoResponse, announcementsResponse, contentResponse, settingsResponse, plansResponse] = await Promise.all([
      fetch(apiPath("/api/admin/summary"), { signal }),
      fetch(apiPath("/api/admin/users"), { signal }),
      fetch(apiPath("/api/admin/orders"), { signal }),
      fetch(apiPath("/api/admin/apps"), { signal }),
      fetch(apiPath("/api/admin/feedback"), { signal }),
      fetch(apiPath("/api/admin/audit-logs"), { signal }),
      fetch(apiPath("/api/admin/promo-codes"), { signal }),
      fetch(apiPath("/api/admin/announcements"), { signal }),
      fetch(apiPath("/api/admin/content"), { signal }),
      fetch(apiPath("/api/admin/settings"), { signal }),
      fetch(apiPath("/api/admin/billing-plans"), { signal }),
    ]);

    const summaryPayload = (await summaryResponse.json()) as { summary?: Summary; error?: string };
    const usersPayload = (await usersResponse.json()) as { users?: AdminUser[]; error?: string };
    const ordersPayload = (await ordersResponse.json()) as { orders?: AdminOrderDetail[]; error?: string };
    const appsPayload = (await appsResponse.json()) as { apps?: AdminCreationApp[]; error?: string };
    const feedbackPayload = (await feedbackResponse.json()) as { tickets?: FeedbackTicket[]; error?: string };
    const auditPayload = (await auditResponse.json()) as { logs?: AuditLog[]; error?: string };
    const promoPayload = (await promoResponse.json()) as { promoCodes?: PromoCode[]; error?: string };
    const announcementPayload = (await announcementsResponse.json()) as { announcements?: Announcement[]; error?: string };
    const contentPayload = (await contentResponse.json()) as { content?: ContentOverview; error?: string };
    const settingsPayload = (await settingsResponse.json()) as { settings?: Settings; error?: string };
    const plansPayload = (await plansResponse.json()) as { plans?: Plan[] };

    if (!summaryResponse.ok || !usersResponse.ok || !ordersResponse.ok || !appsResponse.ok || !feedbackResponse.ok || !auditResponse.ok || !promoResponse.ok || !announcementsResponse.ok || !contentResponse.ok || !settingsResponse.ok || !plansResponse.ok) {
      setError(
        summaryPayload.error ??
          usersPayload.error ??
          ordersPayload.error ??
          appsPayload.error ??
          feedbackPayload.error ??
          auditPayload.error ??
          promoPayload.error ??
          announcementPayload.error ??
          contentPayload.error ??
          settingsPayload.error ??
          "后台数据加载失败",
      );
      return;
    }

    setSummary(summaryPayload.summary ?? null);
    setUsers(usersPayload.users ?? []);
    setOrders(ordersPayload.orders ?? []);
    setCreationApps(appsPayload.apps ?? []);
    setFeedbackTickets(feedbackPayload.tickets ?? []);
    setAuditLogs(auditPayload.logs ?? []);
    setPromoCodes(promoPayload.promoCodes ?? []);
    setAnnouncements(announcementPayload.announcements ?? []);
    setContentOverview(contentPayload.content ?? null);
    setSettings(settingsPayload.settings ?? defaultSettings);
    setPlans(plansPayload.plans ?? []);
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === "AbortError")) setError("后台数据加载失败，请检查网络或服务状态");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }

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
    await loadAll();
    setNotice("用户状态已更新。");
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
    await loadAll();
    setNotice(`已赠送 ${quotaAmount} 点。`);
  }

  async function updateOrder(orderId: string, status: string) {
    if ((status === "paid" || status === "refunded") && !window.confirm(status === "paid" ? "确认将这笔手工订单标记为已支付并发放额度？" : "确认执行退款并回收对应额度？此操作不可撤销。")) return;
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
    await loadAll();
    setNotice("订单状态已更新。");
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
    await loadAll();
    setNotice("创作应用已更新。");
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
    await loadAll();
    setNotice("公告状态已更新。");
  }

  async function deleteAnnouncement(id: string) {
    if (!window.confirm("确认删除这条公告？")) return;
    const response = await fetch(apiPath(`/api/admin/announcements?id=${encodeURIComponent(id)}`), { method: "DELETE" });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "公告删除失败");
      return;
    }
    await loadAll();
    setNotice("公告已删除。");
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
    await loadAll();
    setNotice("优惠码状态已更新。");
  }

  async function deletePromo(id: string) {
    if (!window.confirm("确认删除这个优惠码？已有兑换记录的优惠码可能无法删除，建议优先停用。")) return;
    const response = await fetch(apiPath(`/api/admin/promo-codes?id=${encodeURIComponent(id)}`), { method: "DELETE" });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "优惠码删除失败");
      return;
    }
    await loadAll();
    setNotice("优惠码已删除。");
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
    await loadAll();
    setNotice("反馈工单已更新。");
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
    await loadAll();
    setNotice("套餐已保存。");
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
    await loadAll();
    setNotice("公告已保存。");
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
    await loadAll();
    setNotice("优惠码已创建。");
  }

  async function saveSettings() {
    const response = await fetch(apiPath("/api/admin/settings"), {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(settings),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "配置保存失败");
      return;
    }
    setNotice("系统配置已保存。");
  }

  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadAll(controller.signal);
    return () => controller.abort();
  }, []);

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
  const filteredFeedbackTickets = feedbackTickets.filter((ticket) => feedbackStatusFilter === "all" || ticket.status === feedbackStatusFilter);
  const filteredAuditLogs = auditLogs.filter((log) => {
    const keyword = auditSearch.trim().toLowerCase();
    return !keyword || `${log.action} ${log.target_type} ${log.target_id} ${log.admin_email ?? ""}`.toLowerCase().includes(keyword);
  });

  return (
    <div className="adminConsole">
      <section className="adminMainSurface">
        <div className="adminHeaderBar">
          <div>
            <h1>{adminMenuItems.find((item) => item.id === tab)?.label ?? "管理后台"}</h1>
            <p>围绕用户、内容、订单、活动和系统配置开展日常运营。</p>
          </div>
          <div className="adminHeaderActions">
            <span>{summary?.activeUsers ?? 0} 活跃用户</span>
            <button className="secondaryButton" onClick={() => void loadAll()} disabled={loading}>{loading ? "刷新中" : "刷新"}</button>
          </div>
        </div>

      {error ? <div className="panel alertPanel">{error}</div> : null}
      {notice ? <div className="panel successPanel">{notice}</div> : null}

      {tab === "overview" ? (
        <>
          <div className="metricGrid adminMetrics">
            <Metric label="总用户" value={summary?.users ?? 0} />
            <Metric label="活跃用户" value={summary?.activeUsers ?? 0} />
            <Metric label="付费用户" value={summary?.paidUsers ?? 0} />
            <Metric label="今日收入" value={`¥${((summary?.todayRevenueCents ?? 0) / 100).toFixed(0)}`} />
            <Metric label="累计收入" value={`¥${((summary?.paidAmountCents ?? 0) / 100).toFixed(0)}`} />
            <Metric label="累计消耗" value={`${summary?.quotaConsumed ?? 0} 点`} />
          </div>

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
            <AdminPanel title="运营提示">
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
            <p>支持启停账号、切换角色和赠送额度，优先满足日常运营动作。</p>
          </div>
          <div className="inlineFields">
            <input value={userSearch} placeholder="搜索姓名、邮箱、角色、状态" onChange={(event) => setUserSearch(event.target.value)} />
            <input
              min="1"
              type="number"
              value={grantAmount}
              onChange={(event) => setGrantAmount(Math.max(Number(event.target.value), 1))}
              placeholder="赠送点数"
            />
          </div>
          <div className="tableList">
            {filteredUsers.map((user) => (
              <div className="tableRow" key={user.id}>
                <div>
                  <strong>{user.email}</strong>
                  <span>
                    {user.name} · {user.role} · {user.status} · 余额 {user.current_balance ?? 0} 点 · 已赠送 {user.gift_total ?? 0} 点
                  </span>
                </div>
                <div className="rowActions">
                  <button className="secondaryButton" onClick={() => void grantCredits(user.id, grantAmount)}>赠送 {grantAmount} 点</button>
                  <button className="secondaryButton" onClick={() => void loadUserDetail(user.id)}>详情</button>
                  <button className="secondaryButton" onClick={() => void updateUser(user.id, { status: user.status === "active" ? "suspended" : "active" })}>
                    {user.status === "active" ? "停用" : "恢复"}
                  </button>
                  <button className="secondaryButton" onClick={() => void updateUser(user.id, { role: user.role === "admin" ? "broker" : "admin" })}>
                    {user.role === "admin" ? "设为经纪人" : "设为管理员"}
                  </button>
                </div>
              </div>
            ))}
            {filteredUsers.length === 0 ? <div className="emptyState">没有匹配的用户。</div> : null}
          </div>
          {selectedUserDetail ? (
            <div className="panel sectionBlock">
              <div className="panelHeader">
                <h2>{selectedUserDetail.user.email}</h2>
                <p>{selectedUserDetail.user.name} · 余额 {selectedUserDetail.balance} 点 · 作品 {selectedUserDetail.totals.worksTotal} 份</p>
              </div>
              <div className="metricGrid adminMetrics">
                <Metric label="付费金额" value={`¥${(selectedUserDetail.totals.orderAmountCents / 100).toFixed(0)}`} />
                <Metric label="购买点数" value={selectedUserDetail.totals.quotaPurchased} />
                <Metric label="赠送点数" value={selectedUserDetail.totals.quotaGifted} />
                <Metric label="消耗点数" value={selectedUserDetail.totals.quotaConsumed} />
              </div>
              <div className="adminGrid">
                <AdminPanel title="最近订单">
                  {selectedUserDetail.orders.slice(0, 6).map((order) => (
                    <Row key={order.id} title={order.status} meta={`${order.quota_amount} 点 · ${formatMoney(order.amount_cents, order.currency)} · ${formatDate(order.created_at)}`} />
                  ))}
                </AdminPanel>
                <AdminPanel title="最近作品">
                  {selectedUserDetail.works.slice(0, 6).map((work) => (
                    <Row key={work.id} title={work.title} meta={`${work.platform} · ${work.status} · ${formatDate(work.updated_at)}`} />
                  ))}
                </AdminPanel>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {tab === "content" ? (
        <div className="pageStack">
          <div className="metricGrid adminMetrics">
            <Metric label="作品总数" value={contentOverview?.totals.worksTotal ?? 0} />
            <Metric label="已使用作品" value={contentOverview?.totals.worksUsed ?? 0} />
            <Metric label="收藏作品" value={contentOverview?.totals.worksFavorite ?? 0} />
            <Metric label="创作运行" value={contentOverview?.totals.appRunsTotal ?? 0} />
            <Metric label="失败运行" value={contentOverview?.totals.appRunsFailed ?? 0} />
            <Metric label="合规报告" value={contentOverview?.totals.complianceReportsTotal ?? 0} />
          </div>

          <div className="adminGrid">
            <AdminPanel title="最近作品">
              {(contentOverview?.recentWorks ?? []).map((work) => (
                <Row
                  key={work.id}
                  title={work.title}
                  meta={`${work.user_email ?? "未知用户"} · ${work.app_name ?? work.source_channel ?? "未知应用"} · ${work.status} · 合规 ${work.compliance_risk} · ${formatDate(work.updated_at)}`}
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
          </div>

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

          <AdminPanel title="创作应用管理">
            <div className="inlineFields">
              <select value={appStatusFilter} onChange={(event) => setAppStatusFilter(event.target.value)}>
                <option value="all">全部应用</option>
                <option value="active">已上架</option>
                <option value="inactive">已下架</option>
              </select>
            </div>
            <div className="tableList">
              {filteredCreationApps.map((app) => (
                <div className="tableRow" key={app.id}>
                  <div>
                    <strong>{app.emoji} {app.name}</strong>
                    <span>
                      {app.category_name ?? "未分类"} · {app.slug} · {app.points_cost} 点 · 运行 {app.run_count} 次 · {app.status}{app.featured ? " · 推荐" : ""}
                    </span>
                  </div>
                  <div className="rowActions">
                    <button className="secondaryButton" onClick={() => void updateCreationApp(app.id, { sortOrder: Math.max(app.sort_order - 1, 0) })}>上移</button>
                    <button className="secondaryButton" onClick={() => void updateCreationApp(app.id, { sortOrder: app.sort_order + 1 })}>下移</button>
                    <button className="secondaryButton" onClick={() => void updateCreationApp(app.id, { pointsCost: Math.max(app.points_cost - 1, 0) })}>-1 点</button>
                    <button className="secondaryButton" onClick={() => void updateCreationApp(app.id, { pointsCost: app.points_cost + 1 })}>+1 点</button>
                    <button className="secondaryButton" onClick={() => void updateCreationApp(app.id, { featured: !app.featured })}>
                      {app.featured ? "取消推荐" : "设为推荐"}
                    </button>
                    <button className="secondaryButton" onClick={() => void updateCreationApp(app.id, { status: app.status === "active" ? "inactive" : "active" })}>
                      {app.status === "active" ? "下架" : "上架"}
                    </button>
                  </div>
                </div>
              ))}
              {filteredCreationApps.length === 0 ? <div className="emptyState">暂无创作应用数据。</div> : null}
            </div>
          </AdminPanel>
        </div>
      ) : null}

      {tab === "commerce" ? (
        <div className="pageStack">
          <div className="adminGrid">
            <AdminPanel title="套餐管理">
              {plans.map((plan) => (
                <div className="tableRow" key={plan.code}>
                  <div><strong>{plan.name}{plan.recommended ? " · 推荐" : ""}</strong><span>{plan.quotaAmount} 点 · {formatMoney(plan.amountCents, plan.currency)} · {plan.status ?? "active"} · {plan.description}</span></div>
                  <button className="secondaryButton" onClick={() => setPlanForm(plan)}>编辑</button>
                </div>
              ))}
            </AdminPanel>
            <AdminPanel title="支付表现">
              <Metric label="订单总数" value={summary?.orders ?? 0} />
              <Metric label="付费用户" value={summary?.paidUsers ?? 0} />
            </AdminPanel>
          </div>

          <AdminPanel title="编辑套餐">
            <form className="stackForm" onSubmit={savePlan}>
              <div className="inlineFields">
                <input value={planForm.code} placeholder="套餐代码，如 pro_1200" onChange={(event) => setPlanForm((current) => ({ ...current, code: event.target.value }))} />
                <input value={planForm.name} placeholder="套餐名称" onChange={(event) => setPlanForm((current) => ({ ...current, name: event.target.value }))} />
              </div>
              <div className="inlineFields">
                <input type="number" value={planForm.quotaAmount} placeholder="点数" onChange={(event) => setPlanForm((current) => ({ ...current, quotaAmount: Number(event.target.value) }))} />
                <input type="number" value={planForm.amountCents} placeholder="价格，单位分" onChange={(event) => setPlanForm((current) => ({ ...current, amountCents: Number(event.target.value) }))} />
                <input type="number" value={planForm.sortOrder ?? 0} placeholder="排序" onChange={(event) => setPlanForm((current) => ({ ...current, sortOrder: Number(event.target.value) }))} />
              </div>
              <textarea value={planForm.description} placeholder="套餐说明" onChange={(event) => setPlanForm((current) => ({ ...current, description: event.target.value }))} />
              <div className="inlineFields">
                <select value={planForm.status ?? "active"} onChange={(event) => setPlanForm((current) => ({ ...current, status: event.target.value }))}>
                  <option value="active">上架</option>
                  <option value="inactive">下架</option>
                </select>
                <label className="checkboxRow">
                  <input checked={Boolean(planForm.recommended)} type="checkbox" onChange={(event) => setPlanForm((current) => ({ ...current, recommended: event.target.checked }))} />
                  推荐套餐
                </label>
              </div>
              <button className="primaryButton" type="submit">保存套餐</button>
            </form>
          </AdminPanel>

          <div className="adminGrid">
            <AdminPanel title="最近订单">
              {orders.slice(0, 8).map((order) => (
                <Row
                  key={order.id}
                  title={order.user_email}
                  meta={`${order.status} · ${formatMoney(order.amount_cents, order.currency)} · ${formatDate(order.created_at)}`}
                />
              ))}
            </AdminPanel>

            <AdminPanel title="创建优惠码">
              <form className="stackForm" onSubmit={savePromo}>
                <input value={promoForm.code} placeholder="优惠码" onChange={(event) => setPromoForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))} />
                <div className="inlineFields">
                  <select value={promoForm.rewardType} onChange={(event) => setPromoForm((current) => ({ ...current, rewardType: event.target.value }))}>
                    <option value="credit">赠送点数</option>
                    <option value="discount">折扣</option>
                  </select>
                  {promoForm.rewardType === "credit" ? <input
                    type="number"
                    min="1"
                    value={promoForm.creditAmount}
                    onChange={(event) => setPromoForm((current) => ({ ...current, creditAmount: Number(event.target.value) }))}
                    placeholder="赠送点数"
                  /> : <input type="number" min="1" max="100" value={promoForm.discountPercent} onChange={(event) => setPromoForm((current) => ({ ...current, discountPercent: Number(event.target.value) }))} placeholder="折扣百分比" />}
                  <input
                    type="number"
                    value={promoForm.maxRedemptions}
                    onChange={(event) => setPromoForm((current) => ({ ...current, maxRedemptions: Number(event.target.value) }))}
                    placeholder="可兑换次数"
                  />
                </div>
                <div className="inlineFields">
                  <label>开始时间<input type="datetime-local" value={promoForm.startsAt} onChange={(event) => setPromoForm((current) => ({ ...current, startsAt: event.target.value }))} /></label>
                  <label>结束时间<input type="datetime-local" value={promoForm.expiresAt} onChange={(event) => setPromoForm((current) => ({ ...current, expiresAt: event.target.value }))} /></label>
                </div>
                <textarea value={promoForm.notes} placeholder="备注" onChange={(event) => setPromoForm((current) => ({ ...current, notes: event.target.value }))} />
                <button className="primaryButton" type="submit">保存优惠码</button>
              </form>
            </AdminPanel>
          </div>

          <AdminPanel title="订单管理">
            <div className="inlineFields">
              <input value={orderSearch} onChange={(event) => setOrderSearch(event.target.value)} placeholder="搜索用户、订单号或支付渠道" />
              <select value={orderStatusFilter} onChange={(event) => setOrderStatusFilter(event.target.value)}>
                <option value="all">全部订单</option>
                <option value="pending">待支付</option>
                <option value="paid">已支付</option>
                <option value="failed">失败</option>
                <option value="refunded">已退款</option>
              </select>
            </div>
            <div className="tableList">
              {filteredOrders.map((order) => (
                <div className="tableRow" key={order.id}>
                  <div>
                    <strong>{order.user_email}</strong>
                    <span>
                      {order.user_name} · {order.provider} · {order.status} · {order.quota_amount} 点 · {formatMoney(order.amount_cents, order.currency)} · {formatDate(order.created_at)}
                    </span>
                  </div>
                  <div className="rowActions">
                    {order.status === "pending" && order.provider !== "stripe" ? (
                      <button className="secondaryButton" onClick={() => void updateOrder(order.id, "paid")}>标记已支付</button>
                    ) : null}
                    {order.status === "pending" ? (
                      <button className="secondaryButton" onClick={() => void updateOrder(order.id, "failed")}>标记失败</button>
                    ) : null}
                    {order.status === "paid" ? (
                      <button className="secondaryButton" onClick={() => void updateOrder(order.id, "refunded")}>标记退款</button>
                    ) : null}
                  </div>
                </div>
              ))}
              {filteredOrders.length === 0 ? <div className="emptyState">暂无订单数据。</div> : null}
            </div>
          </AdminPanel>

          <AdminPanel title="优惠码列表">
            <div className="tableList">
              {promoCodes.map((item) => (
                <div className="tableRow" key={item.id}>
                  <div>
                    <strong>{item.code}</strong>
                    <span>
                      {item.reward_type === "credit" ? `${item.credit_amount} 点` : `${item.discount_percent}% 折扣`} ·
                      已用 {item.redeemed_count}/{item.max_redemptions} · {item.status}
                    </span>
                  </div>
                  <div className="rowActions">
                    <span className={`statusPill ${item.status}`}>{item.status}</span>
                    <button className="secondaryButton" onClick={() => void updatePromoStatus(item.id, item.status === "active" ? "inactive" : "active")}>
                      {item.status === "active" ? "停用" : "启用"}
                    </button>
                    <button className="secondaryButton" onClick={() => void deletePromo(item.id)}>删除</button>
                  </div>
                </div>
              ))}
              {promoCodes.length === 0 ? <div className="emptyState">暂无优惠码。</div> : null}
            </div>
          </AdminPanel>
        </div>
      ) : null}

      {tab === "growth" ? (
        <div className="adminGrid">
          <AdminPanel title="发布公告">
            <form className="stackForm" onSubmit={saveAnnouncement}>
              <input value={announcementForm.title} placeholder="公告标题" onChange={(event) => setAnnouncementForm((current) => ({ ...current, title: event.target.value }))} />
              <textarea value={announcementForm.content} placeholder="公告内容" onChange={(event) => setAnnouncementForm((current) => ({ ...current, content: event.target.value }))} />
              <input value={announcementForm.linkUrl} placeholder="跳转链接（可选，需填写完整 https:// 地址）" onChange={(event) => setAnnouncementForm((current) => ({ ...current, linkUrl: event.target.value }))} />
              <div className="inlineFields">
                <select value={announcementForm.kind} onChange={(event) => setAnnouncementForm((current) => ({ ...current, kind: event.target.value }))}>
                  <option value="notice">通知</option>
                  <option value="campaign">活动</option>
                  <option value="update">更新</option>
                </select>
                <select value={announcementForm.placement} onChange={(event) => setAnnouncementForm((current) => ({ ...current, placement: event.target.value }))}>
                  <option value="global">全站</option>
                  <option value="dashboard">工作台</option>
                  <option value="billing">账单页</option>
                </select>
                <select value={announcementForm.status} onChange={(event) => setAnnouncementForm((current) => ({ ...current, status: event.target.value }))}>
                  <option value="draft">草稿</option>
                  <option value="published">立即发布</option>
                </select>
              </div>
              <label className="checkboxRow">
                <input
                  checked={announcementForm.isPinned}
                  type="checkbox"
                  onChange={(event) => setAnnouncementForm((current) => ({ ...current, isPinned: event.target.checked }))}
                />
                置顶公告
              </label>
              <button className="primaryButton" type="submit">{announcementForm.id ? "保存修改" : "保存公告"}</button>
              {announcementForm.id ? <button className="secondaryButton" type="button" onClick={() => setAnnouncementForm({ id: "", title: "", content: "", kind: "notice", placement: "global", status: "draft", isPinned: false, linkUrl: "" })}>取消编辑</button> : null}
            </form>
          </AdminPanel>

          <AdminPanel title="公告列表">
            <div className="tableList">
              {announcements.map((item) => (
                <div className="tableRow" key={item.id}>
                  <div>
                    <strong>{item.title}</strong>
                    <span>{item.kind} · {item.placement} · {item.status}{item.is_pinned ? " · 已置顶" : ""}</span>
                  </div>
                  <div className="rowActions">
                    <button className="secondaryButton" onClick={() => setAnnouncementForm({ id: item.id, title: item.title, content: item.content, kind: item.kind, placement: item.placement, status: item.status, isPinned: item.is_pinned, linkUrl: item.link_url ?? "" })}>编辑</button>
                    <button className="secondaryButton" onClick={() => void updateAnnouncementStatus(item.id, item.status === "published" ? "draft" : "published")}>
                      {item.status === "published" ? "下线" : "发布"}
                    </button>
                    <button className="secondaryButton" onClick={() => void deleteAnnouncement(item.id)}>删除</button>
                  </div>
                </div>
              ))}
              {announcements.length === 0 ? <div className="emptyState">暂无公告。</div> : null}
            </div>
          </AdminPanel>
        </div>
      ) : null}

      {tab === "support" ? (
        <div className="pageStack">
          <div className="adminGrid">
            <AdminPanel title="反馈工单">
              <div className="inlineFields"><select value={feedbackStatusFilter} onChange={(event) => setFeedbackStatusFilter(event.target.value)}><option value="all">全部状态</option><option value="open">待处理</option><option value="in_progress">处理中</option><option value="resolved">已解决</option><option value="closed">已关闭</option></select></div>
              <div className="tableList">
                {filteredFeedbackTickets.map((ticket) => (
                  <div className="tableRow" key={ticket.id}>
                    <div>
                      <strong>{ticket.title}</strong>
                      <span>
                        {ticket.user_email ?? "未知用户"} · {ticket.category} · {ticket.priority} · {ticket.status} · {formatDate(ticket.updated_at)} · {ticket.content}
                      </span>
                      {ticket.admin_reply ? <span>回复：{ticket.admin_reply}</span> : null}
                      <textarea value={feedbackReplies[ticket.id] ?? ticket.admin_reply ?? ""} onChange={(event) => setFeedbackReplies((current) => ({ ...current, [ticket.id]: event.target.value }))} placeholder="输入给用户的回复" />
                    </div>
                    <div className="rowActions">
                      <button className="secondaryButton" onClick={() => void updateFeedback(ticket.id, { status: "in_progress" })}>处理中</button>
                      <button className="secondaryButton" onClick={() => void updateFeedback(ticket.id, { status: "resolved", adminReply: feedbackReplies[ticket.id] || ticket.admin_reply || "已处理，感谢反馈。" })}>回复并解决</button>
                      <button className="secondaryButton" onClick={() => void updateFeedback(ticket.id, { status: ticket.status === "closed" ? "open" : "closed" })}>{ticket.status === "closed" ? "重新打开" : "关闭"}</button>
                      <button className="secondaryButton" onClick={() => void updateFeedback(ticket.id, { priority: ticket.priority === "high" ? "normal" : "high" })}>
                        {ticket.priority === "high" ? "降为普通" : "设为高优先级"}
                      </button>
                    </div>
                  </div>
                ))}
                {filteredFeedbackTickets.length === 0 ? <div className="emptyState">暂无匹配的反馈工单。</div> : null}
              </div>
            </AdminPanel>

            <AdminPanel title="处理概览">
              <Metric label="待处理" value={feedbackTickets.filter((item) => item.status === "open").length} />
              <Metric label="处理中" value={feedbackTickets.filter((item) => item.status === "in_progress").length} />
              <Metric label="已解决" value={feedbackTickets.filter((item) => item.status === "resolved").length} />
            </AdminPanel>
          </div>

          <AdminPanel title="管理员操作审计">
            <div className="inlineFields"><input value={auditSearch} onChange={(event) => setAuditSearch(event.target.value)} placeholder="搜索管理员、动作或目标" /></div>
            <div className="tableList">
              {filteredAuditLogs.map((log) => (
                <div className="tableRow" key={log.id}>
                  <div>
                    <strong>{log.action}</strong>
                    <span>
                      {log.admin_email ?? "未知管理员"} · {log.target_type} · {log.target_id || "-"} · {formatDate(log.created_at)}
                    </span>
                    {Object.keys(log.detail ?? {}).length ? <code>{JSON.stringify(log.detail)}</code> : null}
                  </div>
                  <div className="rowActions">
                    <span className="statusPill active">审计</span>
                  </div>
                </div>
              ))}
              {filteredAuditLogs.length === 0 ? <div className="emptyState">暂无匹配的审计日志。</div> : null}
            </div>
          </AdminPanel>
        </div>
      ) : null}

      {tab === "settings" ? (
        <div className="adminGrid">
          <AdminPanel title="站点基础设置">
            <div className="stackForm">
              <input value={settings.site.siteName} onChange={(event) => setSettings((current) => ({ ...current, site: { ...current.site, siteName: event.target.value } }))} placeholder="站点名称" />
              <input value={settings.site.siteSubtitle} onChange={(event) => setSettings((current) => ({ ...current, site: { ...current.site, siteSubtitle: event.target.value } }))} placeholder="站点副标题" />
              <input value={settings.site.supportContact} onChange={(event) => setSettings((current) => ({ ...current, site: { ...current.site, supportContact: event.target.value } }))} placeholder="客服联系方式" />
              <textarea value={settings.site.footerNote} onChange={(event) => setSettings((current) => ({ ...current, site: { ...current.site, footerNote: event.target.value } }))} placeholder="页脚文案" />
            </div>
          </AdminPanel>

          <AdminPanel title="注册与支付设置">
            <div className="stackForm">
              <label className="checkboxRow">
                <input checked={settings.auth.allowRegistration} type="checkbox" onChange={(event) => setSettings((current) => ({ ...current, auth: { ...current.auth, allowRegistration: event.target.checked } }))} />
                允许新用户注册
              </label>
              <label className="checkboxRow">
                <input checked={settings.auth.requireInviteCode} type="checkbox" onChange={(event) => setSettings((current) => ({ ...current, auth: { ...current.auth, requireInviteCode: event.target.checked } }))} />
                注册要求邀请码
              </label>
              <input value={settings.auth.passwordHint} onChange={(event) => setSettings((current) => ({ ...current, auth: { ...current.auth, passwordHint: event.target.value } }))} placeholder="注册密码规则提示" />
              <label className="checkboxRow">
                <input checked={settings.payment.enableStripe} type="checkbox" onChange={(event) => setSettings((current) => ({ ...current, payment: { ...current.payment, enableStripe: event.target.checked } }))} />
                启用 Stripe 支付
              </label>
              <label className="checkboxRow">
                <input checked={settings.payment.displaySubscriptions} type="checkbox" onChange={(event) => setSettings((current) => ({ ...current, payment: { ...current.payment, displaySubscriptions: event.target.checked } }))} />
                充值页显示积分套餐
              </label>
              <textarea value={settings.payment.purchaseNotice} onChange={(event) => setSettings((current) => ({ ...current, payment: { ...current.payment, purchaseNotice: event.target.value } }))} placeholder="充值说明" />
              <button className="primaryButton" type="button" onClick={() => void saveSettings()}>
                保存配置
              </button>
            </div>
          </AdminPanel>
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

function Row({ title, meta }: { title: string; meta: string }) {
  return (
    <div className="adminInfoRow">
      <strong>{title}</strong>
      <p>{meta}</p>
    </div>
  );
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
