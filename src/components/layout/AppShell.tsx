"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { apiPath, appPath } from "@/lib/client/url";

const menuNavItems = [
  { id: "workbench", href: "/workspace", label: "工作台", shortLabel: "工作台", icon: "home" },
  { id: "creation", href: "/workspace", label: "获客创作", shortLabel: "获客创作", icon: "edit" },
  { id: "crm", href: "/thinking", label: "客户经营", shortLabel: "客户经营", icon: "users" },
  { id: "growth", href: "/benefits", label: "成长", shortLabel: "成长", icon: "sprout" },
];

const platformNavItems = [
  { id: "workbench", href: "/workspace", label: "工作台", shortLabel: "工作台", icon: "home" },
  { id: "creation", href: "/workspace", label: "获客创作", shortLabel: "获客创作", icon: "edit" },
  { id: "crm", href: "/thinking", label: "客户经营", shortLabel: "客户经营", icon: "users" },
  { id: "growth", href: "/benefits", label: "成长", shortLabel: "成长", icon: "sprout" },
];

const legacyMenuNavItems = [
  { id: "billing", href: "/billing", label: "充值中心", shortLabel: "订单与额度", icon: "💳" },
  { id: "benefits", href: "/benefits", label: "权益奖励", shortLabel: "奖励与活动", icon: "🎁" },
  { id: "thinking", href: "/thinking", label: "账户设置", shortLabel: "个人信息", icon: "⚙️" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [role, setRole] = useState("broker");
  const [userName, setUserName] = useState("经纪人");
  const [quotaBalance, setQuotaBalance] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    async function loadUser() {
      const response = await fetch(apiPath("/api/auth/me"));
      const payload = (await response.json()) as { user?: { name?: string; email?: string; role?: string } };
      setRole(payload.user?.role ?? "broker");
      setUserName(payload.user?.name || payload.user?.email || "经纪人");
    }

    void loadUser();
  }, []);

  useEffect(() => {
    async function loadBalance() {
      const response = await fetch(apiPath("/api/billing/balance"));
      const payload = (await response.json()) as { balance?: number };
      setQuotaBalance(payload.balance ?? null);
    }

    void loadBalance();
    window.addEventListener("ica:conversations-updated", loadBalance);
    return () => window.removeEventListener("ica:conversations-updated", loadBalance);
  }, []);

  useEffect(() => {
    function closeMenu() {
      setMenuOpen(false);
    }

    window.addEventListener("click", closeMenu);
    return () => window.removeEventListener("click", closeMenu);
  }, []);

  const isCreationSurface =
    pathname === "/workspace" ||
    pathname === "/drafts" ||
    pathname === "/thinking" ||
    pathname === "/questionnaire" ||
    pathname.startsWith("/apps/") ||
    pathname.startsWith("/examples/") ||
    pathname.startsWith("/works/");
  const creationBrandName = "小谷AI";
  const creationBrandTagline = "围绕获客增长的全场景 AI 内容创作应用";

  return (
    <div className={`shell ${isCreationSurface ? "creationShell" : ""}`}>
      {isCreationSurface && pathname !== "/questionnaire" ? (
        <a className="creationPromoStrip" href={appPath("/benefits")}>
          <span aria-hidden="true">🎁</span>
          进交流群，领福利
          <strong>点击领取</strong>
        </a>
      ) : null}
      {pathname === "/questionnaire" ? (
        <a className="questionnairePromoStrip" href={appPath("/benefits")}>
          <span aria-hidden="true">🎁</span>
          限时活动！推荐有奖~拿198元抵扣券
          <strong>立即参与</strong>
        </a>
      ) : null}
      <header className="appHeader">
        <div className="appHeaderBar">
          <a className="brand brandLink" href={appPath("/workspace")}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="brandMark" src={appPath("/brand/xiaogu-icon.png")} alt="小谷" />
            <div className={isCreationSurface ? "brandCopy creationBrandCopy" : "brandCopy"}>
              <strong>{isCreationSurface ? creationBrandName : "小谷"}</strong>
              <span>{isCreationSurface ? creationBrandTagline : "更懂保险内容增长"}</span>
            </div>
          </a>

          {isCreationSurface ? (
            <nav className="topNav" aria-label="主导航">
              {platformNavItems.map((item) => (
                <a className={isNavItemActive(pathname, item.id) ? "active" : ""} href={appPath(item.href)} key={`${item.href}-${item.label}`}>
                  <span className="topNavIcon" aria-hidden="true"><NavIcon name={item.icon} /></span>
                  <div className="topNavCopy">
                    <strong>{item.label}</strong>
                    <span>{item.shortLabel}</span>
                  </div>
                </a>
              ))}
            </nav>
          ) : null}

          <div className="headerActions">
            {quotaBalance !== null ? (
              <div className="quotaChip quotaWarningChip">
                <span>{isCreationSurface ? "当前积分" : "余额情况"}</span>
                <strong>{isCreationSurface ? `${quotaBalance} 积分` : `${quotaBalance} 点`}</strong>
              </div>
            ) : null}
            {isCreationSurface ? <a className="ghostAction" href={appPath("/benefits")}>邀请有奖</a> : null}
            {isCreationSurface ? <a className="solidAction" href={appPath("/billing")}>购买会员</a> : null}
            <div className="userMenuWrap" onClick={(event) => event.stopPropagation()}>
              <button
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                className="userPill userMenuButton"
                onClick={() => setMenuOpen((current) => !current)}
                type="button"
              >
                <UserAvatarIcon />
              </button>
              {menuOpen ? renderUserMenu() : null}
            </div>
          </div>
        </div>
      </header>

      <div className="shellBody">
        <main className="main">{children}</main>
      </div>
    </div>
  );

  function renderUserMenu(direction?: "upward") {
    return (
      <div className={`userMenuPanel ${direction === "upward" ? "upward" : ""}`} role="menu">
        <div className="userMenuHeader">
          <strong>{userName}</strong>
          <span>{quotaBalance === null ? "额度同步中" : `当前额度 ${quotaBalance} 点`}</span>
        </div>
        <div className="userMenuList">
            {(isCreationSurface ? menuNavItems : legacyMenuNavItems).map((item) => (
              <a
                className={isNavItemActive(pathname, item.id) ? "active" : ""}
                href={appPath(item.href)}
                key={`${item.href}-${item.label}`}
                role="menuitem"
                onClick={() => setMenuOpen(false)}
              >
                <span className="userMenuIcon" aria-hidden="true">{item.icon ?? "•"}</span>
                <div>
                  <strong>{item.label}</strong>
                  <span>{item.shortLabel}</span>
                </div>
              </a>
            ))}
          {isCreationSurface ? (
            <a href={appPath("/benefits")} role="menuitem" onClick={() => setMenuOpen(false)}>
              <strong>点击领取</strong>
              <span>活动福利与会员权益</span>
            </a>
          ) : null}
          {role === "admin" ? (
            <a href={appPath("/admin")} role="menuitem" onClick={() => setMenuOpen(false)}>
              <strong>管理后台</strong>
              <span>系统运营</span>
            </a>
          ) : null}
        </div>
        <button
          className="userMenuLogout"
          onClick={async () => {
            await fetch(apiPath("/api/auth/logout"), { method: "POST" });
            location.href = appPath("/login");
          }}
          role="menuitem"
          type="button"
        >
          退出登录
        </button>
      </div>
    );
  }
}

