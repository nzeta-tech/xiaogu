"use client";

import { useEffect, useState } from "react";
import {
  type CreationApp,
  type CreationCategory,
} from "@/lib/apps/catalog";
import { appPath, apiPath } from "@/lib/client/url";

type HubPayload = {
  hub: {
    balance: number;
    announcements: Array<{ id: string; title: string; content: string }>;
    worksView: {
      draftCount: number;
      recentDrafts: Array<{ id: string; title: string; platform: string; updated_at?: string }>;
    };
    appUsage: Array<{ appId: string; usedCount: number }>;
  };
  categories: Array<CreationCategory & { count: number }>;
  apps: CreationApp[];
};

function isHubPayload(value: unknown): value is HubPayload {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return Boolean(record.hub && record.categories && record.apps);
}

type WorkspaceCard = {
  slug: string;
  appSlug: string;
  name: string;
  emoji: string;
  pointsLabel: string;
  badge?: string;
  description: string;
  hint: string;
  actionLabel: "使用" | "需完善人设";
};

const workspaceCards: WorkspaceCard[] = [
  {
    slug: "write-copy",
    appSlug: "write-copy",
    name: "写文案",
    emoji: "🎨",
    pointsLabel: "5",
    badge: "火",
    description: "用同一份真实素材生成口播、公众号、小红书和朋友圈内容，并针对各平台调整表达方式。",
    hint: "系统会区分事实、观点和待核验信息，再完成多渠道表达。",
    actionLabel: "使用",
  },
  {
    slug: "image-card",
    appSlug: "image-card",
    name: "做图",
    emoji: "🪄",
    pointsLabel: "5",
    badge: "火",
    description: "将文章、口述稿或主题转成原创知识卡片，可自由选择视觉样式和画面比例。",
    hint: "优先保证中文可读性、信息层级和内容来源清晰。",
    actionLabel: "使用",
  },
  {
    slug: "video-script-polish",
    appSlug: "video-script-polish",
    name: "口播文案精修",
    emoji: "🔮",
    pointsLabel: "5",
    badge: "推荐",
    description: "从开场吸引力、内容逻辑和说话节奏三个方面检查口播底稿，并在保留事实的基础上优化。",
    hint: "每条修改建议都对应原稿证据，便于对照采用。",
    actionLabel: "使用",
  },
  {
    slug: "wechat-article-polish",
    appSlug: "wechat-article-polish",
    name: "公众号文章精修",
    emoji: "🖊️",
    pointsLabel: "5",
    badge: "推荐",
    description: "保留原文事实和核心立场，重新打磨公众号文章的标题、结构、段落衔接与收尾。",
    hint: "信息缺口会被标记，不用流畅表达掩盖不确定性。",
    actionLabel: "使用",
  },
  {
    slug: "lead-copy",
    appSlug: "lead-copy",
    name: "写引流文案",
    emoji: "🌱",
    pointsLabel: "5",
    description: "提炼素材中真正能帮助读者的内容，分别产出口播、小红书和公众号引流文案。",
    hint: "互动动作保持克制，不使用焦虑、虚假稀缺或收益承诺。",
    actionLabel: "使用",
  },
  {
    slug: "traffic-copy",
    appSlug: "traffic-copy",
    name: "流量文案",
    emoji: "⚡",
    pointsLabel: "5",
    badge: "新",
    description: "把热点、事件和观点改写成更有冲突感、代入感与传播力的流量内容。",
    hint: "强调反常识钩子、逻辑推进和普通人场景，不把推测写成事实。",
    actionLabel: "使用",
  },
  {
    slug: "marketing-copy",
    appSlug: "marketing-copy",
    name: "营销文案",
    emoji: "📣",
    pointsLabel: "5",
    badge: "新",
    description: "围绕客户、产品和方案，从产品、方案、案例、观念四个方向生成可信营销内容。",
    hint: "同时呈现价值与规则边界，保留具体而克制的互动承接。",
    actionLabel: "使用",
  },
  {
    slug: "lead-package",
    appSlug: "lead-package",
    name: "【引流资料】制作",
    emoji: "🎁",
    pointsLabel: "5",
    description: "从一个具体问题出发，完整生成资料定位、内容目录、正文、领取说明和发布文案。",
    hint: "资料用于帮助用户整理问题，不替代正式保险建议。",
    actionLabel: "使用",
  },
  {
    slug: "voice-note-copy",
    appSlug: "write-copy",
    name: "录音稿拆解整理",
    emoji: "🎙️",
    pointsLabel: "5",
    description: "在保留录音原意的基础上，拆分出清晰观点、精彩原话和可继续加工的内容素材。",
    hint: "不会把未经确认的口误或推测改写成确定事实。",
    actionLabel: "使用",
  },
  {
    slug: "live-script",
    appSlug: "live-script",
    name: "写直播稿",
    emoji: "🎬",
    pointsLabel: "5",
    description: "结合直播主题、目标观众、已有材料和互动目的，生成从开场到收尾的完整直播脚本。",
    hint: "涉及产品和案例的内容必须可核验，并在脚本中标记合规边界。",
    actionLabel: "使用",
  },
  {
    slug: "topic-picker",
    appSlug: "topic-picker",
    name: "找选题",
    emoji: "✨",
    pointsLabel: "5",
    description: "基于你的内容画像一次生成 6 个选题，同时兼顾扩大触达、讲清问题和建立信任。",
    hint: "每个选题包含事实来源要求、写作角度和不应越过的表达边界。",
    actionLabel: "需完善人设",
  },
  {
    slug: "general-content",
    appSlug: "general-content",
    name: "泛内容创作",
    emoji: "📝",
    pointsLabel: "5",
    description: "从输入素材中提炼更具普遍共鸣的切入点，生成口播稿和公众号文章。",
    hint: "适合普通观点、分享型素材和非强销售内容。",
    actionLabel: "使用",
  },
  {
    slug: "wechat-images",
    appSlug: "wechat-images",
    name: "公众号配图",
    emoji: "🖼️",
    pointsLabel: "5",
    description: "分析公众号文章的章节节奏，为开篇、重点、转折和总结分别生成合适的配图。",
    hint: "图片不复制文章全文，只承担章节定位和阅读停顿。",
    actionLabel: "使用",
  },
  {
    slug: "letter",
    appSlug: "letter",
    name: "走心一封信",
    emoji: "📝",
    pointsLabel: "5",
    description: "结合真实主题、事件背景和人物关系，写出适合重要节点发布的长信及精简稿。",
    hint: "不编造人数、成交、评价或共同经历。",
    actionLabel: "使用",
  },
  {
    slug: "xiaohongshu-check",
    appSlug: "xiaohongshu-check",
    name: "小红书违规检测",
    emoji: "🧐",
    pointsLabel: "5",
    description: "识别文案中的绝对化表达、收益暗示、焦虑营销、隐私问题和无依据数据，并给出修改方案。",
    hint: "检测用于发布前辅助复核，不代表平台官方审核结论。",
    actionLabel: "使用",
  },
  {
    slug: "policy-diagnosis",
    appSlug: "policy-diagnosis",
    name: "保单结构复核",
    emoji: "🛡️",
    pointsLabel: "5",
    badge: "新！工具",
    description: "梳理现有保单的保障责任、期限、保额和信息缺口，列出需要进一步确认的问题。",
    hint: "缺少正式合同信息时明确列出待确认项，结果不构成保险建议。",
    actionLabel: "使用",
  },
  {
    slug: "ip-positioning",
    appSlug: "ip-positioning",
    name: "IP定位",
    emoji: "🎯",
    pointsLabel: "5",
    badge: "必用！",
    description: "结合个人人设画像与当前业务情况，明确 IP 定位、账号标签和长期内容方向。",
    hint: "从人设、客群、差异化和表达风格四个角度输出定位方案。",
    actionLabel: "需完善人设",
  },
  {
    slug: "breakthrough",
    appSlug: "breakthrough",
    name: "陪你破局增长",
    emoji: "🚀",
    pointsLabel: "5",
    description: "分析目前阻碍增长的关键问题，给出突破路径、阶段动作和可直接执行的任务清单。",
    hint: "更偏增长陪跑视角，帮助梳理卡点、动作和复盘指标。",
    actionLabel: "使用",
  },
  {
    slug: "personality-card",
    appSlug: "ip-positioning",
    name: "个性名片",
    emoji: "🪪",
    pointsLabel: "5",
    description: "根据个人介绍和照片生成风格化名片，集中呈现你的身份、专长与个人特点。",
    hint: "更适合做个人形象展示卡，一眼让人记住你是谁、擅长什么。",
    actionLabel: "使用",
  },
  {
    slug: "recruit-script",
    appSlug: "team-recruit",
    name: "增员面谈逐字稿",
    emoji: "📋",
    pointsLabel: "5",
    description: "根据候选人简历整理人物画像、面谈流程、沟通话题、欢迎话术、注意事项和后续跟进内容。",
    hint: "更适合增员面谈前的准备，快速生成逐字稿和跟进话术。",
    actionLabel: "使用",
  },
  {
    slug: "recruit-followup",
    appSlug: "team-recruit",
    name: "增员跟踪",
    emoji: "🌱",
    pointsLabel: "5",
    description: "分析候选人面谈记录，生成沟通信件、信息跟踪表、后续计划和招募主题公众号文章。",
    hint: "更适合面谈后的二次承接和持续跟踪。",
    actionLabel: "使用",
  },
];

