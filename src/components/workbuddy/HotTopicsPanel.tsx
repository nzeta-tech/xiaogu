"use client";

import { useEffect, useState } from "react";
import styles from "./workbuddy-home.module.css";
import { apiPath } from "@/lib/client/url";
import type { HotTopic } from "@/lib/topics/types";
import { readHotTopicSource } from "@/lib/workbuddy/hot-topic-conversation";

import { topicTabs, financeFilters, type FinanceFilter, getTopicTab, matchesFinanceFilter, compareTopicsForDisplay } from "@/lib/topics/display";

export function HotTopicsPanel({ busy, onSelect }: { busy: boolean; onSelect: (topic: HotTopic) => void }) {
  const pageSize = 10;
  const [topics, setTopics] = useState<HotTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [updated, setUpdated] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [tab, setTab] = useState<typeof topicTabs[number]>("热点");
  const [page, setPage] = useState(0);
  const [financeFilter, setFinanceFilter] = useState<FinanceFilter>("全部");
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(apiPath("/api/workbench/overview"), { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]) });
        const data = await response.json();
        if (!response.ok || !data.overview) throw new Error("热点暂时未能加载");
        setTopics(data.overview.topics ?? []);
        setUpdated(data.overview.topicsRefreshedAt);
        setStale(Boolean(data.overview.topicsStale));
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error && cause.name === "TimeoutError" ? "热点同步较慢，你可以先输入问题" : "热点暂时未能加载，你可以先开始对话");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [attempt]);
  const filtered = topics
    .filter((topic) => getTopicTab(topic) === tab)
    .filter((topic) => tab !== "财经" || matchesFinanceFilter(topic, financeFilter))
    .sort((left, right) => compareTopicsForDisplay(left, right, tab))
    .slice(0, 200);
  const visible = filtered.slice(page * pageSize, (page + 1) * pageSize);
  return (
    <section className={styles.panel} aria-labelledby="wb-hot-topics-title">
      <div className={styles.panelHeader}>
        <h2 id="wb-hot-topics-title"><span aria-hidden="true">↗</span> 今日热点</h2>
        <div className={styles.tabs} role="group" aria-label="热点分类">{topicTabs.map((item) => <button type="button" aria-pressed={tab === item} key={item} onClick={() => { setTab(item); setPage(0); setFinanceFilter("全部"); }}>{item}<em>{loading || error ? "—" : Math.min(topics.filter((topic) => getTopicTab(topic) === item).length, 200)}</em></button>)}</div>
        <small className={styles.updated}>{loading ? "正在同步热点" : error ? "稍后重试" : stale ? "历史热点 · 更新中" : updated ? `${formatTopicDate(updated)} 更新` : "公开热点"}</small>
        <button className={styles.refresh} type="button" disabled={loading || filtered.length <= pageSize} onClick={() => setPage((value) => (value + 1) % Math.ceil(filtered.length / pageSize))}>↻ 换一换</button>
      </div>
      {tab === "财经" ? <div className={styles.filterSlot}>
        <div className={styles.filters} role="group" aria-label="财经热点筛选">{financeFilters.map((filter) => <button type="button" key={filter} aria-pressed={financeFilter === filter} onClick={() => { setFinanceFilter(filter); setPage(0); }}>{filter}</button>)}</div>
      </div> : null}
      <div className={styles.content} aria-busy={loading}>
        {loading ? <div className={styles.grid} aria-label="正在加载热点">{Array.from({ length: pageSize }, (_, index) => <div className={styles.skeleton} key={index} aria-hidden="true"><span><b /></span><i /></div>)}</div>
          : error ? <div className={styles.empty} role="status"><strong>热点稍后就来</strong><p>{error}</p><button type="button" onClick={() => { setError(""); setLoading(true); setPage(0); setAttempt((value) => value + 1); }}>重新加载</button></div>
          : !visible.length ? <div className={styles.empty} role="status"><strong>暂时没有相关热点</strong><p>换个分类看看，或直接聊聊你的想法</p></div>
          : <div className={styles.grid} aria-label={`${tab}热点`}>{visible.map((topic) => <button className={styles.topic} type="button" key={topic.id + topic.title} title={topic.title} disabled={busy} onClick={() => onSelect(topic)}>
            {topic.imageUrl ? <TopicThumbnail key={topic.imageUrl} src={topic.imageUrl} /> : null}
            <span className={styles.topicBody}><strong>{topic.title}</strong></span>
            <span className={styles.arrow} aria-hidden="true">↗</span>
          </button>)}</div>}
      </div>
    </section>
  );
}

function TopicThumbnail({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  // Source-provided images can come from any news publisher.
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={styles.thumbnail} src={src} alt="" width={40} height={28} loading="lazy" decoding="async" onError={() => setFailed(true)} />;
}

function formatTopicDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("zh-CN", { timeZone: "Asia/Hong_Kong", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
}
export function HotTopicSourceCard({ context }: { context: unknown }) {
  const topic = readHotTopicSource(context);
  if (!topic) return null;
  return <aside className="wbHotSource"><span>今日热点 · 对话资料</span><strong>{topic.title}</strong><div><small>{topic.source}{topic.sourcePublishedAt ? ` · ${formatTopicDate(topic.sourcePublishedAt)}` : ""}</small>{topic.sourceUrl ? <a href={topic.sourceUrl} target="_blank" rel="noopener noreferrer">查看来源 ↗</a> : <small>暂无原文链接</small>}</div></aside>;
}
