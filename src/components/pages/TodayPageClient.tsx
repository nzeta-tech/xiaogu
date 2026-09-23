"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiPath } from "@/lib/client/url";
import type { ShortVideo, ShortVideoFeed, ShortVideoSort } from "@/lib/short-videos/types";

const statusLabel: Record<ShortVideo["compliance"]["status"], string> = {
  displayable: "可展示",
  pending_review: "待人工核验",
  filtered: "已过滤",
};

export function TodayPageClient() {
  const [feed, setFeed] = useState<ShortVideoFeed | null>(null);
  const [sort, setSort] = useState<ShortVideoSort>("relevance");
  const [theme, setTheme] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const themes = useMemo(() => [...new Set((feed?.items ?? []).flatMap((item) => item.themes))].sort(), [feed]);

  const loadFeed = useCallback(async (refresh = false) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ sort, limit: "50" });
      if (theme) params.set("theme", theme);
      if (refresh) params.set("refresh", "1");
      const response = await fetch(apiPath(`/api/short-videos?${params.toString()}`));
      const payload = (await response.json()) as ShortVideoFeed & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "短视频参考素材暂时无法加载");
      setFeed(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "短视频参考素材暂时无法加载");
    } finally {
      setLoading(false);
    }
  }, [sort, theme]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadFeed();
  }, [loadFeed]);

  return (
    <div className="pageStack todayPage">
      <section className="todayIntro">
        <div>
          <span className="heroBadge">今日参考</span>
          <h1>短视频参考素材</h1>
          <p>按供应商指标排序，仅供内容结构和选题参考；保险事实、版权和发布权限仍需人工核验。</p>
        </div>
        <button className="secondaryButton" disabled={loading} onClick={() => void loadFeed(true)} type="button">
          {loading ? "同步中" : "刷新素材"}
        </button>
      </section>

      <section className="todayToolbar" aria-label="参考素材筛选">
        <label>主题
          <select value={theme} onChange={(event) => setTheme(event.target.value)}>
            <option value="">全部主题</option>
            {themes.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label>排序
          <select value={sort} onChange={(event) => setSort(event.target.value as ShortVideoSort)}>
            <option value="relevance">综合指标</option>
            <option value="published_at">发布时间</option>
            <option value="views">播放量</option>
            <option value="engagement">互动指标</option>
          </select>
        </label>
        <div className="todayFeedMeta">
          {feed?.filteredCount ? `${feed.filteredCount} 条不符合门禁的素材已过滤` : "服务端已执行合规门禁"}
        </div>
      </section>

      {feed?.degraded ? <div className="todayDegraded">{degradedText(feed.degradationReason)}{feed.fetchedAt ? " 当前展示的是缓存数据。" : ""}</div> : null}
      {error ? <div className="todayError">{error}</div> : null}
      {!loading && !error && feed?.items.length === 0 ? <div className="todayEmpty">暂无可展示的参考素材。授权源未配置或当前没有通过门禁的条目。</div> : null}
      <section className="shortVideoGrid" aria-label="短视频参考素材列表">
        {feed?.items.map((item) => <ShortVideoCard item={item} key={item.id} />)}
      </section>
    </div>
  );
}

function ShortVideoCard({ item }: { item: ShortVideo }) {
  const status = item.compliance.status;
  return (
    <article className="shortVideoCard">
      <div className="shortVideoCardTop">
        <span className={`shortVideoStatus ${status}`}>{statusLabel[status]}</span>
        <span className="shortVideoReference">参考素材</span>
      </div>
      <h2>{item.title}</h2>
      <div className="shortVideoMeta"><span>{item.platform}</span><span>{item.sourceTitle ?? "来源链接"}</span></div>
      <div className="shortVideoTimes"><span>发布 {formatDate(item.publishedAt)}</span><span>抓取 {formatDate(item.fetchedAt)}</span><span>统计 {formatDate(item.metrics.statisticsAt)}</span></div>
      <div className="shortVideoMetrics"><span>播放 {formatMetric(item.metrics.views)}</span><span>赞 {formatMetric(item.metrics.likes)}</span><span>评 {formatMetric(item.metrics.comments)}</span><span>转 {formatMetric(item.metrics.shares)}</span></div>
      <div className="shortVideoTags">{item.themes.map((value) => <span key={value}>{value}</span>)}{item.labels.map((value) => <span key={value}>{value}</span>)}</div>
      <p className="shortVideoPolicy">{item.compliance.publishable ? "已通过展示门禁" : "仅供参考，发布前完成人工核验"}</p>
      <a className="shortVideoSource" href={item.sourceUrl} target="_blank" rel="noreferrer">查看来源</a>
    </article>
  );
}

function degradedText(reason?: ShortVideoFeed["degradationReason"]) {
  if (reason === "provider_not_configured") return "授权供应商尚未配置。";
  if (reason === "provider_unavailable") return "授权供应商暂时不可用。";
  return "当前素材需要重新核验。";
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatMetric(value?: number) { return value === undefined ? "-" : new Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 1 }).format(value); }
