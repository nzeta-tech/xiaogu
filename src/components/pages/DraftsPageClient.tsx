"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { apiPath, appPath } from "@/lib/client/url";
import { parseCreationOutput } from "@/lib/creation/output";

type StatusFilter = "all" | "favorite" | "noted" | "avatar";
type SortMode = "updated-desc" | "updated-asc" | "created-desc";
type ViewMode = "list" | "grid";
type LoadState = "loading" | "ready" | "error";

type DraftItem = {
  id: string;
  title: string;
  content: string;
  platform: string;
  status: string;
  complianceRisk?: string;
  createdAt?: string;
  updatedAt?: string;
  note?: string;
  isFavorite?: boolean;
  isUsed?: boolean;
  appRunStatus?: string;
  errorMessage?: string;
  quotaCost?: number;
  imageUrl?: string;
  usesAvatarVisual?: boolean;
};

type WorksData = {
  totals: { all: number; favorite: number; noted: number; avatar: number };
  pagination: { page: number; pageSize: number; total: number; hasMore: boolean };
  platforms: Array<{ platform: string; count: number }>;
  activity: Array<{ date: string; count: number }>;
  items: DraftItem[];
};

type WorksPayload = { works: WorksData };

const statusOptions: Array<{ value: StatusFilter; label: string; totalKey?: keyof WorksData["totals"] }> = [
  { value: "all", label: "全部", totalKey: "all" },
  { value: "favorite", label: "已收藏", totalKey: "favorite" },
  { value: "noted", label: "有备注", totalKey: "noted" },
  { value: "avatar", label: "含本人形象", totalKey: "avatar" },
];

