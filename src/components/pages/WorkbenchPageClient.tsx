"use client";

import { useEffect, useState } from "react";
import { apiPath, appPath } from "@/lib/client/url";
import type { HotTopic } from "@/lib/topics/types";

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
  recentDrafts: Array<{ id: string; title: string; platform: string; updated_at?: string }>;
  recentUsage: Array<{ id: string; action_type: string; quota_cost: number; created_at: string }>;
  recentOrders: Array<{ id: string; status: string; amount_cents: number; currency: string; created_at: string }>;
  announcements: Array<{ id: string; title: string; content: string; kind: string; link_url?: string | null }>;
  recentGifts: Array<{ id: string; source_label: string; quota_amount: number; created_at: string }>;
};

const actionCards = [
  {
    title: "写文案",
    desc: "从热点到脚本，一次完成今天要发的内容。",
    href: "/apps/write-copy?from=workspace&entry=write-copy",
    badge: "推荐",
  },
  {
    title: "找选题",
    desc: "结合你的数字分身，生成触达、信任和转化选题。",
    href: "/apps/topic-picker?from=workspace&entry=topic-picker",
    badge: "灵感",
  },
  {
    title: "保单诊断",
    desc: "梳理家庭保障结构，快速定位缺口与沟通重点。",
    href: "/apps/policy-diagnosis?from=workspace&entry=policy-diagnosis",
    badge: "专业",
  },
];

const dailyQuotes = [
  "真正专业的内容，不是把风险说重，而是把选择说清。",
  "先帮客户看懂家庭责任，再谈产品，信任会走得更稳。",
  "好文案不是催促成交，而是让客户愿意认真规划一次。",
  "保险内容的温度，藏在克制、准确和替客户多想一步里。",
  "把复杂问题讲明白，本身就是一种值得长期积累的专业。",
  "持续输出有用的判断，比追逐每一次热度更接近信任。",
  "先理解客户正在经历什么，再决定今天应该说什么。",
];

