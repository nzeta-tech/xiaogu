"use client";

import { FormEvent, useEffect, useState } from "react";
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

type Announcement = {
  id: string;
  title: string;
  content: string;
  kind: string;
  placement: string;
  status: string;
  is_pinned: boolean;
  published_at?: string | null;
};

type Plan = {
  code: string;
  name: string;
  quotaAmount: number;
  amountCents: number;
  currency: string;
  description: string;
  recommended?: boolean;
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
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [tab, setTab] = useState<"overview" | "users" | "commerce" | "growth" | "settings">("overview");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [announcementForm, setAnnouncementForm] = useState({
    title: "",
    content: "",
    kind: "notice",
    placement: "global",
    status: "draft",
    isPinned: false,
  });
  const [promoForm, setPromoForm] = useState({
    code: "",
    rewardType: "credit",
    creditAmount: 100,
    discountPercent: 0,
    status: "active",
    maxRedemptions: 100,
    notes: "",
  });

  async function loadAll(signal?: AbortSignal) {
    setError("");
    const [summaryResponse, usersResponse, promoResponse, announcementsResponse, settingsResponse, plansResponse] = await Promise.all([
      fetch(apiPath("/api/admin/summary"), { signal }),
      fetch(apiPath("/api/admin/users"), { signal }),
      fetch(apiPath("/api/admin/promo-codes"), { signal }),
      fetch(apiPath("/api/admin/announcements"), { signal }),
      fetch(apiPath("/api/admin/settings"), { signal }),
      fetch(apiPath("/api/billing/plans"), { signal }),
    ]);

    const summaryPayload = (await summaryResponse.json()) as { summary?: Summary; error?: string };
    const usersPayload = (await usersResponse.json()) as { users?: AdminUser[]; error?: string };
    const promoPayload = (await promoResponse.json()) as { promoCodes?: PromoCode[]; error?: string };
    const announcementPayload = (await announcementsResponse.json()) as { announcements?: Announcement[]; error?: string };
    const settingsPayload = (await settingsResponse.json()) as { settings?: Settings; error?: string };
    const plansPayload = (await plansResponse.json()) as { plans?: Plan[] };

    if (!summaryResponse.ok || !usersResponse.ok || !promoResponse.ok || !announcementsResponse.ok || !settingsResponse.ok) {
      setError(
        summaryPayload.error ??
          usersPayload.error ??
          promoPayload.error ??
          announcementPayload.error ??
          settingsPayload.error ??
          "后台数据加载失败",
      );
      return;
    }

    setSummary(summaryPayload.summary ?? null);
    setUsers(usersPayload.users ?? []);
    setPromoCodes(promoPayload.promoCodes ?? []);
    setAnnouncements(announcementPayload.announcements ?? []);
    setSettings(settingsPayload.settings ?? defaultSettings);
    setPlans(plansPayload.plans ?? []);
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

  async function saveAnnouncement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch(apiPath("/api/admin/announcements"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(announcementForm),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "公告保存失败");
      return;
    }
    setAnnouncementForm({ title: "", content: "", kind: "notice", placement: "global", status: "draft", isPinned: false });
    await loadAll();
    setNotice("公告已保存。");
  }

  async function savePromo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch(apiPath("/api/admin/promo-codes"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(promoForm),
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

  return (
    <div className="pageStack">
      <div className="topbar adminTopbar">
        <div>
          <h1>小谷管理后台</h1>
          <div>围绕用户、订单、套餐、活动、系统配置开展日常运营。</div>
        </div>
        <button className="secondaryButton" onClick={() => void loadAll()}>
          刷新
        </button>
      </div>

      {error ? <div className="panel alertPanel">{error}</div> : null}
      {notice ? <div className="panel successPanel">{notice}</div> : null}

      <div className="tabs">
        {[
          ["overview", "运营总览"],
          ["users", "用户管理"],
          ["commerce", "商业化"],
          ["growth", "公告与增长"],
          ["settings", "系统配置"],
        ].map(([value, label]) => (
          <button className={tab === value ? "active" : ""} key={value} onClick={() => setTab(value as typeof tab)}>
            {label}
          </button>
        ))}
      </div>

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
          <div className="tableList">
            {users.map((user) => (
              <div className="tableRow" key={user.id}>
                <div>
                  <strong>{user.email}</strong>
                  <span>
                    {user.name} · {user.role} · {user.status} · 余额 {user.current_balance ?? 0} 点 · 已赠送 {user.gift_total ?? 0} 点
                  </span>
                </div>
                <div className="rowActions">
                  <button className="secondaryButton" onClick={() => void grantCredits(user.id, 100)}>赠送 100 点</button>
                  <button className="secondaryButton" onClick={() => void updateUser(user.id, { status: user.status === "active" ? "suspended" : "active" })}>
                    {user.status === "active" ? "停用" : "恢复"}
                  </button>
                  <button className="secondaryButton" onClick={() => void updateUser(user.id, { role: user.role === "admin" ? "broker" : "admin" })}>
                    {user.role === "admin" ? "设为经纪人" : "设为管理员"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {tab === "commerce" ? (
        <div className="pageStack">
          <div className="adminGrid">
            <AdminPanel title="套餐管理">
              {plans.map((plan) => (
                <Row
                  key={plan.code}
                  title={plan.name}
                  meta={`${plan.quotaAmount} 点 · ${formatMoney(plan.amountCents, plan.currency)} · ${plan.description}`}
                />
              ))}
            </AdminPanel>
            <AdminPanel title="支付表现">
              <Metric label="订单总数" value={summary?.orders ?? 0} />
              <Metric label="付费用户" value={summary?.paidUsers ?? 0} />
            </AdminPanel>
          </div>

          <div className="adminGrid">
            <AdminPanel title="最近订单">
              {(summary?.recentOrders ?? []).map((order) => (
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
                  <input
                    type="number"
                    value={promoForm.creditAmount}
                    onChange={(event) => setPromoForm((current) => ({ ...current, creditAmount: Number(event.target.value) }))}
                    placeholder="赠送点数"
                  />
                  <input
                    type="number"
                    value={promoForm.maxRedemptions}
                    onChange={(event) => setPromoForm((current) => ({ ...current, maxRedemptions: Number(event.target.value) }))}
                    placeholder="可兑换次数"
                  />
                </div>
                <textarea value={promoForm.notes} placeholder="备注" onChange={(event) => setPromoForm((current) => ({ ...current, notes: event.target.value }))} />
                <button className="primaryButton" type="submit">保存优惠码</button>
              </form>
            </AdminPanel>
          </div>

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
                  </div>
                </div>
              ))}
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
              <button className="primaryButton" type="submit">保存公告</button>
            </form>
          </AdminPanel>

          <AdminPanel title="公告列表">
            {announcements.map((item) => (
              <Row
                key={item.id}
                title={item.title}
                meta={`${item.kind} · ${item.placement} · ${item.status}${item.is_pinned ? " · 已置顶" : ""}`}
              />
            ))}
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
              <label className="checkboxRow">
                <input checked={settings.payment.enableStripe} type="checkbox" onChange={(event) => setSettings((current) => ({ ...current, payment: { ...current.payment, enableStripe: event.target.checked } }))} />
                启用 Stripe 支付
              </label>
              <label className="checkboxRow">
                <input checked={settings.payment.displaySubscriptions} type="checkbox" onChange={(event) => setSettings((current) => ({ ...current, payment: { ...current.payment, displaySubscriptions: event.target.checked } }))} />
                充值页展示订阅入口
              </label>
              <textarea value={settings.payment.purchaseNotice} onChange={(event) => setSettings((current) => ({ ...current, payment: { ...current.payment, purchaseNotice: event.target.value } }))} placeholder="充值说明" />
              <button className="primaryButton" type="button" onClick={() => void saveSettings()}>
                保存配置
              </button>
            </div>
          </AdminPanel>
        </div>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="panel metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function AdminPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="panel">
      <div className="panelHeader">
        <h2>{title}</h2>
      </div>
      <div className="sideBody">{children}</div>
    </section>
  );
}

function Row({ title, meta }: { title: string; meta: string }) {
  return (
    <div className="topic">
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