export function DraftsPageClient() {
  const [data, setData] = useState<WorksData | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [sort, setSort] = useState<SortMode>("updated-desc");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [actionError, setActionError] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [noteItem, setNoteItem] = useState<DraftItem | null>(null);
  const [noteValue, setNoteValue] = useState("");
  const [undoItem, setUndoItem] = useState<DraftItem | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setIsMounted(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const loadWorks = useCallback(async (page: number, append = false) => {
    if (append) setLoadingMore(true);
    else setLoadState("loading");
    setActionError("");
    const params = new URLSearchParams({
      view: "works",
      page: String(page),
      pageSize: "20",
      state: statusFilter,
      platform: platformFilter,
      sort,
    });
    if (search) params.set("search", search);
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo) params.set("to", dateTo);

    try {
      const response = await fetch(apiPath(`/api/creation/hub?${params.toString()}`), {
        credentials: "include",
        cache: "no-store",
      });
      const payload = await response.json() as WorksPayload & { error?: string };
      if (!response.ok || !payload.works) throw new Error(payload.error || "作品数据暂不可用");
      setData((current) => append && current
        ? { ...payload.works, items: [...current.items, ...payload.works.items] }
        : payload.works);
      setSelectedIds(new Set());
      setLoadState("ready");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "作品数据暂不可用");
      if (!append) setLoadState("error");
    } finally {
      setLoadingMore(false);
    }
  }, [dateFrom, dateTo, platformFilter, search, sort, statusFilter]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void loadWorks(1));
    return () => window.cancelAnimationFrame(frame);
  }, [loadWorks]);

  async function patchWork(item: DraftItem, body: Record<string, unknown>) {
    setActionError("");
    const response = await fetch(apiPath(`/api/works/${item.id}`), {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({})) as { error?: string };
      setActionError(result.error ?? "作品更新失败");
      return false;
    }
    setData((current) => {
      if (!current) return current;
      const existing = current.items.find((work) => work.id === item.id);
      if (!existing) return current;
      const nextItem = { ...existing, ...body };
      return {
        ...current,
        totals: adjustTotals(current.totals, existing, nextItem),
        items: current.items.map((work) => work.id === item.id ? nextItem : work),
      };
    });
    return true;
  }

  async function archiveWork(item: DraftItem) {
    setOpenMenuId(null);
    setActionError("");
    const response = await fetch(apiPath(`/api/works/${item.id}`), { method: "DELETE" });
    if (!response.ok) {
      const result = await response.json().catch(() => ({})) as { error?: string };
      setActionError(result.error ?? "作品归档失败");
      return false;
    }
    setData((current) => current ? {
      ...current,
      totals: subtractItemFromTotals(current.totals, item),
      platforms: current.platforms
        .map((entry) => entry.platform === item.platform ? { ...entry, count: Math.max(0, entry.count - 1) } : entry)
        .filter((entry) => entry.count > 0),
      pagination: { ...current.pagination, total: Math.max(0, current.pagination.total - 1) },
      items: current.items.filter((work) => work.id !== item.id),
    } : current);
    setSelectedIds((current) => {
      const next = new Set(current);
      next.delete(item.id);
      return next;
    });
    setUndoItem(item);
    return true;
  }

  async function undoArchive() {
    if (!undoItem) return;
    const item = undoItem;
    setUndoItem(null);
    const restored = await patchWork(item, { status: item.isUsed ? "used" : "draft", isUsed: Boolean(item.isUsed) });
    if (restored) await loadWorks(1);
  }

  function openNoteEditor(item: DraftItem) {
    setOpenMenuId(null);
    setNoteItem(item);
    setNoteValue(item.note ?? "");
  }

  async function saveNote() {
    if (!noteItem) return;
    if (await patchWork(noteItem, { note: noteValue.trim() })) setNoteItem(null);
  }

  async function runBatch() {
    if (!data || selectedIds.size === 0) return;
    setBatchBusy(true);
    const selected = data.items.filter((item) => selectedIds.has(item.id));
    for (const item of selected) await archiveWork(item);
    setSelectedIds(new Set());
    setBatchBusy(false);
    await loadWorks(1);
  }

  const recentCount = useMemo(() => countRecentActivity(data?.activity ?? [], 7), [data?.activity]);
  const calendarMonths = useMemo(() => buildCalendarMonths(data?.activity ?? [], 3), [data?.activity]);
  const allVisibleSelected = Boolean(data?.items.length) && data!.items.every((item) => selectedIds.has(item.id));

  if (loadState === "loading" && !data) {
    return <div className="creationHistoryPage"><div className="creationHistoryLoading">正在整理创作历史...</div></div>;
  }

  if (loadState === "error" || !data) {
    return (
      <div className="creationHistoryPage">
        <div className="creationHistoryEmpty"><strong>暂时无法加载作品</strong><span>{actionError || "请稍后重试"}</span><button type="button" onClick={() => void loadWorks(1)}>重新加载</button></div>
      </div>
    );
  }

  const filterPanel = (
    <div className={filtersOpen ? "creationHistoryFilterDrawer open" : "creationHistoryFilterDrawer"} onClick={(event) => event.stopPropagation()}>
      <div className="creationHistoryDrawerHeader"><strong>筛选作品</strong><button type="button" aria-label="关闭筛选" onClick={() => setFiltersOpen(false)}>×</button></div>
      <div className="creationHistoryStatusFilters">
        {statusOptions.map((option) => (
          <button className={statusFilter === option.value ? "active" : ""} key={option.value} type="button" onClick={() => setStatusFilter(option.value)}>
            {option.label}<span>{option.totalKey ? data.totals[option.totalKey] : 0}</span>
          </button>
        ))}
      </div>
      <div className="creationHistoryAdvancedFilters">
        <label><span>创作应用</span><select value={platformFilter} onChange={(event) => setPlatformFilter(event.target.value)}><option value="all">全部应用</option>{data.platforms.map((item) => <option value={item.platform} key={item.platform}>{formatPlatformLabel(item.platform)} ({item.count})</option>)}</select></label>
        <label><span>排序</span><select value={sort} onChange={(event) => setSort(event.target.value as SortMode)}><option value="updated-desc">最近更新</option><option value="updated-asc">最早更新</option><option value="created-desc">最近创建</option></select></label>
        <label><span>开始日期</span><input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label>
        <label><span>结束日期</span><input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label>
      </div>
      <div className="creationHistoryDrawerFooter"><button type="button" onClick={() => { setPlatformFilter("all"); setStatusFilter("all"); setSort("updated-desc"); setDateFrom(""); setDateTo(""); }}>重置</button><button type="button" onClick={() => setFiltersOpen(false)}>查看结果</button></div>
    </div>
  );

  return (
    <div className="creationHistoryPage" onClick={() => openMenuId && setOpenMenuId(null)}>
      <header className="creationHistoryHeader">
        <div>
          <h1>创作历史 <span>· {data.totals.all} 个作品</span></h1>
          <p>集中查找、整理和发布你的创作内容</p>
        </div>
        <a className="creationHistoryPrimary" href={appPath("/create")}><span aria-hidden="true">＋</span> 新建内容</a>
      </header>

      <section className="creationHistoryToolbar" aria-label="作品筛选">
        <div className="creationHistorySearchRow">
          <label className="creationHistorySearch">
            <span aria-hidden="true">⌕</span>
            <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="搜索标题、正文或备注" aria-label="搜索作品" />
            {searchInput ? <button type="button" aria-label="清空搜索" title="清空搜索" onClick={() => setSearchInput("")}>×</button> : null}
          </label>
          <button className="creationHistoryFilterButton" type="button" onClick={() => setFiltersOpen(true)}><span aria-hidden="true">☷</span> 筛选</button>
          <div className="creationHistoryViewSwitch" aria-label="视图方式">
            <button className={viewMode === "list" ? "active" : ""} type="button" title="列表视图" aria-label="列表视图" onClick={() => setViewMode("list")}>☰</button>
            <button className={viewMode === "grid" ? "active" : ""} type="button" title="网格视图" aria-label="网格视图" onClick={() => setViewMode("grid")}>▦</button>
          </div>
        </div>
      </section>

      {filtersOpen && isMounted ? createPortal(<>{filterPanel}<button className="creationHistoryDrawerBackdrop" type="button" aria-label="关闭筛选" onClick={() => setFiltersOpen(false)} /></>, document.body) : filterPanel}

      <details className="creationHistoryStats" open={statsOpen} onToggle={(event) => setStatsOpen(event.currentTarget.open)}>
        <summary><span><strong>创作统计</strong> 最近 7 天创作 {recentCount} 次</span><span aria-hidden="true">⌄</span></summary>
        <div className="creationHistoryCalendar">
          {calendarMonths.map((month) => <CalendarMonthView key={month.key} month={month} />)}
        </div>
      </details>

      {actionError ? <div className="creationHistoryAlert">{actionError}</div> : null}

      <div className="creationHistoryListBar">
        <label><input type="checkbox" checked={allVisibleSelected} onChange={() => setSelectedIds(allVisibleSelected ? new Set() : new Set(data.items.map((item) => item.id)))} /> 选择本页</label>
        <span>找到 {data.pagination.total} 个作品</span>
      </div>

      {selectedIds.size > 0 ? (
        <div className="creationHistoryBatchBar">
          <strong>已选 {selectedIds.size} 项</strong>
          <button className="danger" type="button" disabled={batchBusy} onClick={() => void runBatch()}>归档</button>
          <button type="button" aria-label="取消选择" title="取消选择" onClick={() => setSelectedIds(new Set())}>×</button>
        </div>
      ) : null}

      {data.items.length === 0 ? (
        <div className="creationHistoryEmpty"><strong>没有找到匹配的作品</strong><span>调整搜索或筛选条件后再试试</span><button type="button" onClick={() => { setSearchInput(""); setStatusFilter("all"); setPlatformFilter("all"); setDateFrom(""); setDateTo(""); }}>清除筛选</button></div>
      ) : (
        <div className={`creationHistoryItems ${viewMode}`}>
          {data.items.map((item) => (
            <WorkCard
              item={item}
              key={item.id}
              selected={selectedIds.has(item.id)}
              menuOpen={openMenuId === item.id}
              onSelect={() => setSelectedIds((current) => toggleSetValue(current, item.id))}
              onFavorite={() => void patchWork(item, { isFavorite: !item.isFavorite })}
              onMenu={() => setOpenMenuId(openMenuId === item.id ? null : item.id)}
              onNote={() => openNoteEditor(item)}
              onArchive={() => void archiveWork(item)}
            />
          ))}
        </div>
      )}

      {data.pagination.hasMore ? <button className="creationHistoryLoadMore" type="button" disabled={loadingMore} onClick={() => void loadWorks(data.pagination.page + 1, true)}>{loadingMore ? "正在加载..." : "加载更多"}</button> : null}

      {noteItem ? (
        <div className="creationHistoryModalBackdrop" role="presentation" onMouseDown={() => setNoteItem(null)}>
          <section className="creationHistoryNoteModal" role="dialog" aria-modal="true" aria-labelledby="note-dialog-title" onMouseDown={(event) => event.stopPropagation()}>
            <header><div><strong id="note-dialog-title">作品备注</strong><span>{formatWorkTitle(noteItem)}</span></div><button type="button" aria-label="关闭" onClick={() => setNoteItem(null)}>×</button></header>
            <textarea autoFocus maxLength={500} value={noteValue} onChange={(event) => setNoteValue(event.target.value)} placeholder="记录发布渠道、修改建议或后续计划..." />
            <footer><span>{noteValue.length}/500</span><button type="button" onClick={() => setNoteItem(null)}>取消</button><button className="primary" type="button" onClick={() => void saveNote()}>保存备注</button></footer>
          </section>
        </div>
      ) : null}

      {undoItem ? <div className="creationHistoryToast" role="status"><span>作品已归档</span><button type="button" onClick={() => void undoArchive()}>撤销</button><button type="button" aria-label="关闭提示" onClick={() => setUndoItem(null)}>×</button></div> : null}
    </div>
  );
}