export function WorkbenchPageClient() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadOverview(signal?: AbortSignal) {
    try {
      setLoading(true);
      const response = await fetch(apiPath("/api/workbench/overview"), { signal });
      const payload = (await response.json()) as { overview?: Overview };
      setOverview(payload.overview ?? null);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) throw error;
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

  const balance = overview?.balance ?? 0;
  const draftCount = overview?.draftCount ?? 0;
  const notice = overview?.announcements?.[0] ?? null;
  const extraAnnouncements = overview?.announcements?.slice(1) ?? [];
  const hasDrafts = (overview?.recentDrafts?.length ?? 0) > 0;
  const hasAnnouncements = extraAnnouncements.length > 0;
  const quote = dailyQuotes[new Date().getDate() % dailyQuotes.length];
  const topics = overview?.topics ?? [];

  return (
    <div className="pageStack workbenchPage">
      <section className="dailyBrief" aria-label="每日一句">
        <span>每日一句</span>
        <p>{quote}</p>
        <time>{formatToday()}</time>
      </section>

      {notice ? (
        <section className="noticeStrip">
          <span>限时提示</span>
          <strong>{notice.title}</strong>
          <p>{notice.content}</p>
          {notice.link_url ? <a href={notice.link_url} target="_blank" rel="noreferrer">立即查看</a> : null}
        </section>
      ) : null}

      <section className="todayStatusSection" aria-labelledby="weekly-status-title">
        <div className="heroStatusCard todayStatusCard">
          <div className="heroStatusHeader">
            <div>
              <h2 id="weekly-status-title">本周状态</h2>
              <p>聚焦本周真实发生的创作和积分消耗。</p>
            </div>
            <span>{loading ? "同步中" : "已更新"}</span>
          </div>
          <div className="heroStatusGrid">
            <div>
              <strong>{balance}</strong>
              <span>可用积分</span>
            </div>
            <div>
              <strong>{overview?.weeklyDraftCount ?? 0}</strong>
              <span>本周创作</span>
            </div>
            <div>
              <strong>{overview?.weeklyUsed ?? 0}</strong>
              <span>本周消耗</span>
            </div>
            <div>
              <strong>{draftCount}</strong>
              <span>全部作品</span>
            </div>
          </div>
        </div>
      </section>

      <div className="todayContentGrid">
        <section className="todayHotTopics" aria-labelledby="hot-topics-title">
          <div className="workbenchSectionHeader">
            <div>
              <span>内容雷达</span>
              <h2 id="hot-topics-title">今日热点</h2>
              <p>读取最近一次热榜缓存，打开首页不会额外扣积分。</p>
            </div>
            {overview?.topicsRefreshedAt ? <time>更新于 {formatRefreshTime(overview.topicsRefreshedAt)}</time> : null}
          </div>
          <div className="hotTopicList">
            {topics.length > 0 ? topics.slice(0, 5).map((topic, index) => (
              <article className="hotTopicRow" key={topic.id}>
                <span className="hotTopicRank">{String(index + 1).padStart(2, "0")}</span>
                <div className="hotTopicBody">
                  <div className="hotTopicTitleLine">
                    <strong>{topic.title}</strong>
                    <span>{topic.source} · {topic.heat}热度</span>
                  </div>
                  <p>{topic.recommendedAngle}</p>
                </div>
                <a href={buildTopicCreationHref(topic)}>转成文案</a>
              </article>
            )) : (
              <div className="workbenchEmptyState">
                <strong>热点正在整理中</strong>
                <span>后台热榜刷新完成后会自动出现在这里。</span>
              </div>
            )}
          </div>
        </section>

        <section className="todayQuickEntries" aria-labelledby="quick-entries-title">
          <div className="workbenchSectionHeader">
            <div>
              <span>快捷入口</span>
              <h2 id="quick-entries-title">接着做</h2>
              <p>只保留最常用的创作动作。</p>
            </div>
            <a href={appPath("/workspace")}>全部应用</a>
          </div>
          <div className="quickEntryList">
            {actionCards.map((item) => (
              <a className="quickEntryRow" href={appPath(item.href)} key={item.href}>
                <span>{item.badge}</span>
                <div><strong>{item.title}</strong><p>{item.desc}</p></div>
                <em aria-hidden="true">→</em>
              </a>
            ))}
          </div>
        </section>
      </div>

      {hasDrafts ? (
        <section className="recentWorksSection">
          <div className="workbenchSectionHeader">
            <div>
              <span>继续创作</span>
              <h2>我的作品</h2>
              <p>最近产出的作品，方便继续迭代和复用。</p>
            </div>
            <a href={appPath("/drafts")}>更多</a>
          </div>
          <div className="draftCardGrid">
            {(overview?.recentDrafts ?? []).map((draft) => (
              <a className="draftCard" href={appPath(`/works/${draft.id}`)} key={draft.id}>
                <div className="draftCardMeta">
                  <span>{draft.platform}</span>
                  <em>{formatDate(draft.updated_at)}</em>
                </div>
                <strong>{draft.title}</strong>
              </a>
            ))}
          </div>
        </section>
      ) : null}
      {hasAnnouncements ? (
        <section className="workbenchPanel">
          <div className="panelHeader workbenchPanelHeader">
            <div>
              <h2>系统提醒</h2>
              <p>只展示现在有内容的提醒。</p>
            </div>
          </div>
          <div className="signalList">
            {extraAnnouncements.map((item) => (
              <div className="signalRow announcementRow" key={item.id}>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.content}</p>
                </div>
                {item.link_url ? <a href={item.link_url} target="_blank" rel="noreferrer">查看</a> : <span>{item.kind}</span>}
              </div>
            ))}
          </div>
        </section>
      ) : null}
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

function formatToday() {
  return new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "short" }).format(new Date());
}

function formatRefreshTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function buildTopicCreationHref(topic: HotTopic) {
  const prompt = `${topic.title}\n\n热点背景：${topic.summary}\n保险内容角度：${topic.recommendedAngle}`;
  return appPath(`/apps/traffic-copy?from=dashboard&entry=traffic-copy&prompt=${encodeURIComponent(prompt)}`);
}
