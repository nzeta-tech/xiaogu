"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { apiPath, appPath } from "@/lib/client/url";

const menuNavItems = [
  { id: "workbench", href: "/dashboard", label: "工作台", shortLabel: "经营概览", icon: "home" },
  { id: "creation", href: "/workspace", label: "获客创作", shortLabel: "获客创作", icon: "edit" },
  { id: "crm", href: "/thinking", label: "思维画像", shortLabel: "个性设置", icon: "users" },
  { id: "growth", href: "/benefits", label: "活动兑换", shortLabel: "积分权益", icon: "sprout" },
  { id: "feedback", href: "/feedback", label: "反馈支持", shortLabel: "问题与建议", icon: "✉" },
  { id: "account", href: "/account", label: "账号与安全", shortLabel: "密码与注销", icon: "⚙️" },
];

const platformNavItems = [
  { id: "workbench", href: "/dashboard", label: "工作台", shortLabel: "经营概览", icon: "home" },
  { id: "creation", href: "/workspace", label: "获客创作", shortLabel: "获客创作", icon: "edit" },
  { id: "crm", href: "/thinking", label: "思维画像", shortLabel: "个性设置", icon: "users" },
  { id: "growth", href: "/benefits", label: "活动兑换", shortLabel: "积分权益", icon: "sprout" },
];

const adminNavItem = { id: "admin", href: "/admin", label: "管理后台", shortLabel: "运营管理", icon: "admin" };

const legacyMenuNavItems = [
  { id: "billing", href: "/billing", label: "充值中心", shortLabel: "订单与额度", icon: "💳" },
  { id: "benefits", href: "/benefits", label: "权益奖励", shortLabel: "奖励与活动", icon: "🎁" },
  { id: "feedback", href: "/feedback", label: "反馈支持", shortLabel: "问题与建议", icon: "✉" },
  { id: "thinking", href: "/thinking", label: "账户设置", shortLabel: "个人信息", icon: "⚙️" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [role, setRole] = useState("broker");
  const [userName, setUserName] = useState("经纪人");
  const [quotaBalance, setQuotaBalance] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [siteConfig, setSiteConfig] = useState({ siteName: "小谷", siteSubtitle: "保险内容增长助手", supportContact: "" });

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
    void fetch(apiPath("/api/system/public-config"))
      .then((response) => response.json())
      .then((payload: { site?: Partial<typeof siteConfig> }) => setSiteConfig((current) => ({ ...current, ...payload.site })))
      .catch(() => undefined);
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
    pathname === "/dashboard" ||
    pathname === "/workspace" ||
    pathname === "/drafts" ||
    pathname === "/thinking" ||
    pathname === "/questionnaire" ||
    pathname === "/feedback" ||
    pathname === "/account" ||
    pathname.startsWith("/apps/") ||
    pathname.startsWith("/examples/") ||
    pathname.startsWith("/works/");
  const creationBrandName = `${siteConfig.siteName}AI`;
  const creationBrandTagline = siteConfig.siteSubtitle;
  const visiblePlatformNavItems = role === "admin" ? [...platformNavItems, adminNavItem] : platformNavItems;

  return (
    <div className={`shell ${isCreationSurface ? "creationShell" : ""}`}>
      {isCreationSurface && pathname !== "/questionnaire" ? (
        <a className="creationPromoStrip" href={appPath("/benefits")}>
          <span aria-hidden="true">🎁</span>
          查看活动与积分权益
          <strong>活动中心</strong>
        </a>
      ) : null}
      {pathname === "/questionnaire" ? (
        <a className="questionnairePromoStrip" href={appPath("/benefits")}>
          <span aria-hidden="true">🎁</span>
          完成内容画像，让每次创作更贴近你的真实表达
          <strong>查看权益</strong>
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
              {visiblePlatformNavItems.map((item) => (
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
            {isCreationSurface ? <a className="ghostAction" href={appPath("/benefits")}>活动兑换</a> : null}
            {isCreationSurface ? <a className="solidAction" href={appPath("/billing")}>购买积分</a> : null}
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
            <a href={appPath("/help")} role="menuitem" onClick={() => setMenuOpen(false)}>
              <strong>使用帮助</strong>
              <span>创作、积分与账号说明</span>
            </a>
          ) : null}
          {siteConfig.supportContact ? <a href={`mailto:${siteConfig.supportContact}`} role="menuitem"><strong>联系客服</strong><span>{siteConfig.supportContact}</span></a> : null}
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

  if (name === "admin") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 5.5h16" />
        <path d="M7 9.5h10" />
        <path d="M6 14h4v4H6z" />
        <path d="M14 14h4v4h-4z" />
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

  if (itemId === "workbench") {
    return pathname === "/dashboard";
  }

  if (itemId === "crm") {
    return pathname === "/thinking" || pathname === "/questionnaire";
  }

  if (itemId === "growth") {
    return pathname === "/benefits" || pathname === "/billing";
  }

  if (itemId === "admin") {
    return pathname === "/admin";
  }

  if (itemId === "account") {
    return pathname === "/account";
  }

  return false;
}