function WorkCard(props: {
  item: DraftItem;
  selected: boolean;
  menuOpen: boolean;
  onSelect: () => void;
  onFavorite: () => void;
  onMenu: () => void;
  onNote: () => void;
  onArchive: () => void;
}) {
  const { item } = props;
  const href = appPath(`/works/${item.id}?from=creation-works&entry=${item.platform}`);
  const openItem = (event: React.MouseEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest("a,button,input")) return;
    window.location.href = href;
  };
  return (
    <article className={props.selected ? "creationHistoryItem selected" : "creationHistoryItem"} onClick={openItem}>
      <div className="creationHistorySelect"><input type="checkbox" checked={props.selected} onChange={props.onSelect} aria-label={`选择 ${formatWorkTitle(item)}`} /></div>
      <div className={item.imageUrl ? "creationHistoryThumb image" : "creationHistoryThumb"}>
        {item.imageUrl ? <span className="creationHistoryThumbImage" style={{ backgroundImage: `url(${JSON.stringify(item.imageUrl).slice(1, -1)})` }} aria-hidden="true" /> : <span aria-hidden="true">{platformSymbol(item.platform)}</span>}
      </div>
      <div className="creationHistoryItemBody">
        <div className="creationHistoryItemTitleRow"><a href={href}>{formatWorkTitle(item)}</a>{item.appRunStatus === "failed" ? <span className="pending">生成失败</span> : null}</div>
        <div className="creationHistoryItemMeta"><span>{buildWorkDescriptor(item)}</span><span>{formatRelativeDate(item.updatedAt)}</span>{item.quotaCost ? <span>{item.quotaCost} 积分</span> : null}</div>
        <p>{buildWorkPreview(item)}</p>
        <div className="creationHistoryItemTags">
          {item.appRunStatus === "failed" && item.errorMessage?.trim() ? <span className="risk high" title={item.errorMessage.trim()}>失败原因：{truncateText(item.errorMessage.trim(), 28)}</span> : null}
          {item.usesAvatarVisual ? <span>本人形象</span> : null}
          {formatRisk(item.complianceRisk) ? <span className={`risk ${normalizeRisk(item.complianceRisk)}`}>{formatRisk(item.complianceRisk)}</span> : null}
          {item.note?.trim() ? <button type="button" onClick={props.onNote}>备注：{item.note.trim()}</button> : null}
        </div>
      </div>
      <div className="creationHistoryItemActions">
        <button className={item.isFavorite ? "favorite active" : "favorite"} type="button" aria-label={item.isFavorite ? "取消收藏" : "收藏"} title={item.isFavorite ? "取消收藏" : "收藏"} onClick={props.onFavorite}>{item.isFavorite ? "★" : "☆"}</button>
        <div className="creationHistoryMore">
          <button type="button" aria-label="更多操作" title="更多操作" onClick={(event) => { event.stopPropagation(); props.onMenu(); }}>⋯</button>
          {props.menuOpen ? <div className="creationHistoryMoreMenu" onClick={(event) => event.stopPropagation()}><button type="button" onClick={props.onNote}>编辑备注</button><button className="danger" type="button" onClick={props.onArchive}>归档作品</button></div> : null}
        </div>
      </div>
    </article>
  );
}

