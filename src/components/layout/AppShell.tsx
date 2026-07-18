"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { adminMenuItems, getAdminSection, type AdminSectionId } from "@/lib/admin/navigation";
import { apiPath, appPath } from "@/lib/client/url";
import { listenForPageMeta, type PageMetaDetail } from "@/lib/client/page-meta";

const platformNavItems = [
  { id: "workbench", href: "/dashboard", label: "今日", shortLabel: "今日工作台", icon: "home" },
  { id: "creation", href: "/workspace", label: "获客创作", shortLabel: "获客创作", icon: "edit" },
  { id: "assets", href: "/drafts", label: "创作历史", shortLabel: "作品与素材", icon: "assets" },
  { id: "crm", href: "/thinking", label: "数字分身", shortLabel: "人设与表达", icon: "users" },
  { id: "invite", href: "/benefits#invite", label: "邀请有礼", shortLabel: "邀请与奖励", icon: "gift" },
  { id: "growth", href: "/account", label: "用户中心", shortLabel: "权益与账户", icon: "sprout" },
];

const adminNavItem = { id: "admin", href: "/admin", label: "管理后台", shortLabel: "运营管理", icon: "admin" };

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const navigationSource = searchParams.get("from");
  const [role, setRole] = useState("broker");
  const [userName, setUserName] = useState("经纪人");
  const [quotaBalance, setQuotaBalance] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [adminSection, setAdminSection] = useState<AdminSectionId>("overview");
  const [siteConfig, setSiteConfig] = useState<{ siteName: string; siteSubtitle: string; supportContact: string; footerNote: string; logoUrl: string; helpUrl: string; homeContent: string; customNavItems: Array<{ id: string; label: string; url: string; visibility: "user" | "admin"; sortOrder: number }> }>({ siteName: "小谷", siteSubtitle: "保险内容增长助手", supportContact: "", footerNote: "", logoUrl: "/brand/xiaogu-icon.png", helpUrl: "/help", homeContent: "", customNavItems: [] });
  const [pageMetaOverride, setPageMetaOverride] = useState<PageMetaDetail | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setPageMetaOverride(null), 0);
    const stopListening = listenForPageMeta(setPageMetaOverride);
    return () => {
      window.clearTimeout(timer);
      stopListening();
    };
  }, [pathname]);

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

  useEffect(() => {
    if (pathname !== "/admin") return;

    function syncAdminSection() {
      setAdminSection(getAdminSection(window.location.hash));
    }

    syncAdminSection();
    window.addEventListener("hashchange", syncAdminSection);
    return () => window.removeEventListener("hashchange", syncAdminSection);
  }, [pathname]);

  const isCreationSurface =
    pathname === "/dashboard" ||
    pathname === "/workspace" ||
    pathname === "/drafts" ||
    pathname === "/thinking" ||
    pathname === "/questionnaire" ||
    pathname === "/feedback" ||
    pathname === "/benefits" ||
    pathname === "/billing" ||
    pathname === "/account" ||
    pathname.startsWith("/apps/") ||
    pathname.startsWith("/examples/") ||
    pathname.startsWith("/works/");
  const creationBrandName = `${siteConfig.siteName}AI`;
  const customUserNavItems = siteConfig.customNavItems.filter((item) => item.visibility === "user").sort((a, b) => a.sortOrder - b.sortOrder).map((item) => ({ ...item, href: item.url, shortLabel: item.label, icon: "help" }));
  const customAdminNavItems = siteConfig.customNavItems.filter((item) => item.visibility === "admin").sort((a, b) => a.sortOrder - b.sortOrder);
  const visiblePlatformNavItems = role === "admin" ? [...platformNavItems, ...customUserNavItems, adminNavItem] : [...platformNavItems, ...customUserNavItems];
  const pageMeta = pageMetaOverride ?? getPageMeta(pathname, siteConfig.siteSubtitle);

  return (
    <div className={`shell xiaoguLightTheme ${isCreationSurface ? "creationShell" : ""}`}>
      <aside className="appSidebar">
        <div className="appSidebarInner">
          <a className="brand brandLink" href={appPath("/workspace")}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="brandMark" src={resolvePublicUrl(siteConfig.logoUrl)} alt="小谷" />
            <div className="brandCopy creationBrandCopy">
              <strong>{creationBrandName}</strong>
              <span>保险人的智能工作伙伴</span>
            </div>
          </a>

          <nav className="appSidebarNav" aria-label="主导航">
            <span className="appSidebarLabel">{pathname === "/admin" ? "运营管理" : "工作空间"}</span>
            {(pathname === "/admin" ? [adminNavItem] : visiblePlatformNavItems).map((item) => (
              <a className={isNavItemActive(pathname, item.id, navigationSource) ? "active" : ""} href={resolvePublicUrl(item.href)} key={`${item.href}-${item.label}`}>
                <span className="appSidebarIcon" aria-hidden="true"><NavIcon name={item.icon} /></span>
                <span>{item.label}</span>
              </a>
            ))}
            {role === "admin" && pathname === "/admin" ? (
              <div className="adminSidebarSubmenu" aria-label="管理后台子菜单">
                {adminMenuItems.map((item) => (
                  <a
                    aria-current={pathname === "/admin" && adminSection === item.id ? "page" : undefined}
                    className={pathname === "/admin" && adminSection === item.id ? "active" : ""}
                    href={appPath(`/admin#${item.id}`)}
                    key={item.id}
                  >
                    <span className="appSidebarIcon" aria-hidden="true"><AdminSectionIcon name={item.id} /></span>
                    <span>{item.label}</span>
                  </a>
                ))}
                {customAdminNavItems.map((item) => <a href={resolvePublicUrl(item.url)} key={`admin-custom-${item.id}`}><span className="appSidebarIcon" aria-hidden="true"><NavIcon name="help" /></span><span>{item.label}</span></a>)}
              </div>
            ) : null}
            {pathname === "/admin" ? (
              <a className="adminBackToWorkspace" href={appPath("/workspace")}>
                <span className="appSidebarIcon" aria-hidden="true"><NavIcon name="creation" /></span>
                <span>返回工作空间</span>
              </a>
            ) : null}
          </nav>

          <div className="appSidebarFooter">
            <a className="sidebarSupportLink" href={resolvePublicUrl(siteConfig.helpUrl)}>
              <span className="appSidebarIcon" aria-hidden="true"><NavIcon name="help" /></span>
              <span>使用帮助</span>
            </a>
            <a className="sidebarSupportLink" href={appPath("/feedback")}>
              <span className="appSidebarIcon" aria-hidden="true"><NavIcon name="support" /></span>
              <span>反馈支持</span>
            </a>
          </div>
        </div>
      </aside>

      <div className="shellMainColumn">
        <header className="appHeader">
          <div className="appHeaderBar">
            <a className="mobileBrand" href={appPath("/dashboard")} aria-label="小谷首页">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={resolvePublicUrl(siteConfig.logoUrl)} alt="" />
            </a>
            <div className="appPageIdentity">
              <strong>{pageMeta.title}{pageMeta.status ? <em>{pageMeta.status}</em> : null}</strong>
              <span>{pageMeta.description}</span>
            </div>

            <div className="headerActions">
              <div className="quotaChip" aria-label={`可用积分 ${quotaBalance === null ? "同步中" : quotaBalance}`}>
                <span>可用积分</span>
                <strong>{quotaBalance === null ? "同步中" : quotaBalance}</strong>
              </div>
              <div className="userMenuWrap" onClick={(event) => event.stopPropagation()}>
                <button
                  aria-label="打开账户菜单"
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
          {pathname === "/admin" ? (
            <nav className="adminMobileSubnav" aria-label="管理后台子菜单">
              {adminMenuItems.map((item) => (
                <a
                  aria-current={adminSection === item.id ? "page" : undefined}
                  className={adminSection === item.id ? "active" : ""}
                  href={appPath(`/admin#${item.id}`)}
                  key={`mobile-admin-${item.id}`}
                >
                  {item.label}
                </a>
              ))}
            </nav>
          ) : null}
          <main className="main">{children}</main>
        </div>

        <nav className="mobileAppNav" aria-label="移动端主导航">
          {platformNavItems.map((item) => (
            <a className={isNavItemActive(pathname, item.id, navigationSource) ? "active" : ""} href={appPath(item.href)} key={`mobile-${item.id}`}>
              <span aria-hidden="true"><NavIcon name={item.icon} /></span>
              <strong>{item.label}</strong>
            </a>
          ))}
        </nav>
      </div>
    </div>
  );

  function renderUserMenu() {
    return (
      <div className="userMenuPanel compactUserMenu" role="menu">
        <div className="userMenuHeader">
          <strong>{userName}</strong>
          <span>{role === "admin" ? "管理员" : "专业用户"}</span>
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

  if (name === "assets") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 7h6l2 2h8v10H4z" />
        <path d="M4 7V5h6l2 2" />
      </svg>
    );
  }

  if (name === "gift") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 10h16v10H4z" />
        <path d="M3 6h18v4H3zM12 6v14" />
        <path d="M12 6H8.5a2.5 2.5 0 1 1 2.2-3.7L12 6Zm0 0h3.5a2.5 2.5 0 1 0-2.2-3.7L12 6Z" />
      </svg>
    );
  }

  if (name === "support") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 5h16v12H8l-4 3z" />
        <path d="M8 9h8M8 13h5" />
      </svg>
    );
  }

  if (name === "account") {
    return <UserAvatarIcon />;
  }

  if (name === "help") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M9.8 9a2.4 2.4 0 1 1 3.4 2.2c-.8.4-1.2.9-1.2 1.8" />
        <path d="M12 17h.01" />
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