const hiddenWorkspaceCardSlugs = new Set([
  "wechat-article-polish",
  "lead-package",
  "voice-note-copy",
  "live-script",
  "policy-diagnosis",
  "breakthrough",
  "personality-card",
  "recruit-script",
  "recruit-followup",
]);

const visibleWorkspaceCards = workspaceCards.filter((card) => !hiddenWorkspaceCardSlugs.has(card.slug));

export function CreationHubPageClient() {
  const [loading, setLoading] = useState(true);
  const [hubData, setHubData] = useState<HubPayload | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function loadHub() {
      try {
        setLoading(true);
        const response = await fetch(apiPath("/api/creation/hub"), { signal: controller.signal });
        const payload = (await response.json()) as unknown;
        if (!response.ok || !isHubPayload(payload)) {
          setHubData(null);
          return;
        }
        setHubData(payload);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        throw error;
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }
    void loadHub();
    return () => controller.abort();
  }, []);

  if (loading) {
    return <div className="pageStack"><section className="panel emptyState">正在加载获客创作广场...</section></div>;
  }

  if (!hubData) {
    return (
      <div className="pageStack">
        <section className="panel emptyState">广场数据暂不可用，请刷新后重试。</section>
      </div>
    );
  }

  return (
    <div className="pageStack creationHubPage workspaceHubPage">
      <section className="workspaceHubSummary">
        <div className="workspaceHubSummaryHeader">
          <div>
            <h2>围绕获客增长的 AI 内容创作应用</h2>
          </div>
          <a className="workspaceHubGuideLink" href={appPath("/help")}>使用攻略</a>
        </div>
        <div className="workspaceHubWorksStrip">
          <div className="workspaceHubWorksCopy">
            <strong>我的作品</strong>
            <span>查看全部创作记录</span>
          </div>
          <a className="workspaceHubWorksAction" href={appPath("/drafts")}>
            {(hubData?.hub.worksView.draftCount ?? 0).toLocaleString("zh-CN")} 篇作品
          </a>
        </div>
      </section>

      <section className="workspaceHubSection">
        <div className="workspaceHubGrid">
          {visibleWorkspaceCards.map((card) => (
            <article className={`workspaceHubCard ${getCardThemeClass(card.badge)}`} key={card.slug}>
              <div className="workspaceHubCardHeader">
                <span className="workspaceHubCardIcon">{card.emoji}</span>
              </div>

              <div className="workspaceHubCardBody">
                <strong>{card.name}</strong>
                <p>{card.description}</p>
              </div>

              <div className="workspaceHubCardFooter">
                <a className="workspaceHubUseButton" href={resolveWorkspaceHref(card)}>
                  {resolveWorkspaceActionLabel(card)}
                </a>
              </div>
            </article>
          ))}
        </div>
      </section>

    </div>
  );
}

function getCardThemeClass(badge?: string) {
  if (!badge) return "theme-default";
  if (badge.includes("火")) return "theme-orange";
  if (badge.includes("推荐")) return "theme-blue-purple";
  if (badge.includes("钻石") || badge.includes("至尊")) return "theme-orange";
  if (badge.includes("重磅") || badge.includes("新")) return "theme-soft";
  return "theme-default";
}

function resolveWorkspaceActionLabel(card: WorkspaceCard) {
  if (card.actionLabel === "需完善人设") {
    return "先完善人设";
  }
  return card.actionLabel;
}

function resolveWorkspaceHref(card: WorkspaceCard) {
  if (card.actionLabel === "需完善人设") return appPath("/thinking");
  return appPath(`/apps/${card.appSlug}?from=workspace&entry=${card.slug}`);
}
