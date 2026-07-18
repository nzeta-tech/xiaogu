"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AuthGuard } from "@/components/AuthGuard";
import { AppShell } from "@/components/layout/AppShell";
import { apiPath, appPath } from "@/lib/client/url";

type AccountUser = {
  name?: string;
  email?: string;
  role?: string;
  organizationId?: string | null;
};

type AccountOverview = {
  balance?: number;
  draftCount?: number;
  paidOrders?: number;
  totalUsed?: number;
  recentDrafts?: Array<{ id: string; title: string; platform: string; updated_at?: string }>;
};

type ThinkingPayload = {
  profile?: {
    display_name?: string;
    ip_tagline?: string;
    profile_summary?: string;
    brand_keywords?: string[];
    content_style_summary?: string;
  };
  summary?: { ready?: boolean; completion?: number; styleSummary?: string };
  questionnaire?: { completionPercent?: number; updatedAt?: string } | null;
};
type LoginEvent = { id: string; success: boolean; client_ip: string; user_agent: string; failure_reason: string; created_at: string };
type TotpState = { available: boolean; enabled: boolean; setupPending: boolean };
type TotpSetup = { secret: string; uri: string; qrCodeDataUrl: string };

const serviceLinks = [
  { href: "/thinking", label: "个人画像", detail: "管理定位与表达风格", icon: "profile" },
  { href: "/drafts", label: "创作历史", detail: "查看作品与创作记录", icon: "works" },
  { href: "/billing", label: "会员与积分", detail: "积分购买、订单和用量", icon: "billing" },
  { href: "/benefits", label: "成长权益", detail: "活动兑换与奖励记录", icon: "benefits" },
  { href: "/help", label: "使用帮助", detail: "常见问题与使用说明", icon: "help" },
  { href: "/feedback", label: "反馈支持", detail: "提交问题并查看进展", icon: "support" },
];

export default function AccountPage() {
  return <AuthGuard><AppShell><AccountCenter /></AppShell></AuthGuard>;
}