type CalendarMonth = { key: string; label: string; offset: number; days: Array<{ date: string; day: number; count: number }> };

function CalendarMonthView({ month }: { month: CalendarMonth }) {
  return <section><strong>{month.label}</strong><div className="weekdays">{["一", "二", "三", "四", "五", "六", "日"].map((day) => <span key={day}>{day}</span>)}</div><div className="days">{Array.from({ length: month.offset }).map((_, index) => <i key={`empty-${index}`} />)}{month.days.map((day) => <i className={`level-${Math.min(3, day.count)}`} title={`${day.date} 创作 ${day.count} 次`} key={day.date}>{day.day}</i>)}</div></section>;
}

function toggleSetValue(current: Set<string>, value: string) {
  const next = new Set(current);
  if (next.has(value)) next.delete(value); else next.add(value);
  return next;
}

function adjustTotals(totals: WorksData["totals"], before: DraftItem, after: DraftItem) {
  return {
    ...totals,
    favorite: totals.favorite + Number(Boolean(after.isFavorite)) - Number(Boolean(before.isFavorite)),
    noted: totals.noted + Number(Boolean(after.note?.trim())) - Number(Boolean(before.note?.trim())),
  };
}

function subtractItemFromTotals(totals: WorksData["totals"], item: DraftItem) {
  return {
    all: Math.max(0, totals.all - 1),
    favorite: Math.max(0, totals.favorite - Number(Boolean(item.isFavorite))),
    noted: Math.max(0, totals.noted - Number(Boolean(item.note?.trim()))),
    avatar: Math.max(0, totals.avatar - Number(Boolean(item.usesAvatarVisual))),
  };
}