function AdminSectionIcon({ name }: { name: AdminSectionId }) {
  const paths: Record<AdminSectionId, React.ReactNode> = {
    overview: <><rect x="4" y="4" width="6" height="6" /><rect x="14" y="4" width="6" height="6" /><rect x="4" y="14" width="6" height="6" /><rect x="14" y="14" width="6" height="6" /></>,
    users: <><circle cx="9" cy="8" r="3" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 6.5a2.5 2.5 0 0 1 0 5M17 14a4.5 4.5 0 0 1 4 4.5" /></>,
    content: <><path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5" /></>,
    commerce: <><path d="M7 4h10M8 8h8M12 4v16M7.5 14h9" /></>,
    growth: <><path d="M4 18V11M10 18V7M16 18V3M3 18h18" /></>,
    support: <><path d="M4 5h16v12H8l-4 3zM8 9h8M8 13h5" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1A8 8 0 0 0 15 6l-.3-2.6h-4L10.4 6a8 8 0 0 0-1.5.9l-2.4-1-2 3.4 2 1.5a7 7 0 0 0 0 2.1l-2 1.5 2 3.4 2.4-1a8 8 0 0 0 1.5.9l.3 2.6h4l.3-2.6a8 8 0 0 0 1.5-.9l2.4 1 2-3.4-2-1.5c.1-.3.1-.7.1-1Z" /></>,
  };

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
}

