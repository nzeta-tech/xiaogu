"use client";

import { useEffect, useState } from "react";
import { apiPath, appPath } from "@/lib/client/url";

type Overview = {
  balance: number;
  draftCount: number;
  paidOrders: number;
  pendingOrders: number;
  totalUsed: number;
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
    href: "/workspace",
    badge: "推荐",
  },
  {
    title: "改草稿",
    desc: "把已有内容改成更适合成交和转介绍的版本。",
    href: "/drafts",
    badge: "高频",
  },
  {
    title: "看账本",
    desc: "确认额度、订单和最近经营动作是不是顺畅。",
    href: "/billing",
    badge: "经营",
  },
  {
    title: "领权益",
    desc: "把最近到账奖励留给关键的创作周期使用。",
    href: "/benefits",
    badge: "增长",
  },
];

export function WorkbenchPageClient() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadOverview(signal?: AbortSignal) {
    setLoading(true);
    const response = await fetch(apiPath("/api/workbench/overview"), { signal });
    const payload = (await response.json()) as { overview?: Overview };
    setOverview(payload.overview ?? null);
    setLoading(false);
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

  return (
    <div className="pageStack workbenchPage">
      {notice ? (
        <section className="noticeStrip">
          <span>限时提示</span>
          <strong>{notice.title}</strong>
          <p>{notice.content}</p>
          {notice.link_url ? <a href={notice.link_url} target="_blank" rel="noreferrer">立即查看</a> : null}
        </section>
      ) : null}

      <section className="workbenchHero">
        <div className="heroPrimaryCard">
          <div className="heroPrimaryCopy">
            <span className="heroBadge">工作台</span>
            <h1>把今天的内容动作，排成一条清晰的经营路径。</h1>
            <p>先创作，再复用，再看消耗和回报。首页只展示你现在真正用得上的模块。</p>
          </div>
          <div className="actionRow">
            <a className="primaryButton linkButton" href={appPath("/workspace")}>继续创作</a>
            {draftCount > 0 ? (
              <a className="secondaryButton linkButton" href={appPath("/drafts")}>我的作品 {draftCount}</a>
            ) : null}
          </div>
        </div>

        <div className="heroStatusCard panel">
          <div className="heroStatusHeader">
            <h2>本周状态</h2>
            <span>{loading ? "同步中" : "已更新"}</span>
          </div>
          <div className="heroStatusGrid">
            <div>
              <strong>{balance}</strong>
              <span>可用积分</span>
            </div>
            <div>
              <strong>{draftCount}</strong>
              <span>我的作品</span>
            </div>
            <div>
              <strong>{overview?.paidOrders ?? 0}</strong>
              <span>已支付订单</span>
            </div>
            <div>
              <strong>{overview?.pendingOrders ?? 0}</strong>
              <span>待处理订单</span>
            </div>
          </div>
        </div>
      </section>

      <section className="workbenchPanel appPanel">
        <div className="panelHeader workbenchPanelHeader">
          <div>
            <h2>获客创作</h2>
            <p>把最常用的创作入口放在第一屏。</p>
          </div>
          <a href={appPath("/workspace")}>最近使用</a>
        </div>
        <div className="toolCardGrid">
          {actionCards.map((item) => (
            <a className="toolCard" href={appPath(item.href)} key={item.href}>
              <span>{item.badge}</span>
              <strong>{item.title}</strong>
              <p>{item.desc}</p>
            </a>
          ))}
        </div>
      </section>

      {hasDrafts ? (
        <section className="workbenchPanel">
          <div className="panelHeader workbenchPanelHeader">
            <div>
              <h2>我的作品</h2>
              <p>最近产出的作品，方便继续迭代和复用。</p>
            </div>
            <a href={appPath("/drafts")}>更多</a>
          </div>
          <div className="draftCardGrid">
            {(overview?.recentDrafts ?? []).map((draft) => (
              <article className="draftCard" key={draft.id}>
                <div className="draftCardMeta">
                  <span>{draft.platform}</span>
                  <em>{formatDate(draft.updated_at)}</em>
                </div>
                <strong>{draft.title}</strong>
              </article>
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
