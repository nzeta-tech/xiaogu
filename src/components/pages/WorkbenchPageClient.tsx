"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { apiPath, appPath } from "@/lib/client/url";
import type { HotTopic } from "@/lib/topics/types";
import { getHotTopicDisplayCategory } from "@/lib/topics/rules";
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
  recentDrafts: Array<{ id: string; title: string; platform: string; updated_at?: string }>;
  recentUsage: Array<{ id: string; action_type: string; quota_cost: number; created_at: string }>;
  recentOrders: Array<{ id: string; status: string; amount_cents: number; currency: string; created_at: string }>;
  announcements: Array<{ id: string; title: string; content: string; kind: string; link_url?: string | null }>;
  recentGifts: Array<{ id: string; source_label: string; quota_amount: number; created_at: string }>;
};

export function WorkbenchPageClient() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [overviewError, setOverviewError] = useState(false);
  const [viralExamples, setViralExamples] = useState<ViralExample[]>([]);
  const [viralMeta, setViralMeta] = useState({ degraded: false, stale: false, loading: true });
  const [viralPlatform, setViralPlatform] = useState<"全部" | ViralExample["platform"]>("全部");
  const [selectedArticle, setSelectedArticle] = useState<ViralExample | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<HotTopic | null>(null);
  const [viralExpanded, setViralExpanded] = useState(false);
  const [linkRemixAvailable, setLinkRemixAvailable] = useState<boolean | null>(null);

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

  const topics = (overview?.topics ?? []).slice(0, 10);
  const viralPlatforms = ["全部", ...Array.from(new Set(viralExamples.map((item) => item.platform))).sort()] as Array<"全部" | ViralExample["platform"]>;
  const activeViralPlatform = viralPlatforms.includes(viralPlatform) ? viralPlatform : "全部";
  const filteredViralExamples = viralExamples
    .filter((item) => activeViralPlatform === "全部" || item.platform === activeViralPlatform)
    .sort((a, b) => {
      const topicMatch = (item: ViralExample) => selectedTopic && item.category === selectedTopic.category ? 1 : 0;
      return (topicMatch(b) - topicMatch(a))
        || (Number(Boolean(b.isManual)) - Number(Boolean(a.isManual)))
        || Number(b.viralScore ?? b.metricValue ?? 0) - Number(a.viralScore ?? a.metricValue ?? 0);
    });
  const visibleViralExamples = viralExpanded ? filteredViralExamples : filteredViralExamples.slice(0, 6);
  const platformCount = (platform: typeof activeViralPlatform) => platform === "全部" ? viralExamples.length : viralExamples.filter((item) => item.platform === platform).length;

  return (
    <div className={`pageStack workbenchPage inspirationWorkbench ${viralExpanded ? "viralExpanded" : ""}`}>
      <div className="inspirationSplitLayout">
      <section className="todayOpportunity" aria-labelledby="today-opportunity-title">
        <div className="todayOpportunityHeader">
          <div>
            <span>今日选题</span>
            <h2 id="today-opportunity-title">热点榜单</h2>
          </div>
          {overview?.topicsRefreshedAt ? <time dateTime={overview.topicsRefreshedAt}>更新于 {formatDate(overview.topicsRefreshedAt)}</time> : null}
        </div>
        {loading ? (
          <div className="workbenchEmptyState"><strong>正在同步今日热点</strong><span>正在汇总热榜、搜索和保险相关性，通常需要几秒钟。</span></div>
        ) : overviewError ? (
          <div className="workbenchEmptyState"><strong>今日热点暂时加载失败</strong><span>请刷新页面重试，或先从个人画像生成一组选题。</span><a href={appPath("/apps/topic-picker?from=today&entry=topic-picker")}>先生成选题</a></div>
        ) : topics.length > 0 ? (
          <div className="todayOpportunityList">
            {topics.map((topic, index) => (
              <article className={`todayOpportunityRow ${index < 3 ? "featured" : ""} ${selectedTopic?.id === topic.id ? "selected" : ""} heat-${topic.heat}`} key={topic.id}>
                <span className="todayOpportunityRank">{String(index + 1).padStart(2, "0")}</span>
                <div className="todayOpportunityRowBody">
                  <button className="todayOpportunitySelect" onClick={() => setSelectedTopic(topic)} aria-pressed={selectedTopic?.id === topic.id}>
                    <strong>{topic.title}</strong>
                    <span>{getHotTopicDisplayCategory(topic)} · {topic.heat}热度</span>
                  </button>
                </div>
                <div className="todayOpportunityActions"><a href={buildTopicCreationHref(topic)}>灵感创作 <span aria-hidden="true">→</span></a></div>
              </article>
            ))}
          </div>
        ) : (
          <div className="workbenchEmptyState">
            <strong>今日机会正在整理</strong>
            <span>可以先从个人画像生成一组更适合自己的选题。</span>
            <a href={appPath("/apps/topic-picker?from=today&entry=topic-picker")}>现在找选题</a>
          </div>
        )}
      </section>

      <section className="viralExamplesSection" aria-labelledby="viral-examples-title">
        <div className="workbenchSectionHeader viralExamplesHeader">
          <div>
            <span>表达参考</span>
            <h2 id="viral-examples-title">爆款</h2>
          </div>
          {selectedTopic ? <button className="inspirationContext" onClick={() => setSelectedTopic(null)} title="清除热点关联">关联：{selectedTopic.title}<span aria-hidden="true">×</span></button> : null}
        </div>
        <div className="viralPlatformTabs" role="tablist" aria-label="来源平台">
          {viralPlatforms.map((platform) => <button key={platform} role="tab" aria-selected={activeViralPlatform === platform} className={activeViralPlatform === platform ? "active" : ""} onClick={() => { setViralPlatform(platform); setViralExpanded(false); }}><span>{platform}</span><em>{platformCount(platform)}</em></button>)}
        </div>
        {viralMeta.loading ? <div className="workbenchEmptyState"><strong>正在加载人工配置爆款</strong><span>正在整理已配置的短视频和爆文来源。</span></div> : filteredViralExamples.length > 0 ? <div className="viralExamplesContent"><div className={`viralExamplesList ${viralExpanded ? "expanded" : ""}`}>{visibleViralExamples.map((item) => <article className={`viralExampleCard ${getViralCardKind(item)} platform-${getViralPlatformClass(item.platform)}`} key={item.id}><ViralExampleCover item={item} /><div className="viralExampleMain">{item.type === "爆文" ? <button className="viralArticlePreview" onClick={() => setSelectedArticle(item)}><h3>{getViralDisplayTitle(item.title)}</h3></button> : <h3>{getViralDisplayTitle(item.title)}</h3>}{hasViralMeta(item) ? <div className="viralExampleAuthor">{item.authorName ? <><span aria-hidden="true">{getAuthorInitial(item)}</span><strong>{item.authorName}</strong></> : null}{item.metricValue ? <small>{`${item.metricValue.toLocaleString()}${item.metricUnit ?? ""}`}</small> : null}</div> : null}</div>{linkRemixAvailable === true ? <div className="viralExampleActions"><a className="viralRemixButton" href={buildViralCreationHref(item)}>开始二创 <span aria-hidden="true">→</span></a></div> : null}</article>)}</div>{filteredViralExamples.length > 6 ? <button className="viralMoreButton" onClick={() => setViralExpanded((expanded) => !expanded)} aria-expanded={viralExpanded}>{viralExpanded ? "收起爆款" : `更多爆款 (${filteredViralExamples.length - 6})`}<span aria-hidden="true">{viralExpanded ? "↑" : "↓"}</span></button> : null}</div> : viralMeta.degraded ? <div className="workbenchEmptyState"><strong>人工配置爆款暂时加载失败</strong><span>请刷新页面重试。</span></div> : <div className="workbenchEmptyState"><strong>暂时没有人工配置的内容</strong><span>可以在运营后台添加并发布爆款内容。</span></div>}
      </section>
      </div>

      {selectedArticle ? <div className="viralArticleModal" role="dialog" aria-modal="true" aria-labelledby="viral-article-modal-title"><button className="viralArticleModalBackdrop" aria-label="关闭原文" onClick={() => setSelectedArticle(null)} /><div className="viralArticleModalPanel"><div className="viralArticleModalHeader"><div><span>{selectedArticle.platform} · {selectedArticle.category}</span><h2 id="viral-article-modal-title">{selectedArticle.title}</h2></div><button className="viralArticleModalClose" aria-label="关闭原文" onClick={() => setSelectedArticle(null)}>×</button></div><div className="viralArticleModalMeta">{selectedArticle.metricLabel} · {selectedArticle.publishedAt ? formatDate(selectedArticle.publishedAt) : `抓取 ${formatDate(selectedArticle.fetchedAt)}`}</div><div className="viralArticleModalBody">{selectedArticle.articleBody ?? "当前来源暂未提供正文内容，请打开原文查看。"}</div><div className="viralArticleModalFooter"><a href={selectedArticle.sourceUrl} target="_blank" rel="noreferrer">打开平台原文 <span aria-hidden="true">↗</span></a><button onClick={() => setSelectedArticle(null)}>关闭</button></div></div></div> : null}

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

function buildTopicCreationHref(topic: HotTopic) {
  const prompt = `${topic.title}\n\n热点背景：${topic.summary}\n保险内容角度：${topic.recommendedAngle}`;
  return appPath(`/apps/traffic-copy?from=today&entry=traffic-copy&prompt=${encodeURIComponent(prompt)}`);
}

function buildViralCreationHref(item: ViralExample) {
  const query = new URLSearchParams({ from: "today", entry: "viral-example", source_url: item.sourceUrl, source_title: item.title, source_platform: item.platform });
  return appPath(`/apps/link-remix?${query.toString()}`);
}

function ViralExampleCover({ item }: { item: ViralExample }) {
  const thumbnailUrl = buildThumbnailUrl(item.thumbnailUrl);
  const coverStyle = thumbnailUrl ? { "--viral-thumbnail": `url(${thumbnailUrl})` } as CSSProperties : undefined;
  return <a className={`viralExampleCover ${thumbnailUrl ? "hasThumbnail" : "withoutThumbnail"}`} href={item.sourceUrl} target="_blank" rel="noreferrer" aria-label={`打开${item.platform}原作品`} style={coverStyle}>
    {thumbnailUrl ? <span className="viralCoverImage" aria-hidden="true" /> : null}
    <span className="viralCoverBadge">{item.platform}</span>
    <span className="viralCoverType">{item.type === "爆文" ? "图文参考" : "视频参考"}</span>
    {!thumbnailUrl ? <strong>精选内容参考</strong> : null}
  </a>;
}

function buildThumbnailUrl(sourceUrl?: string) {
  if (!sourceUrl) return undefined;
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
  const compactTitle = withoutTopicTags.replace(/\s{2,}/g, " ").trim() || title;
  return compactTitle.length > 18 ? `${compactTitle.slice(0, 18)}...` : compactTitle;
}

function getViralCardKind(item: ViralExample) {
  if (/图文|纯图文|笔记/.test(item.contentType)) return "is-graphic";
  return item.type === "爆文" ? "is-article" : "is-video";
}

function getViralPlatformClass(platform: ViralExample["platform"]) {
  return { "抖音": "douyin", "视频号": "channels", "公众号": "wechat", "小红书": "xiaohongshu" }[platform];
}
