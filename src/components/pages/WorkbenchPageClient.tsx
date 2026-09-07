"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { apiPath, appPath } from "@/lib/client/url";
import { isSupportedLinkRemixUrl } from "@/lib/creation/link-remix-source";
import type { HotTopic } from "@/lib/topics/types";
import { saveCreationHandoff } from "@/lib/client/creation-handoff";
import type { ViralExample } from "@/lib/viral-examples";

type Overview = {
  balance: number;
  draftCount: number;
  paidOrders: number;
  pendingOrders: number;
  totalUsed: number;
  weeklyDraftCount: number;
  weeklyUsed: number;
  topics: HotTopic[];
  topicsRefreshedAt: string | null;
  topicsStale: boolean;
  topicsIngestionReady?: boolean;
  recentDrafts: Array<{ id: string; title: string; platform: string; updated_at?: string }>;
  recentUsage: Array<{ id: string; action_type: string; quota_cost: number; created_at: string }>;
  recentOrders: Array<{ id: string; status: string; amount_cents: number; currency: string; created_at: string }>;
  announcements: Array<{ id: string; title: string; content: string; kind: string; link_url?: string | null }>;
  recentGifts: Array<{ id: string; source_label: string; quota_amount: number; created_at: string }>;
};

const TOPIC_INITIAL_LIMIT = 24;
const TOPIC_BATCH_SIZE = 24;
const TOPIC_MAX_PER_TAB = 200;
const VIRAL_ITEMS_PER_ROW = 6;
const financeFilters = ["全部", "市场波动", "家庭钱袋", "政策机会", "公司行业", "港美财经"] as const;
type FinanceFilter = typeof financeFilters[number];