function isNavItemActive(pathname: string, itemId?: string, navigationSource?: string | null) {
  const isWorkDetail = pathname.startsWith("/works/");
  const workNavigationItem = navigationSource === "creation-works"
    ? "assets"
    : navigationSource === "dashboard"
      ? "workbench"
      : "creation";

  if (itemId === "creation") {
    return pathname === "/workspace" || pathname.startsWith("/apps/") || pathname.startsWith("/examples/") || (isWorkDetail && workNavigationItem === "creation");
  }

  if (itemId === "workbench") {
    return pathname === "/dashboard" || (isWorkDetail && workNavigationItem === "workbench");
  }

  if (itemId === "crm") {
    return pathname === "/thinking" || pathname === "/questionnaire";
  }

  if (itemId === "growth") {
    return pathname === "/account" || pathname === "/billing";
  }

  if (itemId === "invite") {
    return pathname === "/benefits";
  }

  if (itemId === "assets") {
    return pathname === "/drafts" || (isWorkDetail && workNavigationItem === "assets");
  }

  if (itemId === "admin") {
    return pathname === "/admin";
  }

  if (itemId === "account") {
    return pathname === "/account";
  }

  return false;
}

function resolvePublicUrl(value: string) {
  return /^https?:\/\//i.test(value) ? value : appPath(value.startsWith("/") ? value : `/${value}`);
}

function getPageMeta(pathname: string, fallbackDescription: string): PageMetaDetail {
  if (pathname === "/dashboard") return { title: "今日工作台", description: "把今天的重要动作推进下去" };
  if (pathname === "/workspace" || pathname.startsWith("/apps/")) return { title: "获客创作", description: "从想法到可发布内容" };
  if (pathname.startsWith("/works/") || pathname.startsWith("/examples/")) return { title: "作品详情", description: "审阅、优化与复用内容" };
  if (pathname === "/drafts") return { title: "创作历史", description: "管理作品与创作素材" };
  if (pathname === "/thinking" || pathname === "/questionnaire") return { title: "数字分身", description: "管理人设与表达偏好" };
  if (pathname === "/billing") return { title: "会员与积分", description: "查看额度和购买记录" };
  if (pathname === "/benefits") return { title: "邀请有礼", description: "邀请好友、查看返利与活动奖励" };
  if (pathname === "/feedback") return { title: "反馈支持", description: "告诉我们你的使用感受" };
  if (pathname === "/account") return { title: "用户中心", description: "个人资料、经营数据与账号安全" };
  if (pathname === "/admin") return { title: "管理后台", description: "运营与系统管理" };
  return { title: "小谷 AI", description: fallbackDescription };
}
