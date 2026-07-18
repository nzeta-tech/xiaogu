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
  const [homeContent, setHomeContent] = useState("");

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

  useEffect(() => {
    void fetch(apiPath("/api/system/public-config")).then((response) => response.json()).then((payload: { site?: { homeContent?: string } }) => setHomeContent(payload.site?.homeContent ?? "")).catch(() => undefined);
  }, []);

  const balance = overview?.balance ?? 0;
  const draftCount = overview?.draftCount ?? 0;
  const notice = overview?.announcements?.[0] ?? null;
  const extraAnnouncements = overview?.announcements?.slice(1) ?? [];
  const hasDrafts = (overview?.recentDrafts?.length ?? 0) > 0;
  const hasAnnouncements = extraAnnouncements.length > 0;
  const topics = (overview?.topics ?? []).slice(0, 10);
  const primaryTopic = topics[0];
  const latestDraft = overview?.recentDrafts?.[0];
  const recommendation = buildDailyRecommendation(overview, primaryTopic);

  return (
    <div className="pageStack workbenchPage">
      {homeContent ? <section className="noticeStrip"><span>平台提示</span><p>{homeContent}</p></section> : null}
      {notice ? (
        <section className="noticeStrip">
          <span>限时提示</span>
          <strong>{notice.title}</strong>
          <p>{notice.content}</p>
          {notice.link_url ? <a href={notice.link_url} target="_blank" rel="noreferrer">立即查看</a> : null}
        </section>
      ) : null}

      <section className="todayOpportunity" aria-labelledby="today-opportunity-title">
        <div className="todayOpportunityHeader">
          <div>
            <span>今日机会</span>
            <h2 id="today-opportunity-title">今日热点与创作角度</h2>
            <p>热点全部展开，每条都可以直接带着推荐角度开始创作。</p>
          </div>
          <div className="todayOpportunityHeaderMeta">
            <strong>{topics.length} 条</strong>
            <time>{formatToday()}{overview?.topicsStale ? " · 缓存更新中" : ""}</time>
          </div>
        </div>
        {topics.length > 0 ? (
          <div className="todayOpportunityList">
            {topics.map((topic, index) => (
              <article className={`todayOpportunityRow ${index < 3 ? "featured" : ""} heat-${topic.heat}`} key={topic.id}>
                <span className="todayOpportunityRank">{String(index + 1).padStart(2, "0")}</span>
                <div className="todayOpportunityRowBody">
                  <div className="todayOpportunityTopicLine">
                    <strong>{topic.title}</strong>
                    <div><span>{topic.category}</span><em><i aria-hidden="true" />{topic.heat}热度</em></div>
                  </div>
                  <div className="todayOpportunityAngle"><span>创作角度</span><p>{topic.recommendedAngle}</p></div>
                </div>
                <a href={buildTopicCreationHref(topic)}>开始创作 <span aria-hidden="true">→</span></a>
              </article>
            ))}
          </div>
        ) : (
          <div className="workbenchEmptyState">
            <strong>今日机会正在整理</strong>
            <span>可以先从个人画像生成一组更适合自己的选题。</span>
            <a href={appPath("/apps/topic-picker?from=dashboard&entry=topic-picker")}>现在找选题</a>
          </div>
        )}
      </section>

      <div className="todayDecisionGrid">
        <section className="todayRecommendation" aria-labelledby="today-recommendation-title">
          <div className="workbenchSectionHeader"><div><span>今日建议</span><h2 id="today-recommendation-title">下一步做什么</h2></div></div>
          <div className="todayRecommendationBody">
            <span>{recommendation.label}</span>
            <strong>{recommendation.title}</strong>
            <p>{recommendation.description}</p>
            <a href={recommendation.href}>{recommendation.action}</a>
          </div>
        </section>

        <section className="todayContinue" aria-labelledby="today-continue-title">
          <div className="workbenchSectionHeader">
            <div><span>继续创作</span><h2 id="today-continue-title">接着上次的内容</h2></div>
            <a href={appPath("/drafts")}>全部作品</a>
          </div>
          {latestDraft ? (
            <a className="todayContinueWork" href={appPath(`/works/${latestDraft.id}?from=dashboard&entry=${latestDraft.platform}`)}>
              <div><span>{latestDraft.platform} · {formatDate(latestDraft.updated_at)}</span><strong>{latestDraft.title}</strong><p>继续审阅、修改或复用这篇内容。</p></div>
              <em aria-hidden="true">→</em>
            </a>
          ) : (
            <div className="todayContinueEmpty"><strong>还没有创作记录</strong><p>从一条客户问题或一个真实经历开始。</p><a href={appPath("/workspace")}>开始第一篇创作</a></div>
          )}
        </section>
      </div>

      <section className="todayStatusSection" aria-labelledby="weekly-status-title">
        <div className="workbenchSectionHeader">
          <div><span>本周进度</span><h2 id="weekly-status-title">内容经营状态</h2><p>只记录真实发生的创作与积分使用。</p></div>
          <small>{loading ? "同步中" : "已更新"}</small>
        </div>
        <div className="todayProgressStrip">
          <div><span>本周创作</span><strong>{overview?.weeklyDraftCount ?? 0}</strong></div>
          <div><span>全部作品</span><strong>{draftCount}</strong></div>
          <div><span>本周消耗</span><strong>{overview?.weeklyUsed ?? 0}</strong></div>
          <div><span>可用积分</span><strong>{balance}</strong></div>
        </div>
      </section>

      {hasDrafts ? (
        <section className="recentWorksSection">
          <div className="workbenchSectionHeader">
            <div><span>内容资产</span><h2>最近作品</h2><p>快速回看最近产出的内容，完整管理统一进入创作历史。</p></div>
            <a href={appPath("/drafts")}>进入创作历史</a>
          </div>
          <div className="draftCardGrid">
            {(overview?.recentDrafts ?? []).slice(0, 3).map((draft) => (
              <a className="draftCard" href={appPath(`/works/${draft.id}?from=dashboard&entry=${draft.platform}`)} key={draft.id}>
                <div className="draftCardMeta"><span>{draft.platform}</span><em>{formatDate(draft.updated_at)}</em></div>
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

function buildTopicCreationHref(topic: HotTopic) {
  const prompt = `${topic.title}\n\n热点背景：${topic.summary}\n保险内容角度：${topic.recommendedAngle}`;
  return appPath(`/apps/traffic-copy?from=dashboard&entry=traffic-copy&prompt=${encodeURIComponent(prompt)}`);
}

function buildDailyRecommendation(overview: Overview | null, topic?: HotTopic) {
  if ((overview?.weeklyDraftCount ?? 0) === 0) {
    return {
      label: "低门槛开始",
      title: "先完成一篇能发布的内容",
      description: topic ? `可以从“${topic.title}”切入，小谷已准备好推荐角度。` : "先生成一组选题，再选择最有表达欲的一条。",
      href: topic ? buildTopicCreationHref(topic) : appPath("/apps/topic-picker?from=dashboard&entry=topic-picker"),
      action: topic ? "开始创作" : "生成选题",
    };
  }
  if ((overview?.recentDrafts?.length ?? 0) > 0) {
    return {
      label: "内容组合建议",
      title: "把最近作品改成另一个渠道版本",
      description: "连续输出同一种形式容易疲劳，换成口播或朋友圈能提高同一份素材的利用率。",
      href: appPath("/workspace"),
      action: "开始一稿多用",
    };
  }
  return {
    label: "建立表达节奏",
    title: "生成一组符合你定位的选题",
    description: "围绕目标客群的真实问题，形成可持续的内容方向。",
    href: appPath("/apps/topic-picker?from=dashboard&entry=topic-picker"),
    action: "生成选题",
  };
}