export function WorkbenchPageClient() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [overviewError, setOverviewError] = useState(false);
  const [viralExamples, setViralExamples] = useState<ViralExample[]>([]);
  const [viralMeta, setViralMeta] = useState({ degraded: false, stale: false, loading: true });
  const [viralPlatform, setViralPlatform] = useState<"全部" | ViralExample["platform"]>("全部");
  const [selectedArticle, setSelectedArticle] = useState<ViralExample | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<HotTopic | null>(null);
  const [topicTab, setTopicTab] = useState<"热点" | "财经" | "香港" | "国际">("热点");
  const [financeFilter, setFinanceFilter] = useState<FinanceFilter>("全部");
  const [visibleTopicLimit, setVisibleTopicLimit] = useState(TOPIC_INITIAL_LIMIT);
  const [viralVisibleRows, setViralVisibleRows] = useState(1);
  const [linkRemixAvailable, setLinkRemixAvailable] = useState<boolean | null>(null);
  const topicMasonryRef = useRef<HTMLDivElement>(null);
  const topicMasonryArrangeRef = useRef<() => void>(() => undefined);

  async function loadOverview(signal?: AbortSignal) {
    try {
      setLoading(true);
      const response = await fetch(apiPath("/api/workbench/overview"), { signal });
      const payload = (await response.json()) as { overview?: Overview };
      if (!response.ok) throw new Error("workbench_overview_unavailable");
      setOverview(payload.overview ?? null);
      setOverviewError(false);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setOverviewError(true);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadOverview(controller.signal);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    let active = true;
    async function loadLinkRemixAvailability() {
      try {
        const response = await fetch(apiPath("/api/creation/link-remix/availability"), { cache: "no-store" });
        const payload = await response.json().catch(() => ({})) as { available?: boolean };
        if (active) setLinkRemixAvailable(response.ok && payload.available === true);
      } catch {
        if (active) setLinkRemixAvailable(false);
      }
    }
    void loadLinkRemixAvailability();
    const timer = window.setInterval(() => void loadLinkRemixAvailability(), 15000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let active = true;
    async function loadViralExamples() {
      try {
        const response = await fetch(apiPath("/api/source-library"), { cache: "no-store" });
        if (!response.ok) throw new Error(`viral_examples_${response.status}`);
        const payload = (await response.json()) as { items?: ViralExample[]; degraded?: boolean; stale?: boolean };
        if (!active) return;
        setViralExamples(payload.items ?? []);
        setViralMeta({ degraded: Boolean(payload.degraded), stale: Boolean(payload.stale), loading: false });
      } catch {
        if (!active) return;
        setViralExamples([]);
        setViralMeta({ degraded: true, stale: false, loading: false });
      }
    }
    void loadViralExamples();
    const timer = window.setInterval(() => void loadViralExamples(), 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const topics = overview?.topics ?? [];
  const topicTabs = ["热点", "财经", "香港", "国际"] as const;
  const topicTabItems = topics
    .filter((topic) => getTopicTab(topic) === topicTab)
    .filter((topic) => topicTab !== "财经" || matchesFinanceFilter(topic, financeFilter))
    .sort((left, right) => compareTopicsForDisplay(left, right, topicTab));
  const visibleTopicTabItems = topicTabItems.slice(0, Math.min(visibleTopicLimit, TOPIC_MAX_PER_TAB));
  const topTopicItems = visibleTopicTabItems.slice(0, 10);
  const masonryTopicItems = visibleTopicTabItems.slice(10);
  const viralPlatforms = ["全部", ...Array.from(new Set(viralExamples.map((item) => item.platform))).sort()] as Array<"全部" | ViralExample["platform"]>;
  const activeViralPlatform = viralPlatforms.includes(viralPlatform) ? viralPlatform : "全部";
  const rankedViralExamples = viralExamples
    .filter((item) => activeViralPlatform === "全部" || item.platform === activeViralPlatform)
    .sort((a, b) => {
      const topicMatch = (item: ViralExample) => selectedTopic && item.category === selectedTopic.category ? 1 : 0;
      const stockTradingRank = (item: ViralExample) => isPureStockTradingViral(item) ? 1 : 0;
      return (stockTradingRank(a) - stockTradingRank(b))
        || (topicMatch(b) - topicMatch(a))
        || (Number(Boolean(b.isManual)) - Number(Boolean(a.isManual)))
        || Number(b.viralScore ?? b.metricValue ?? 0) - Number(a.viralScore ?? a.metricValue ?? 0);
    });
  const filteredViralExamples = activeViralPlatform === "全部"
    ? diversifyViralPlatforms(rankedViralExamples)
    : rankedViralExamples;
  const visibleViralExamples = filteredViralExamples.slice(0, viralVisibleRows * VIRAL_ITEMS_PER_ROW);
  const platformCount = (platform: typeof activeViralPlatform) => platform === "全部" ? viralExamples.length : viralExamples.filter((item) => item.platform === platform).length;

  useEffect(() => {
    const list = topicMasonryRef.current;
    if (!list) return;
    const arrange = () => {
      const cards = Array.from(list.querySelectorAll<HTMLElement>(".todayOpportunityRow"));
      const width = list.clientWidth;
      const columns = width <= 640 ? 1 : width <= 900 ? 2 : 3;
      const gap = width <= 640 ? 10 : 14;
      const columnWidth = (width - gap * (columns - 1)) / columns;
      const heights = Array.from({ length: columns }, () => 0);
      cards.forEach((card) => {
        card.style.width = `${columnWidth}px`;
        card.style.position = "absolute";
        card.style.gridRowEnd = "";
      });
      cards.forEach((card) => {
        const column = heights.indexOf(Math.min(...heights));
        card.style.transform = `translate(${column * (columnWidth + gap)}px, ${heights[column]}px)`;
        heights[column] += card.offsetHeight + gap;
      });
      list.style.height = `${Math.max(0, ...heights) - gap}px`;
    };
    topicMasonryArrangeRef.current = () => requestAnimationFrame(arrange);
    const frame = requestAnimationFrame(arrange);
    const observer = new ResizeObserver(() => requestAnimationFrame(arrange));
    Array.from(list.querySelectorAll<HTMLElement>(".todayOpportunityRow")).forEach((card) => observer.observe(card));
    window.addEventListener("resize", arrange);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      topicMasonryArrangeRef.current = () => undefined;
      window.removeEventListener("resize", arrange);
    };
  }, [topicTab, financeFilter, masonryTopicItems]);

  return (
    <div className={`pageStack workbenchPage todayDiscoveryPage ${viralVisibleRows > 1 ? "viralExpanded" : ""}`}>
      <section className="viralExamplesSection todayViralPanel" aria-labelledby="viral-examples-title">
        <div className="workbenchSectionHeader viralExamplesHeader">
          <div>
            <h2 id="viral-examples-title">爆款</h2>
          </div>
          <div className="todayViralHeaderControls">
            <div className="viralPlatformTabs" role="tablist" aria-label="来源平台">
              {viralPlatforms.map((platform) => <button key={platform} role="tab" aria-selected={activeViralPlatform === platform} className={activeViralPlatform === platform ? "active" : ""} onClick={() => { setViralPlatform(platform); setViralVisibleRows(1); }}><span>{platform}</span><em>{platformCount(platform)}</em></button>)}
            </div>
            {selectedTopic ? <button className="inspirationContext" onClick={() => setSelectedTopic(null)} title="清除热点关联">关联：{selectedTopic.title}<span aria-hidden="true">×</span></button> : null}
          </div>
        </div>
        {viralMeta.loading ? <div className="workbenchEmptyState"><strong>正在加载人工配置爆款</strong><span>正在整理已配置的短视频和爆文来源。</span></div> : filteredViralExamples.length > 0 ? <div className="viralExamplesContent"><div className="viralExamplesList">{visibleViralExamples.map((item) => <article className={`viralExampleCard ${getViralCardKind(item)} platform-${getViralPlatformClass(item.platform)}`} key={item.id}><ViralExampleCover item={item} /><div className="viralExampleMain">{item.type === "爆文" ? <button className="viralArticlePreview" onClick={() => setSelectedArticle(item)}><h3>{getViralDisplayTitle(item.title)}</h3></button> : <h3>{getViralDisplayTitle(item.title)}</h3>}{hasViralMeta(item) ? <div className="viralExampleAuthor">{item.authorName ? <><span aria-hidden="true">{getAuthorInitial(item)}</span><strong>{item.authorName}</strong></> : null}{item.metricValue ? <small>{`${item.metricValue.toLocaleString()}${item.metricUnit ?? ""}`}</small> : null}</div> : null}</div>{(linkRemixAvailable === true || item.remixCacheAvailable === true) && isSupportedLinkRemixUrl(item.sourceUrl) ? <div className="viralExampleActions"><a className="viralRemixButton" href={buildViralCreationHref(item)}>开始二创 <span aria-hidden="true">→</span></a></div> : null}</article>)}</div>{visibleViralExamples.length < filteredViralExamples.length || viralVisibleRows > 1 ? <div className="viralMoreActions">{visibleViralExamples.length < filteredViralExamples.length ? <button className="viralMoreButton" onClick={() => setViralVisibleRows((rows) => rows + 1)}>更多爆款 <span aria-hidden="true">↓</span></button> : null}{viralVisibleRows > 1 ? <button className="viralCollapseButton" onClick={() => setViralVisibleRows(1)}>收起展示 <span aria-hidden="true">↑</span></button> : null}</div> : null}</div> : viralMeta.degraded ? <div className="workbenchEmptyState"><strong>人工配置爆款暂时加载失败</strong><span>请刷新页面重试。</span></div> : <div className="workbenchEmptyState"><strong>暂时没有人工配置的内容</strong><span>可以在运营后台添加并发布爆款内容。</span></div>}
      </section>

      <section className="todayTopicsPanel" aria-labelledby="today-opportunity-title">
        <div className="todayOpportunityHeader">
          <div className="todayTopicHeaderMain">
            <h2 id="today-opportunity-title">热点灵感</h2>
            <div className="inspirationTopicTabs" role="tablist" aria-label="热点分类">
              {topicTabs.map((tab) => <button key={tab} role="tab" aria-selected={topicTab === tab} className={topicTab === tab ? "active" : ""} onClick={() => { setTopicTab(tab); setFinanceFilter("全部"); setVisibleTopicLimit(TOPIC_INITIAL_LIMIT); }}>{tab}<em>{Math.min(topics.filter((topic) => getTopicTab(topic) === tab).length, TOPIC_MAX_PER_TAB)}</em></button>)}
            </div>
          </div>
          {overview?.topicsRefreshedAt ? <time dateTime={overview.topicsRefreshedAt}>更新于 {formatDate(overview.topicsRefreshedAt)}</time> : null}
        </div>
        {topicTab === "财经" ? <div className="financeTopicFilters" role="group" aria-label="财经热点筛选">{financeFilters.map((filter) => <button key={filter} className={financeFilter === filter ? "active" : ""} onClick={() => { setFinanceFilter(filter); setVisibleTopicLimit(TOPIC_INITIAL_LIMIT); }}>{filter}</button>)}</div> : null}
        {loading ? (
          <div className="workbenchEmptyState"><strong>正在同步今日热点</strong><span>正在汇总热榜、搜索和保险相关性，通常需要几秒钟。</span></div>
        ) : overviewError ? (
          <div className="workbenchEmptyState"><strong>今日热点暂时加载失败</strong><span>请刷新页面重试，或先从个人画像生成一组选题。</span><a href={appPath("/apps/topic-picker?from=today&entry=topic-picker")}>先生成选题</a></div>
        ) : topicTabItems.length > 0 ? (
          <>
            <div className="todayTopTopicsList" aria-label={`${topicTab}前十热点`}>
              {topTopicItems.map((topic, index) => <article className="todayTopTopic" key={topic.id}>
                {topic.imageUrl ? <figure className="todayTopTopicVisual"><img src={topic.imageUrl} alt="" loading={index < 4 ? "eager" : "lazy"} onError={(event) => event.currentTarget.closest("figure")?.remove()} /></figure> : null}
                <div className="todayTopTopicBody">
                  <span className="todayTopTopicRank">{index + 1}</span>
                  <button className="todayOpportunitySelect" onClick={() => setSelectedTopic(topic)} aria-pressed={selectedTopic?.id === topic.id}><strong>{topic.title}</strong></button>
                  <p>{topic.summary}</p>
                  <a href={buildTopicCreationHref()} onClick={(event) => { event.preventDefault(); saveTopicCreationHandoff(topic); window.location.assign(buildTopicCreationHref()); }}>灵感创作 <span aria-hidden="true">→</span></a>
                </div>
              </article>)}
            </div>
            <div className="todayTopicsMasonry" ref={topicMasonryRef}>
              {masonryTopicItems.map((topic, index) => (
                <article className={`todayOpportunityRow ${topic.imageUrl ? "has-image" : "no-image"} ${index % 5 === 2 ? "brief-summary" : ""} ${selectedTopic?.id === topic.id ? "selected" : ""} heat-${topic.heat}`} key={topic.id}>
                  <span className="todayOpportunityRank">{String(index + 11).padStart(2, "0")}</span>
                  {topic.imageUrl ? <figure className="todayTopicVisual"><img src={topic.imageUrl} alt="" loading={index < 6 ? "eager" : "lazy"} onLoad={() => topicMasonryArrangeRef.current()} onError={(event) => { const card = event.currentTarget.closest(".todayOpportunityRow"); card?.classList.replace("has-image", "no-image"); event.currentTarget.closest("figure")?.remove(); topicMasonryArrangeRef.current(); }} /></figure> : null}
                  <div className="todayOpportunityRowBody">
                    <button className="todayOpportunitySelect" onClick={() => setSelectedTopic(topic)} aria-pressed={selectedTopic?.id === topic.id}>
                      <strong>{topic.title}</strong>
                    </button>
                    <p className="inspirationTopicSummary">{topic.summary}</p>
                  </div>
                  <div className="todayOpportunityActions"><a href={buildTopicCreationHref()} onClick={(event) => { event.preventDefault(); saveTopicCreationHandoff(topic); window.location.assign(buildTopicCreationHref()); }}>灵感创作 <span aria-hidden="true">→</span></a></div>
                </article>
              ))}
            </div>
            {visibleTopicTabItems.length < Math.min(topicTabItems.length, TOPIC_MAX_PER_TAB) ? <button className="todayOpportunityMoreButton" onClick={() => setVisibleTopicLimit((limit) => Math.min(limit + TOPIC_BATCH_SIZE, TOPIC_MAX_PER_TAB))}>发现更多灵感 <span aria-hidden="true">↓</span></button> : null}
          </>
        ) : (
          <div className="workbenchEmptyState">
            <strong>今日机会正在整理</strong>
            <span>可以先从个人画像生成一组更适合自己的选题。</span>
            <a href={appPath("/apps/topic-picker?from=today&entry=topic-picker")}>现在找选题</a>
          </div>
        )}
      </section>

      {selectedArticle ? createPortal(<div className="viralArticleModal" role="dialog" aria-modal="true" aria-labelledby="viral-article-modal-title"><button className="viralArticleModalBackdrop" aria-label="关闭原文" onClick={() => setSelectedArticle(null)} /><div className="viralArticleModalPanel"><div className="viralArticleModalHeader"><div><span>{selectedArticle.platform} · {selectedArticle.category}</span><h2 id="viral-article-modal-title">{selectedArticle.title}</h2></div><button className="viralArticleModalClose" aria-label="关闭原文" onClick={() => setSelectedArticle(null)}>×</button></div><div className="viralArticleModalMeta">{selectedArticle.metricLabel} · {selectedArticle.publishedAt ? formatDate(selectedArticle.publishedAt) : `抓取 ${formatDate(selectedArticle.fetchedAt)}`}</div><div className="viralArticleModalBody">{selectedArticle.articleBody ?? "当前来源暂未提供正文内容，请打开原文查看。"}</div><div className="viralArticleModalFooter"><a href={selectedArticle.sourceUrl} target="_blank" rel="noreferrer">打开平台原文 <span aria-hidden="true">↗</span></a><button onClick={() => setSelectedArticle(null)}>关闭</button></div></div></div>, document.body) : null}

    </div>
  );
}

function formatDate(value?: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getTopicTab(topic: HotTopic): "热点" | "财经" | "香港" | "国际" {
  if (topic.tab) return topic.tab;
  const signal = `${topic.title} ${topic.source} ${topic.category}`;
  if (/香港|HK01|RTHK|港股|恒生|港元|Hong Kong/i.test(signal)) return "香港";
  if (/国际财经|美联储|联储|欧洲央行|欧央行|美元|汇率|美股|纳斯达克|标普|原油|黄金|关税|全球|国际|海外|美国|欧洲|日本/i.test(signal)) return "国际";
  if (/财经|金融|市场|利率|房贷|消费|物价|股|债|基金|经济|企业|现金流/i.test(signal)) return "财经";
  return "热点";
}

function matchesFinanceFilter(topic: HotTopic, filter: FinanceFilter) {
  if (filter === "全部") return true;
  const signal = `${topic.title} ${topic.summary} ${topic.source} ${topic.category}`;
  const rules: Record<Exclude<FinanceFilter, "全部">, RegExp> = {
    "市场波动": /股|港股|美股|指数|黄金|原油|汇率|美元|利率|债券|基金|市场|价格|涨|跌|期货/i,
    "家庭钱袋": /房贷|存款|理财|基金|养老金|社保|消费|物价|收入|工资|家庭|住房|教育|医疗|养老/i,
    "政策机会": /央行|监管|新规|政策|税|补贴|改革|条例|办法|发布|实施|调整/i,
    "公司行业": /财报|业绩|营收|利润|融资|并购|裁员|企业|公司|行业|科技|汽车|地产|银行/i,
    "港美财经": /港股|恒生|港元|香港|美股|美国|美联储|纳斯达克|标普|道琼斯|美元/i,
  };
  return rules[filter].test(signal);
}

/** Let the first horizontal row demonstrate the full creator-reference supply. */
function diversifyViralPlatforms(items: ViralExample[]) {
  const output: ViralExample[] = [];
  const seenPlatforms = new Set<string>();
  for (const item of items) {
    if (seenPlatforms.has(item.platform)) continue;
    seenPlatforms.add(item.platform);
    output.push(item);
  }
  return [...output, ...items.filter((item) => !output.some((selected) => selected.id === item.id))];
}

function compareTopicsForDisplay(left: HotTopic, right: HotTopic, tab: "热点" | "财经" | "香港" | "国际") {
  // 百度官方实时榜在热点页完整保留，并优先呈现；其余条目沿用小谷的创作价值信号。
  if (tab === "热点") {
    const leftBaidu = left.source === "百度实时热榜" ? 1 : 0;
    const rightBaidu = right.source === "百度实时热榜" ? 1 : 0;
    if (leftBaidu !== rightBaidu) return rightBaidu - leftBaidu;
  }
  const score = (topic: HotTopic) => {
    let value = topic.heat === "高" ? 30 : topic.heat === "中" ? 18 : 8;
    if (topic.insuranceRelevance === "高") value += 24;
    else if (topic.insuranceRelevance === "中") value += 12;
    if (/首次|突然|紧急|官宣|新规|通报|热议|暴涨|暴跌/.test(topic.title)) value += 8;
    return value;
  };
  return score(right) - score(left) || left.title.localeCompare(right.title, "zh-CN");
}

function buildTopicCreationHref() {
  return appPath("/apps/traffic-copy?from=today&entry=traffic-copy&handoff=1");
}

function saveTopicCreationHandoff(topic: HotTopic) {
  // Carry the factual brief into creation, rather than leaving the creator
  // with a title alone. The source text remains editable in the destination.
  const prompt = [
    `热点标题：${topic.title}`,
    topic.summary?.trim() ? `热点摘要：${topic.summary.trim()}` : "",
  ].filter(Boolean).join("\n");
  saveCreationHandoff(window.sessionStorage, "traffic-copy", { prompt });
}

function buildViralCreationHref(item: ViralExample) {
  const query = new URLSearchParams({ from: "today", entry: "viral-example", source_url: item.sourceUrl, source_title: item.title, source_platform: item.platform });
  return appPath(`/apps/link-remix?${query.toString()}`);
}

function ViralExampleCover({ item }: { item: ViralExample }) {
  const thumbnailUrl = buildThumbnailUrl(item.thumbnailUrl);
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const [coverAspect, setCoverAspect] = useState<number | null>(null);
  const hasThumbnail = Boolean(thumbnailUrl) && !thumbnailFailed;
  const coverStyle = hasThumbnail ? {
    "--viral-thumbnail": `url(${thumbnailUrl})`,
    ...(coverAspect ? { "--viral-cover-aspect": String(coverAspect) } : {}),
  } as CSSProperties : undefined;
  return <a className={`viralExampleCover ${hasThumbnail ? "hasThumbnail" : "withoutThumbnail"}`} href={item.sourceUrl} target="_blank" rel="noreferrer" aria-label={`打开${item.platform}原作品`} style={coverStyle}>
    {hasThumbnail ? <img className="viralCoverImage" src={thumbnailUrl} alt="" onLoad={(event) => {
      if (item.platform !== "视频号") return;
      const image = event.currentTarget;
      if (!image.naturalWidth || !image.naturalHeight) return;
      // Avoid extreme values from malformed source images while preserving the
      // actual portrait/landscape ratio of each video-channel cover.
      setCoverAspect(Math.max(0.45, Math.min(1.6, image.naturalWidth / image.naturalHeight)));
    }} onError={() => setThumbnailFailed(true)} /> : null}
    <span className="viralCoverBadge">{item.platform}</span>
    <span className="viralCoverType">{item.type === "爆文" ? "图文参考" : "视频参考"}</span>
    {!hasThumbnail ? <strong>精选内容参考</strong> : null}
  </a>;
}

function buildThumbnailUrl(sourceUrl?: string) {
  if (!sourceUrl) return undefined;
  if (sourceUrl.startsWith("/api/")) return apiPath(sourceUrl);
  const normalizedUrl = sourceUrl.startsWith("//") ? `https:${sourceUrl}` : sourceUrl;
  return apiPath(`/api/assets/image-proxy?url=${encodeURIComponent(normalizedUrl)}`);
}

function getAuthorInitial(item: ViralExample) {
  return item.authorName?.trim().slice(0, 1) ?? "";
}

function hasViralMeta(item: ViralExample) {
  return Boolean(item.authorName || item.metricValue);
}

function getViralDisplayTitle(title: string) {
  const withoutTopicTags = title
    .replace(/#[^#\n]{1,40}#/g, " ")
    .replace(/(^|\s)#[^\s#]+/g, "$1");
  // Keep the full clean title in the DOM. The card owns the one-line ellipsis,
  // so each viewport can use all available width instead of a fixed 18-character cut.
  return withoutTopicTags.replace(/\s{2,}/g, " ").trim() || title;
}

// 抖音财经榜常混入荐股、短线交易内容：保留在榜单中，但排在宏观、政策、
// 银行保险、消费等可复用的财经创作素材之后。
function isPureStockTradingViral(item: ViralExample) {
  if (item.platform !== "抖音") return false;
  const text = [item.title, item.excerpt, item.category, ...(item.tags ?? [])].filter(Boolean).join(" ").toLowerCase();
  const stockTrading = /炒股|炒家|荐股|选股|股民|散户|a股|港股|美股|个股|牛市|熊市|涨停|跌停|k线|复盘|短线|打板|仓位|满仓|抄底|止损|操盘|交易员|开盘|收盘|大盘|行情|股价|股票代码/;
  const substantiveFinance = /央行|利率|汇率|gdp|cpi|ppi|财政|货币政策|金融监管|银行|保险|债券|黄金|原油|就业|经济|税收|房贷|消费|企业|上市公司|财报/;
  return stockTrading.test(text) && !substantiveFinance.test(text);
}

function getViralCardKind(item: ViralExample) {
  if (/图文|纯图文|笔记/.test(item.contentType)) return "is-graphic";
  return item.type === "爆文" ? "is-article" : "is-video";
}

function getViralPlatformClass(platform: ViralExample["platform"]) {
  return { "抖音": "douyin", "视频号": "channels", "公众号": "wechat", "小红书": "xiaohongshu" }[platform];
}
