"use client";

import { useEffect, useState } from "react";
import { apiPath, appPath } from "@/lib/client/url";
import { useThinkingEntryState } from "@/lib/client/thinking-entry";

type WorksPayload = {
  works: {
    totals: {
      all: number;
      favorite: number;
      used: number;
      unused: number;
      noted: number;
    };
    items: DraftItem[];
  };
};

type DraftItem = {
  id: string;
  title: string;
  content: string;
  platform: string;
  status: string;
  updatedAt?: string;
  note?: string;
  isFavorite?: boolean;
  isUsed?: boolean;
};

type StatusFilter = "all" | "favorite" | "used" | "unused" | "noted";
type AppFilter = "all" | "write-copy" | "image-card";
type LoadState = "loading" | "ready" | "error";
type CalendarDay = {
  date: string;
  day: number;
  count: number;
};
type CalendarMonth = {
  key: string;
  label: string;
  offset: number;
  days: CalendarDay[];
};

const weekdayLabels = ["一", "二", "三", "四", "五", "六", "日"];

const appTabs: Array<{ value: AppFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "write-copy", label: "写文案" },
  { value: "image-card", label: "做图" },
];

export function DraftsPageClient() {
  const thinkingEntry = useThinkingEntryState();
  const [payload, setPayload] = useState<WorksPayload | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [appFilter, setAppFilter] = useState<AppFilter>("all");

  useEffect(() => {
    let cancelled = false;

    async function loadWorks() {
      try {
        const response = await fetch(apiPath("/api/creation/hub?view=works"), {
          credentials: "include",
          cache: "no-store",
        });
        const next = (await response.json()) as WorksPayload;
        if (cancelled) return;
        setPayload(response.ok ? next : null);
        setLoadState(response.ok ? "ready" : "error");
      } catch {
        if (cancelled) return;
        setPayload(null);
        setLoadState("error");
      }
    }

    void loadWorks();

    return () => {
      cancelled = true;
    };
  }, []);

  const items = payload?.works.items ?? [];
  const filteredItems = items.filter((item) => {
    const matchesStatus =
      statusFilter === "all" ? true
        : statusFilter === "favorite" ? Boolean(item.isFavorite)
          : statusFilter === "used" ? Boolean(item.isUsed)
            : statusFilter === "unused" ? !item.isUsed
              : Boolean(item.note?.trim());
    const matchesApp = appFilter === "all" ? true : item.platform === appFilter;
    return matchesStatus && matchesApp;
  });

  const appCounts = {
    all: items.length,
    "write-copy": items.filter((item) => item.platform === "write-copy").length,
    "image-card": items.filter((item) => item.platform === "image-card").length,
  };

  const statusTabs = payload ? [
    { key: "all", label: "全部", value: payload.works.totals.all },
    { key: "favorite", label: "收藏", value: payload.works.totals.favorite },
    { key: "used", label: "已用", value: payload.works.totals.used },
    { key: "unused", label: "未用", value: payload.works.totals.unused },
    { key: "noted", label: "已备注", value: payload.works.totals.noted },
  ] satisfies Array<{ key: StatusFilter; label: string; value: number }> : [];

  const lastSevenDaysCount = countRecentWorks(items, 7);
  const calendarMonths = buildCalendarMonths(items, 3);

  if (loadState === "loading") {
    return <div className="pageStack"><section className="panel emptyState">正在加载作品页...</section></div>;
  }

  if (loadState === "error" || !payload) {
    return <div className="pageStack"><section className="panel emptyState">作品数据暂不可用，请刷新后重试。</section></div>;
  }

  return (
    <div className="pageStack creationWorksPageReset">
      <section className="workspaceHubHero creationWorksHeroReset">
        <div className="workspaceHubHeroIcon" aria-hidden="true">💡</div>
        <div className="workspaceHubHeroCopy">
          <strong>{thinkingEntry.title}</strong>
          <p>{thinkingEntry.description}</p>
        </div>
        <div className="workspaceHubHeroActions">
          <a className="primaryButton linkButton workspaceHubHeroAction" href={thinkingEntry.href}>{thinkingEntry.actionLabel}</a>
        </div>
      </section>

      <div className="page-top-block creationWorksTopBlock">
        <header className="creation-page-header creationWorksPageHeaderReset">
          <p className="creation-page-subtitle">围绕获客增长的全场景 AI 内容创作应用</p>
          <a className="creation-guide-link creationWorksGuideReset" href={appPath("/benefits")}>使用攻略</a>
        </header>

        <div className="works-entry-banner works-entry-banner--active creationWorksBannerReset">
          <div className="works-entry-banner-left">
            <div className="works-entry-banner-icon" aria-hidden="true">✦</div>
            <div className="works-entry-banner-text-wrap">
              <span className="works-entry-banner-title">我的作品</span>
              <span className="works-entry-banner-desc">
                {items.length > 0 ? `共 ${payload.works.totals.all} 篇创作记录` : "还没有创作记录"}
              </span>
            </div>
          </div>
          <a className="works-switch-to-apps creationWorksBannerActionReset" href={appPath("/workspace")}>浏览创作应用</a>
        </div>
      </div>

      <div className="creationWorksContentReset">
        <aside className="creationWorksAsideReset">
          <section className="creation-stats-card creationWorksStatsCardReset">
            <div className="card-header creationWorksStatsHeaderReset">
              <div className="header-icon" aria-hidden="true">🏆</div>
              <div className="header-text">
                {lastSevenDaysCount > 0 ? (
                  <p className="stats-text">最近7天创作 <span className="highlight-number">{lastSevenDaysCount}</span> 次</p>
                ) : (
                  <p className="stats-text-empty">最近7天还没有创作，赶快开始吧~</p>
                )}
              </div>
            </div>

            <div className="creation-calendar creationWorksCalendarReset">
              {calendarMonths.map((month) => (
                <section className="month-container creationWorksMonthReset" key={month.key}>
                  <div className="month-title">{month.label}</div>
                  <div className="weekday-labels">
                    {weekdayLabels.map((day) => <span className="weekday-label" key={`${month.key}-${day}`}>{day}</span>)}
                  </div>
                  <div className="calendar-grid">
                    {Array.from({ length: month.offset }).map((_, index) => (
                      <div className="calendar-cell empty" key={`${month.key}-empty-${index}`} />
                    ))}
                    {month.days.map((day) => (
                      <div className={`calendar-cell ${calendarLevelClass(day.count)}`} data-date={day.date} key={day.date} title={`${day.date} 创作了 ${day.count} 篇`}>
                        <span>{day.day}</span>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </section>
        </aside>

        <section className="creationWorksMainReset">
          <div className="status-search-row creationWorksFiltersReset">
            <div className="status-tabs-line">
              <div className="status-filter-tabs creationWorksStatusTabsReset">
                {statusTabs.map((tab) => (
                  <button
                    className={statusFilter === tab.key ? "status-tab active" : "status-tab"}
                    key={tab.key}
                    onClick={() => setStatusFilter(tab.key)}
                    type="button"
                  >
                    <span>{tab.label}</span>
                    <strong>{tab.value}</strong>
                  </button>
                ))}
              </div>
            </div>

            <div className="app-filter-tags creationWorksAppTagsReset">
              {appTabs.map((tab) => (
                <button
                  className={appFilter === tab.value ? "filter-tag active" : "filter-tag"}
                  key={tab.value}
                  onClick={() => setAppFilter(tab.value)}
                  type="button"
                >
                  {tab.label} ({appCounts[tab.value]})
                </button>
              ))}
            </div>
          </div>

          {filteredItems.length === 0 ? (
            <div className="empty-state creationWorksEmptyReset">当前筛选下还没有作品，先去创作一条吧。</div>
          ) : (
            <div className="instances-container creationWorksInstancesReset">
              {filteredItems.map((item) => (
                <a className="instance-card creationWorksInstanceCardReset" href={appPath(`/works/${item.id}?from=creation-works&entry=${item.platform}`)} key={item.id}>
                  <div className="instance-main">
                    <div className="instance-row-1">
                      <div className={`status-badge status-${normalizeStatus(item.status)}`}>
                        <span className="status-text">{formatStatusLabel(item.status)}</span>
                      </div>
                      <div className="instance-title">{formatWorkTitle(item)}</div>
                    </div>

                    {item.note?.trim() ? (
                      <div className="instance-remark">
                        <span className="remark-text">{item.note.trim()}</span>
                      </div>
                    ) : null}

                    <p className="creationWorksInstancePreviewReset">{buildWorkPreview(item)}</p>

                    <div className="instance-row-2 creationWorksInstanceMetaReset">
                      <div className="meta-item">{formatDate(item.updatedAt)}</div>
                      <div className="meta-item app-icon">{platformEmoji(item.platform)} {formatPlatformLabel(item.platform)}</div>
                      <div className="meta-item credit-item">{platformPoints(item.platform)}</div>
                      {item.isFavorite ? <div className="meta-item">收藏</div> : null}
                      {item.isUsed ? <div className="meta-item">已用</div> : null}
                    </div>
                  </div>
                </a>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function buildWorkPreview(item: DraftItem) {
  const compact = item.content.replace(/\s+/g, " ").trim();
  return compact.slice(0, 120) || "这条作品暂时还没有可展示内容。";
}

function formatWorkTitle(item: DraftItem) {
  return item.title?.trim() || "未命名作品";
}

function formatPlatformLabel(platform: string) {
  if (platform === "write-copy") return "写文案";
  if (platform === "image-card") return "做图";
  if (platform === "lead-copy") return "写引流文案";
  if (platform === "video-script-polish") return "口播文案精修";
  if (platform === "wechat-article-polish") return "公众号文章精修";
  return platform;
}

function platformEmoji(platform: string) {
  if (platform === "write-copy") return "🎨";
  if (platform === "image-card") return "🪄";
  if (platform === "lead-copy") return "🌱";
  if (platform === "video-script-polish") return "🔮";
  if (platform === "wechat-article-polish") return "🖊️";
  return "📝";
}

function platformPoints(platform: string) {
  if (platform === "write-copy" || platform === "image-card" || platform === "lead-copy" || platform === "video-script-polish" || platform === "wechat-article-polish") {
    return "100 积分";
  }
  return "作品";
}

function formatStatusLabel(value?: string) {
  if (value === "succeeded") return "已完成";
  if (value === "published") return "已发布";
  if (value === "draft") return "草稿";
  return value || "作品";
}

function normalizeStatus(value?: string) {
  if (value === "succeeded" || value === "published") return "completed";
  if (value === "draft") return "pending";
  return "pending";
}

function formatDate(value?: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function countRecentWorks(items: DraftItem[], days: number) {
  const todayParts = getShanghaiTodayParts();
  const threshold = new Date(Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day));
  threshold.setUTCDate(threshold.getUTCDate() - (days - 1));

  return items.filter((item) => {
    if (!item.updatedAt) return false;
    const key = toShanghaiDateKey(new Date(item.updatedAt));
    if (!key) return false;
    return key >= toDateKey(threshold);
  }).length;
}

function buildCalendarMonths(items: DraftItem[], monthCount: number): CalendarMonth[] {
  const countsByDate = new Map<string, number>();
  for (const item of items) {
    if (!item.updatedAt) continue;
    const key = toShanghaiDateKey(new Date(item.updatedAt));
    if (!key) continue;
    countsByDate.set(key, (countsByDate.get(key) ?? 0) + 1);
  }

  const today = getShanghaiTodayParts();
  const months: CalendarMonth[] = [];

  for (let offset = monthCount - 1; offset >= 0; offset -= 1) {
    const current = new Date(Date.UTC(today.year, today.month - 1 - offset, 1));
    const year = current.getUTCFullYear();
    const month = current.getUTCMonth();
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const startDay = normalizeWeekday(new Date(Date.UTC(year, month, 1)).getUTCDay());

    const days: CalendarDay[] = [];
    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(Date.UTC(year, month, day));
      const key = toDateKey(date);
      days.push({ date: key, day, count: countsByDate.get(key) ?? 0 });
    }

    months.push({
      key: `${year}-${month + 1}`,
      label: `${month + 1}月`,
      offset: startDay,
      days,
    });
  }

  return months;
}

function normalizeWeekday(day: number) {
  return day === 0 ? 6 : day - 1;
}

function toDateKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function toShanghaiDateKey(date: Date) {
  if (Number.isNaN(date.getTime())) return null;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
}

function getShanghaiTodayParts() {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(new Date());
  const map = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
  };
}

function calendarLevelClass(count: number) {
  if (count >= 3) return "level-3";
  if (count === 2) return "level-2";
  if (count === 1) return "level-1";
  return "level-0";
}