function buildWorkPreview(item: DraftItem) {
  if (item.appRunStatus === "failed" && !item.content.trim()) {
    return item.errorMessage?.trim() || "这条作品生成失败，可点进详情查看原因后再重试。";
  }
  const summary = buildWorkSummary(item);
  if (summary) return summary;
  return sanitizePreviewText(item.content).slice(0, 180) || "这条作品暂时还没有可展示内容。";
}

function truncateText(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, Math.max(1, maxLength - 1))}…` : value;
}

function formatWorkTitle(item: DraftItem) {
  return item.title?.trim() || "未命名作品";
}

function formatPlatformLabel(platform: string) {
  const labels: Record<string, string> = {
    "write-copy": "写文案", "image-card": "做图", "wechat-images": "公众号配图", "policy-renewal-card": "续保提醒卡", "lead-copy": "引流文案",
    "traffic-copy": "流量文案", "marketing-copy": "营销文案", "video-script-polish": "口播精修",
    "wechat-article-polish": "公众号精修", "topic-picker": "热点选题", "general-content": "通用创作",
    "xiaohongshu-check": "小红书合规检测", letter: "信件创作",
  };
  return labels[platform] || "其他创作";
}

function buildWorkDescriptor(item: DraftItem) {
  const imageDescriptor = buildImageDescriptor(item);
  if (imageDescriptor) return imageDescriptor;

  const outputDescriptor = buildOutputDescriptor(item.content);
  if (outputDescriptor) return `${formatPlatformLabel(item.platform)} · ${outputDescriptor}`;

  return formatPlatformLabel(item.platform);
}

function buildImageDescriptor(item: DraftItem) {
  if (!["image-card", "wechat-images", "policy-renewal-card"].includes(item.platform)) return "";
  const style = extractLabeledValue(item.content, "风格");
  const ratio = extractLabeledValue(item.content, "比例");
  const pieces = [style ? formatImageStyleLabel(style) : "", ratio].filter(Boolean);
  if (pieces.length > 0) return `${formatPlatformLabel(item.platform)} · ${pieces.join(" · ")}`;
  return formatPlatformLabel(item.platform);
}

function buildOutputDescriptor(content: string) {
  const parsed = parseCreationOutput(content);
  const labels = Array.from(new Set(parsed.batches.map((batch) => normalizeDescriptorLabel(batch.label)).filter(Boolean)));
  if (labels.length === 0) return "";
  if (labels.length <= 3) return labels.join(" / ");
  return `${labels.slice(0, 3).join(" / ")} 等`;
}

function buildWorkSummary(item: DraftItem) {
  if (["image-card", "wechat-images", "policy-renewal-card"].includes(item.platform)) {
    const imageSummary = buildImageSummary(item.content);
    if (imageSummary) return imageSummary;
  }

  const parsed = parseCreationOutput(item.content);
  for (const batch of parsed.batches) {
    for (const outputItem of batch.items) {
      const summary = sanitizePreviewText(outputItem.summary || outputItem.body);
      if (summary && !isWeakPreview(summary, batch.label)) {
        return summary.slice(0, 180);
      }
    }
  }

  return "";
}

function buildImageSummary(content: string) {
  const source = extractBlockAfterLabel(content, "图片文案底稿");
  if (source) return sanitizePreviewText(source).slice(0, 180);

  const articlePlan = extractBlockAfterLabel(content, "文章配图方案");
  if (articlePlan) return sanitizePreviewText(articlePlan).slice(0, 180);

  const cardPlan = extractBlockAfterLabel(content, "图片卡片方案");
  if (cardPlan) return sanitizePreviewText(cardPlan).slice(0, 180);

  return "";
}

function extractLabeledValue(content: string, label: string) {
  const match = content.match(new RegExp(`(?:^|\\n)${label}[：:]\\s*(.+)`, "i"));
  return match?.[1]?.split("\n")[0]?.trim() ?? "";
}

function extractBlockAfterLabel(content: string, label: string) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = content.match(new RegExp(`(?:^|\\n)${escapedLabel}[：:]?\\s*\\n([\\s\\S]+?)(?=\\n(?:[\\u4e00-\\u9fa5A-Za-z_ ]+[：:]|补充设置[：:]?)|$)`));
  return match?.[1]?.trim() ?? "";
}

function formatImageStyleLabel(style: string) {
  const labels: Record<string, string> = {
    illustration: "手绘插画",
    whiteboard: "白板手写",
    zen: "东方禅意",
    "line-illustration": "线稿插画",
    luxury: "高端质感",
    magazine: "杂志风格",
    graffiti: "城市涂鸦",
    "event-stage": "演讲现场",
    "handwritten-notes": "手写笔记",
    clay: "立体粘土",
    "minimal-drawing": "极简手绘",
    business: "商务风格",
    blackboard: "黑板报",
    "flat-knowledge": "扁平知识",
    morandi: "莫兰迪",
    "science-sketch": "科普手绘",
    "dark-pro": "深色专业",
    "fresh-card": "清爽卡片",
    "daily-sign": "质感日签",
    study: "学霸笔记",
    "large-sign": "大字日签",
    "black-white": "黑白调",
    scrapbook: "手账拼贴",
    "white-orange-blue": "白橙蓝简约",
    daily: "日报风格",
    custom: "自定义风格",
  };
  return labels[style] ?? style;
}

function normalizeDescriptorLabel(value: string) {
  return value
    .replace(/^[一二三四五六七八九十0-9]+[、.）)]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizePreviewText(value: string) {
  return value
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/[#*_>`~\[\]]/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isWeakPreview(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized) return true;
  if (normalized === normalizeDescriptorLabel(label)) return true;
  if (normalized.length < 10) return true;
  if (/^(生成内容|创作结果|分析报告|精修报告|精修说明|图片卡片方案|文章配图方案)$/.test(normalized)) return true;
  return false;
}