function AccountCenter() {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<AccountUser>({});
  const [overview, setOverview] = useState<AccountOverview>({});
  const [thinking, setThinking] = useState<ThinkingPayload>({});
  const [loginEvents, setLoginEvents] = useState<LoginEvent[]>([]);
  const [totp, setTotp] = useState<TotpState>({ available: false, enabled: false, setupPending: false });
  const [totpSetup, setTotpSetup] = useState<TotpSetup | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    async function loadAccount() {
      try {
        const [meResponse, overviewResponse, thinkingResponse, sessionsResponse, totpResponse] = await Promise.all([
          fetch(apiPath("/api/auth/me"), { signal: controller.signal }),
          fetch(apiPath("/api/workbench/overview"), { signal: controller.signal }),
          fetch(apiPath("/api/thinking"), { signal: controller.signal }),
          fetch(apiPath("/api/account/sessions"), { signal: controller.signal }),
          fetch(apiPath("/api/account/totp"), { signal: controller.signal }),
        ]);
        const mePayload = await meResponse.json() as { user?: AccountUser };
        const overviewPayload = await overviewResponse.json() as { overview?: AccountOverview };
        const thinkingPayload = await thinkingResponse.json() as ThinkingPayload;
        const sessionsPayload = await sessionsResponse.json() as { events?: LoginEvent[] };
        const totpPayload = await totpResponse.json() as TotpState;
        setUser(mePayload.user ?? {});
        setOverview(overviewPayload.overview ?? {});
        setThinking(thinkingResponse.ok ? thinkingPayload : {});
        setLoginEvents(sessionsPayload.events ?? []);
        if (totpResponse.ok) setTotp(totpPayload);
      } catch (cause) {
        if (!(cause instanceof DOMException && cause.name === "AbortError")) setError("用户中心数据暂时无法加载，请稍后重试。");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void loadAccount();
    return () => controller.abort();
  }, []);

  const profileCompletion = thinking.questionnaire?.completionPercent ?? thinking.summary?.completion ?? 0;
  const displayName = thinking.profile?.display_name || user.name || "经纪人";
  const initials = useMemo(() => displayName.trim().slice(0, 1).toUpperCase() || "谷", [displayName]);
  const keywords = thinking.profile?.brand_keywords?.filter(Boolean).slice(0, 6) ?? [];

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    const form = new FormData(event.currentTarget);
    const response = await fetch(apiPath("/api/account/password"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ currentPassword: form.get("currentPassword"), newPassword: form.get("newPassword") }),
    });
    const payload = await response.json() as { error?: string };
    setError(response.ok ? "" : payload.error ?? "密码修改失败");
    setMessage(response.ok ? "密码已更新，请重新登录。" : "");
    if (response.ok) { event.currentTarget.reset(); window.setTimeout(() => { location.href = appPath("/login"); }, 800); }
  }

  async function closeAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch(apiPath("/api/account/close"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: form.get("password"), confirmation: form.get("confirmation") }),
    });
    const payload = await response.json() as { error?: string };
    if (response.ok) location.href = appPath("/login");
    else setError(payload.error ?? "账号注销失败");
  }

  async function logoutAllSessions() {
    if (!confirm("确认退出所有设备上的登录？")) return;
    const response = await fetch(apiPath("/api/account/sessions"), { method: "DELETE" });
    if (response.ok) location.href = appPath("/login");
    else setError("退出所有设备失败");
  }

  async function setupTotp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setMessage("");
    const form = new FormData(event.currentTarget);
    const response = await fetch(apiPath("/api/account/totp"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "setup", password: form.get("password") }) });
    const payload = await response.json() as { setup?: TotpSetup; error?: string };
    if (!response.ok || !payload.setup) return setError(payload.error ?? "无法创建二次验证配置");
    setTotpSetup(payload.setup); setTotp((current) => ({ ...current, setupPending: true })); event.currentTarget.reset();
  }

  async function enableTotp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch(apiPath("/api/account/totp"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "enable", token: form.get("token") }) });
    const payload = await response.json() as { recoveryCodes?: string[]; error?: string };
    if (!response.ok) return setError(payload.error ?? "二次验证启用失败");
    setRecoveryCodes(payload.recoveryCodes ?? []); setTotp({ available: true, enabled: true, setupPending: false }); setTotpSetup(null); setMessage("二次验证已启用，请保存恢复码并重新登录。");
  }

  async function disableTotp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch(apiPath("/api/account/totp"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "disable", password: form.get("password"), token: form.get("token") }) });
    const payload = await response.json() as { error?: string };
    if (!response.ok) return setError(payload.error ?? "二次验证关闭失败");
    setTotp({ available: true, enabled: false, setupPending: false }); setMessage("二次验证已关闭，请重新登录。");
  }

  return (
    <div className="pageStack accountCenterPage">
      <section className="accountCenterHero">
        <div className="accountIdentity">
          <div className="accountAvatar" aria-hidden="true">{initials}</div>
          <div>
            <div className="accountIdentityTopline">
              <span>{loading ? "同步中" : "账号正常"}</span>
              <em>{user.role === "admin" ? "管理员" : "专业用户"}</em>
            </div>
            <h1>{displayName}</h1>
            <p>{user.email || "正在同步账号信息"}</p>
          </div>
        </div>
        <div className="accountHeroActions">
          <a className="secondaryButton linkButton" href={appPath("/thinking")}>完善个人画像</a>
          <a className="primaryButton linkButton" href={appPath("/workspace")}>开始创作</a>
        </div>
      </section>

      {error ? <div className="alertPanel">{error}</div> : null}
      {message ? <div className="successPanel">{message}</div> : null}

      <section className="accountMetricGrid" aria-label="用户经营数据">
        <AccountMetric label="可用积分" value={loading ? "-" : String(overview.balance ?? 0)} detail="用于内容创作与智能分析" tone="teal" />
        <AccountMetric label="创作历史" value={loading ? "-" : String(overview.draftCount ?? 0)} detail="已保存的作品与结果" tone="blue" />
        <AccountMetric label="累计使用" value={loading ? "-" : String(overview.totalUsed ?? 0)} detail="历史积分消耗" tone="amber" />
        <AccountMetric label="画像完成度" value={loading ? "-" : `${profileCompletion}%`} detail={thinking.summary?.ready ? "小谷已建立你的表达记忆" : "完善后内容会更像你"} tone="rose" />
      </section>

      <div className="accountCenterLayout">
        <div className="accountCenterMain">
          <section className="accountSectionCard">
            <div className="accountSectionHeader">
              <div>
                <span>小谷记忆</span>
                <h2>个人经营档案</h2>
                <p>这些信息会影响选题角度、内容语气和客户表达。</p>
              </div>
              <a href={appPath("/thinking")}>{thinking.summary?.ready ? "更新画像" : "开始建立"}</a>
            </div>

            <div className="accountProgressRow">
              <div>
                <strong>{profileCompletion}%</strong>
                <span>画像完成度</span>
              </div>
              <div className="accountProgressTrack"><span style={{ width: `${Math.max(0, Math.min(100, profileCompletion))}%` }} /></div>
            </div>

            <dl className="accountProfileList">
              <div><dt>个人定位</dt><dd>{thinking.profile?.ip_tagline || "还没有设置个人定位"}</dd></div>
              <div><dt>表达风格</dt><dd>{thinking.profile?.content_style_summary || thinking.summary?.styleSummary || "完成个人画像后由小谷自动提炼"}</dd></div>
              <div><dt>个人简介</dt><dd>{thinking.profile?.profile_summary || "补充你的经历、服务对象和专业优势"}</dd></div>
            </dl>

            <div className="accountKeywordRow">
              <span>品牌关键词</span>
              <div>{keywords.length > 0 ? keywords.map((item) => <em key={item}>{item}</em>) : <small>暂无关键词</small>}</div>
            </div>
          </section>

          <section className="accountSectionCard accountSecuritySection">
            <div className="accountSectionHeader">
              <div>
                <span>登录保护</span>
                <h2>账号安全</h2>
                <p>定期更新密码，保护作品与客户资料。</p>
              </div>
              <span className="accountSafeBadge">密码登录已启用</span>
            </div>

            <form className="accountPasswordForm" onSubmit={submitPassword}>
              <label>当前密码<input name="currentPassword" type="password" autoComplete="current-password" placeholder="输入当前密码" required /></label>
              <label>新密码<input name="newPassword" type="password" autoComplete="new-password" minLength={8} placeholder="至少 8 位" required /></label>
              <button className="primaryButton" type="submit">更新密码</button>
            </form>
            {totp.available ? <div className="accountTotpPanel">
              <div><h3>身份验证器</h3><p>{totp.enabled ? "登录时需要验证码或一次性恢复码。" : "使用身份验证器为账号增加第二层保护。"}</p></div>
              {!totp.enabled && !totpSetup ? <form className="accountPasswordForm" onSubmit={setupTotp}><label>当前密码<input name="password" type="password" autoComplete="current-password" required /></label><button className="secondaryButton" type="submit">开始设置</button></form> : null}
              {totpSetup ? <div className="accountTotpSetup"><img src={totpSetup.qrCodeDataUrl} alt="身份验证器二维码" /><code>{totpSetup.secret}</code><form className="accountPasswordForm" onSubmit={enableTotp}><label>6 位验证码<input name="token" inputMode="numeric" autoComplete="one-time-code" required /></label><button className="primaryButton" type="submit">确认启用</button></form></div> : null}
              {totp.enabled ? <form className="accountPasswordForm" onSubmit={disableTotp}><label>当前密码<input name="password" type="password" required /></label><label>验证码或恢复码<input name="token" autoComplete="one-time-code" required /></label><button className="secondaryButton" type="submit">关闭二次验证</button></form> : null}
              {recoveryCodes.length ? <div className="accountRecoveryCodes" role="status"><strong>恢复码只显示一次</strong>{recoveryCodes.map((code) => <code key={code}>{code}</code>)}</div> : null}
            </div> : null}
            <div className="accountSessionActions"><button className="secondaryButton" type="button" onClick={() => void logoutAllSessions()}>退出所有设备</button></div>
            <div className="accountLoginHistory">
              <h3>最近登录记录</h3>
              {loginEvents.slice(0, 8).map((event) => <div key={event.id}><span>{event.success ? "登录成功" : "登录失败"}</span><small>{event.client_ip || "未知地址"} · {formatDateTime(event.created_at)}</small></div>)}
              {loginEvents.length === 0 ? <p className="subtleText">暂无登录记录。</p> : null}
            </div>

            <details className="accountDangerDetails">
              <summary>账号注销与危险操作</summary>
              <div>
                <p>注销后无法再次登录。订单和依法需要保留的财务记录仍会保存。</p>
                <form className="accountCloseForm" onSubmit={closeAccount}>
                  <input name="password" type="password" autoComplete="current-password" placeholder="当前密码" required />
                  <input name="confirmation" placeholder="输入：注销账号" required />
                  <button className="secondaryButton" type="submit">确认注销</button>
                </form>
              </div>
            </details>
          </section>
        </div>

        <aside className="accountCenterAside">
          <section className="accountSectionCard">
            <div className="accountSectionHeader compact">
              <div><span>快捷入口</span><h2>常用服务</h2></div>
            </div>
            <div className="accountServiceList">
              {serviceLinks.map((item) => (
                <a href={appPath(item.href)} key={item.href}>
                  <AccountServiceIcon name={item.icon} />
                  <span><strong>{item.label}</strong><small>{item.detail}</small></span>
                  <b aria-hidden="true">›</b>
                </a>
              ))}
            </div>
          </section>

          <section className="accountSectionCard">
            <div className="accountSectionHeader compact">
              <div><span>最近更新</span><h2>创作历史</h2></div>
              <a href={appPath("/drafts")}>查看全部</a>
            </div>
            <div className="accountRecentWorks">
              {(overview.recentDrafts ?? []).slice(0, 3).map((draft) => (
                <a href={appPath(`/works/${draft.id}?from=creation-works&entry=${draft.platform}`)} key={draft.id}>
                  <span>{draft.platform}</span>
                  <strong>{draft.title}</strong>
                  <small>{formatDate(draft.updated_at)}</small>
                </a>
              ))}
              {!loading && (overview.recentDrafts?.length ?? 0) === 0 ? <p>还没有创作记录，从第一次创作开始。</p> : null}
            </div>
          </section>

          <section className="accountSectionCard accountStatusCard">
            <div className="accountSectionHeader compact"><div><span>账户信息</span><h2>当前状态</h2></div></div>
            <dl>
              <div><dt>账号类型</dt><dd>{user.role === "admin" ? "管理员" : "经纪人"}</dd></div>
              <div><dt>支付订单</dt><dd>{overview.paidOrders ?? 0} 笔</dd></div>
              <div><dt>账号状态</dt><dd className="healthy">正常</dd></div>
            </dl>
          </section>
        </aside>
      </div>
    </div>
  );
}

function AccountMetric({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: string }) {
  return <article className={`accountMetric tone-${tone}`}><span>{label}</span><strong>{value}</strong><p>{detail}</p></article>;
}

function AccountServiceIcon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    profile: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM5 20a7 7 0 0 1 14 0",
    works: "M4 7h6l2 2h8v10H4zM4 7V5h6l2 2",
    billing: "M3 6h18v12H3zM3 10h18M7 15h3",
    benefits: "M4 9h16v11H4zM3 5h18v4H3zM12 5v15M8 5c-2-3 4-4 4 0M16 5c2-3-4-4-4 0",
    help: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 1-1 1.7M12 17h.01",
    support: "M4 5h16v12H8l-4 3zM8 9h8M8 13h5",
  };
  return <span className="accountServiceIcon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name] ?? paths.help} /></svg></span>;
}

function formatDate(value?: string) {
  if (!value) return "最近更新";
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