function NavIcon({ name }: { name: string }) {
  if (name === "home") {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 3.5 4 9.6v10.2c0 .4.3.7.7.7H9.8c.4 0 .7-.3.7-.7v-5.2h3v5.2c0 .4.3.7.7.7h5.1c.4 0 .7-.3.7-.7V9.6L12 3.5Z" />
      </svg>
    );
  }

  if (name === "edit") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 17.3V21h3.7L18.3 9.4l-3.7-3.7L3 17.3Z" />
        <path d="m12.8 7.2 3.7 3.7" />
      </svg>
    );
  }

  if (name === "users") {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M7.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm9 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2.5 20a5.5 5.5 0 0 1 11 0H2.5Zm10.7 0a5.8 5.8 0 0 1 3.1-4.4A4.8 4.8 0 0 1 21.5 20h-8.3Z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M11 21h2V13.8l6.4-6.1a1 1 0 0 0-.7-1.7h-3.5L12 2 8.8 6H5.3a1 1 0 0 0-.7 1.7l6.4 6.1V21Z" />
    </svg>
  );
}

function UserAvatarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </svg>
  );
}

function isNavItemActive(pathname: string, itemId?: string) {
  if (itemId === "creation") {
    return pathname === "/workspace" || pathname === "/drafts" || pathname.startsWith("/apps/") || pathname.startsWith("/examples/") || pathname.startsWith("/works/");
  }

  if (itemId === "crm") {
    return pathname === "/thinking" || pathname === "/questionnaire";
  }

  if (itemId === "growth") {
    return pathname === "/benefits" || pathname === "/billing";
  }

  return false;
}