function platformSymbol(platform: string) {
  if (platform === "policy-renewal-card") return "续";
  if (platform.includes("image")) return "图";
  if (platform.includes("check")) return "检";
  if (platform.includes("topic")) return "题";
  return "文";
}

function formatRelativeDate(value?: string) {
  if (!value) return "时间未知";
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  if (diff >= 0 && diff < 60 * 60 * 1000) return `${Math.max(1, Math.floor(diff / 60000))} 分钟前`;
  if (diff >= 0 && diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)} 小时前`;
  if (diff >= 0 && diff < 7 * 24 * 60 * 60 * 1000) return `${Math.floor(diff / 86400000)} 天前`;
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function normalizeRisk(value?: string) {
  if (value === "high" || value === "blocked") return "high";
  if (value === "medium" || value === "warning") return "medium";
  return "low";
}

function formatRisk(value?: string) {
  if (!value || value === "unchecked") return "";
  if (value === "high" || value === "blocked") return "高风险";
  if (value === "medium" || value === "warning") return "需复核";
  if (value === "low" || value === "passed" || value === "safe") return "合规通过";
  return "";
}

function countRecentActivity(activity: WorksData["activity"], days: number) {
  const threshold = new Date();
  threshold.setHours(0, 0, 0, 0);
  threshold.setDate(threshold.getDate() - (days - 1));
  return activity.filter((item) => new Date(`${item.date}T00:00:00+08:00`) >= threshold).reduce((total, item) => total + item.count, 0);
}

function buildCalendarMonths(activity: WorksData["activity"], monthCount: number): CalendarMonth[] {
  const counts = new Map(activity.map((item) => [item.date, item.count]));
  const now = new Date();
  const months: CalendarMonth[] = [];
  for (let offset = monthCount - 1; offset >= 0; offset -= 1) {
    const current = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const year = current.getFullYear();
    const month = current.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const start = current.getDay() === 0 ? 6 : current.getDay() - 1;
    const days = Array.from({ length: daysInMonth }, (_, index) => {
      const day = index + 1;
      const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      return { date, day, count: counts.get(date) ?? 0 };
    });
    months.push({ key: `${year}-${month}`, label: `${year} 年 ${month + 1} 月`, offset: start, days });
  }
  return months;
}
