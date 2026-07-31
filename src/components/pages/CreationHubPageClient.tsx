"use client";

import Image from "next/image";
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
  appRuntime?: Record<string, { available: boolean; reason: string; lastSeenAt?: string | null }>;
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
  goals: WorkspaceGoal[];
};

type WorkspaceGoal = "all" | "attention" | "trust" | "conversion" | "brand" | "polish";

type WorkspaceCategory = "all" | "copy" | "video" | "image" | "brand";

const workspaceCategories: Array<{ id: WorkspaceCategory; label: string; description: string }> = [
  { id: "all", label: "全部应用", description: "浏览所有创作能力" },
  { id: "copy", label: "文案", description: "选题、引流与多渠道表达" },
  { id: "video", label: "短视频 & 直播", description: "口播、画面与镜头表达" },
  { id: "image", label: "做图", description: "知识卡片与文章配图" },
  { id: "brand", label: "个人品牌", description: "定位与长期内容资产" },
];

const workspaceCards: WorkspaceCard[] = [
  {
    slug: "ppt-maker",
    appSlug: "ppt-maker",
    name: "PPT轻松制作",
    emoji: "📊",
    pointsLabel: "12",
    badge: "新",
    description: "输入主题或上传资料，自动生成可下载、可编辑的汇报 PPT。",
    hint: "输入想法或上传资料，轻松生成一份可下载、可编辑的专业 PPT。",
    actionLabel: "使用",
    goals: ["trust", "conversion", "brand"],
  },
  {
    slug: "write-copy",
    appSlug: "write-copy",
    name: "多平台文案创作",
    emoji: "🎨",
    pointsLabel: "5",
    badge: "火",
    description: "用同一份真实素材生成口播、公众号、小红书和朋友圈内容，并针对各平台调整表达方式。",
    hint: "系统会区分事实、观点和待核验信息，再完成多渠道表达。",
    actionLabel: "使用",
    goals: ["attention", "trust", "conversion"],
  },
  {
    slug: "link-remix",
    appSlug: "link-remix",
    name: "爆款灵感改编",
    emoji: "🔗",
    pointsLabel: "8",
    badge: "新",
    description: "粘贴视频号、抖音、公众号或小红书作品链接，提炼内容结构，生成适合你的多平台原创文案。",
    hint: "未填写修改建议时，会结合你的用户画像和账号特点完成二创。",
    actionLabel: "使用",
    goals: ["attention", "trust", "conversion"],
  },
  {
    slug: "image-card",
    appSlug: "image-card",
    name: "知识卡片制作（图片）",
    emoji: "🪄",
    pointsLabel: "5",
    badge: "火",
    description: "将文章、口述稿或主题转成原创知识卡片，可自由选择视觉样式和画面比例。",
    hint: "优先保证中文可读性、信息层级和内容来源清晰。",
    actionLabel: "使用",
    goals: ["attention", "trust"],
  },
  {
    slug: "video-script-polish",
    appSlug: "video-script-polish",
    name: "口播稿优化",
    emoji: "🔮",
    pointsLabel: "5",
    badge: "推荐",
    description: "从开场吸引力、内容逻辑和说话节奏三个方面检查口播底稿，并在保留事实的基础上优化。",
    hint: "每条修改建议都对应原稿证据，便于对照采用。",
    actionLabel: "使用",
    goals: ["polish", "trust"],
  },
  {
    slug: "policy-renewal-card",
    appSlug: "policy-renewal-card",
    name: "保单续保提醒卡（图片）",
    emoji: "🗓️",
    pointsLabel: "5",
    badge: "新",
    description: "填写续保日期、保费和顾问信息，生成文字准确、适合微信发送的服务提醒图片。",
    hint: "保单号默认脱敏，客户与保单信息不会发送给图片模型。",
    actionLabel: "使用",
    goals: ["trust", "conversion"],
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
    goals: ["polish", "trust"],
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
    goals: ["attention", "conversion"],
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
    goals: ["attention"],
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
    goals: ["conversion"],
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
    goals: ["conversion", "trust"],
  },
  {
    slug: "voice-note-copy",
    appSlug: "write-copy",
    name: "录音转文字素材",
    emoji: "🎙️",
    pointsLabel: "5",
    description: "在保留录音原意的基础上，拆分出清晰观点、精彩原话和可继续加工的内容素材。",
    hint: "不会把未经确认的口误或推测改写成确定事实。",
    actionLabel: "使用",
    goals: ["polish"],
  },
  {
    slug: "live-script",
    appSlug: "live-script",
    name: "直播脚本生成",
    emoji: "🎬",
    pointsLabel: "5",
    description: "结合直播主题、目标观众、已有材料和互动目的，生成从开场到收尾的完整直播脚本。",
    hint: "涉及产品和案例的内容必须可核验，并在脚本中标记合规边界。",
    actionLabel: "使用",
    goals: ["trust", "conversion"],
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
    goals: ["attention", "brand"],
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
    goals: ["trust"],
  },
  {
    slug: "wechat-images",
    appSlug: "wechat-images",
    name: "文章配图生成",
    emoji: "🖼️",
    pointsLabel: "5",
    description: "分析公众号文章的章节节奏，为开篇、重点、转折和总结分别生成合适的配图。",
    hint: "图片不复制文章全文，只承担章节定位和阅读停顿。",
    actionLabel: "使用",
    goals: ["polish"],
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
    goals: ["brand", "trust"],
  },
  {
    slug: "xiaohongshu-check",
    appSlug: "xiaohongshu-check",
    name: "小红书文案风险检查",
    emoji: "🧐",
    pointsLabel: "5",
    description: "识别文案中的绝对化表达、收益暗示、焦虑营销、隐私问题和无依据数据，并给出修改方案。",
    hint: "检测用于发布前辅助复核，不代表平台官方审核结论。",
    actionLabel: "使用",
    goals: ["polish"],
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
    goals: ["trust", "conversion"],
  },
  {
    slug: "ip-positioning",
    appSlug: "ip-positioning",
    name: "个人品牌定位",
    emoji: "🎯",
    pointsLabel: "5",
    badge: "必用！",
    description: "结合个人人设画像与当前业务情况，明确 IP 定位、账号标签和长期内容方向。",
    hint: "从人设、客群、差异化和表达风格四个角度输出定位方案。",
    actionLabel: "需完善人设",
    goals: ["brand"],
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
    goals: ["brand", "conversion"],
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
    goals: ["brand"],
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
    goals: ["conversion"],
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
    goals: ["conversion"],
  },
];

const hiddenWorkspaceCardSlugs = new Set([
  "lead-copy",
  "wechat-article-polish",
  "lead-package",
  "topic-picker",
  "general-content",
  "letter",
  "xiaohongshu-check",
  "policy-diagnosis",
  "breakthrough",
  "personality-card",
  "recruit-script",
  "recruit-followup",
]);

const visibleWorkspaceCards = workspaceCards.filter((card) => !hiddenWorkspaceCardSlugs.has(card.slug));

const workspaceIconUrls: Record<string, string> = {
  "ppt-maker": "/icons/creation/landscape.webp",
  "write-copy": "/icons/creation/book-pencil.webp",
  "image-card": "/icons/creation/palette.webp",
  "video-script-polish": "/icons/creation/microphone.webp",
  "policy-renewal-card": "/icons/creation/calendar.webp",
  "lead-copy": "/icons/creation/sprout.webp",
  "traffic-copy": "/icons/creation/lightning.webp",
  "marketing-copy": "/icons/creation/megaphone.webp",
  "lead-package": "/icons/creation/book-pencil.webp",
  "voice-note-copy": "/icons/creation/microphone.webp",
  "live-script": "/icons/creation/microphone.webp",
  "topic-picker": "/icons/creation/idea.webp",
  "general-content": "/icons/creation/book-pencil.webp",
  "wechat-images": "/icons/creation/landscape.webp",
  "letter": "/icons/creation/book-pencil.webp",
  "xiaohongshu-check": "/icons/creation/warning.webp",
  "policy-diagnosis": "/icons/creation/warning.webp",
  "ip-positioning": "/icons/creation/map-pin.webp",
  "breakthrough": "/icons/creation/lightning.webp",
  "personality-card": "/icons/creation/sprout.webp",
  "recruit-script": "/icons/creation/calendar.webp",
  "recruit-followup": "/icons/creation/sprout.webp",
};

export function CreationHubPageClient() {
  const [loading, setLoading] = useState(true);
  const [hubData, setHubData] = useState<HubPayload | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<WorkspaceCategory>("all");
  const [search, setSearch] = useState("");
  const hasHubData = hubData !== null;

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

  useEffect(() => {
    if (!hubData) return;
    const controller = new AbortController();
    async function refreshAgentAvailability() {
      try {
        const entries = await Promise.all(["link-remix", "ppt-maker"].map(async (appSlug) => {
          const path = appSlug === "ppt-maker" ? "/api/creation/ppt/availability" : "/api/creation/link-remix/availability";
          const response = await fetch(apiPath(path), { cache: "no-store", signal: controller.signal });
          const runtime = await response.json().catch(() => ({})) as { available?: boolean; reason?: string; lastSeenAt?: string | null };
          return typeof runtime.available === "boolean" ? [appSlug, runtime] as const : null;
        }));
        const appRuntime = Object.fromEntries(entries.filter((entry): entry is readonly [string, { available: boolean; reason?: string; lastSeenAt?: string | null }] => entry !== null).map(([appSlug, runtime]) => [appSlug, { available: runtime.available, reason: runtime.reason ?? "", lastSeenAt: runtime.lastSeenAt }]));
        if (Object.keys(appRuntime).length === 0) return;
        setHubData((current) => current ? {
          ...current,
          appRuntime: { ...(current.appRuntime ?? {}), ...appRuntime },
        } : current);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) console.error("Failed to refresh local Agent availability", error);
      }
    }
    void refreshAgentAvailability();
    const timer = window.setInterval(() => void refreshAgentAvailability(), 15000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [hasHubData]);

  if (loading) {
    return <div className="pageStack"><section className="panel emptyState">正在加载创作广场...</section></div>;
  }

  if (!hubData) {
    return (
      <div className="pageStack">
        <section className="panel emptyState">广场数据暂不可用，请刷新后重试。</section>
      </div>
    );
  }

  const usageByApp = new Map(hubData.hub.appUsage.map((item) => [item.appId, item.usedCount]));
  const frequentCards = getFrequentCards(usageByApp);
  const hasFrequentUsage = frequentCards.some((card) => getUsageCount(card, usageByApp) > 0);
  const filteredCards = visibleWorkspaceCards
    .filter((card) => selectedCategory === "all" || getWorkspaceCategory(card) === selectedCategory)
    .filter((card) => `${card.name}${card.description}`.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((left, right) => getUsageCount(right, usageByApp) - getUsageCount(left, usageByApp));

  return (
    <div className="pageStack creationHubPage workspaceHubPage">
      <section className="workspaceFrequent" aria-labelledby="workspace-frequent-title">
        <div className="workspaceFrequentHeader">
          <div>
            <span>{hasFrequentUsage ? "按使用习惯整理" : "适合从这里开始"}</span>
            <h2 id="workspace-frequent-title">{hasFrequentUsage ? "常用应用" : "推荐应用"}</h2>
          </div>
          <a href={appPath("/works")}>{hubData.hub.worksView.draftCount.toLocaleString("zh-CN")} 篇作品</a>
        </div>
        <div className="workspaceFrequentGrid">
          {frequentCards.map((card) => {
            const unavailable = isWorkspaceCardUnavailable(card, hubData);
            const content = <>
              <span className={`workspaceFrequentIcon workspaceFrequentIcon-${getWorkspaceCategory(card)}`} aria-hidden="true"><WorkspaceIcon card={card} /></span>
              <div>
                <strong>{card.name}</strong>
                <span>{unavailable ? getUnavailableLabel(card) : getUsageCount(card, usageByApp) > 0 ? `已使用 ${getUsageCount(card, usageByApp)} 次` : getCardInspiration(card)}</span>
              </div>
              <em aria-hidden="true">→</em>
            </>;
            return unavailable
              ? <div aria-disabled="true" className="workspaceFrequentUnavailable" key={`frequent-${card.slug}`} title={getUnavailableLabel(card)}>{content}</div>
              : <a href={resolveWorkspaceHref(card)} key={`frequent-${card.slug}`}>{content}</a>;
          })}
        </div>
      </section>

      <section className="workspaceHubSection">
        <div className="workspaceCatalogHeader">
          <div>
            <span>创作应用</span>
            <h2>今天想创作什么</h2>
            <p>从内容形式出发，快速找到适合这次表达的创作方式。</p>
          </div>
          <div className="workspaceCatalogActions">
            <label>
              <span className="srOnly">搜索创作工具</span>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索工具" type="search" />
            </label>
            <a href={appPath("/help")}>使用攻略</a>
          </div>
        </div>
        <div className="workspaceCategoryTabs" aria-label="应用分类">
          {workspaceCategories.map((category) => (
            <button className={selectedCategory === category.id ? "active" : ""} key={category.id} onClick={() => setSelectedCategory(category.id)} type="button">
              <strong>{category.label}</strong>
              <span>{category.description}</span>
            </button>
          ))}
        </div>
        <div className="workspaceHubGrid">
          {filteredCards.map((card) => {
            const unavailable = isWorkspaceCardUnavailable(card, hubData);
            return <article className={`workspaceHubCard workspaceCard-${getWorkspaceCategory(card)} ${getCardThemeClass(card.badge)} ${unavailable ? "workspaceHubCardUnavailable" : ""}`} key={card.slug}>
              <div className="workspaceHubCardHeader">
                <span className="workspaceHubCardIcon" aria-hidden="true"><WorkspaceIcon card={card} /></span>
                <div>
                  <span className="workspaceCardCategory">{getWorkspaceCategoryLabel(card)}</span>
                  {card.badge ? <em>{card.badge.replace("！", "")}</em> : null}
                  {getUsageCount(card, usageByApp) > 0 ? <small>使用过 {getUsageCount(card, usageByApp)} 次</small> : null}
                </div>
              </div>

              <div className="workspaceHubCardBody">
                <strong>{card.name}</strong>
                <p>{card.description}</p>
                <div className="workspaceCardInspiration"><span>灵感</span><p>{getCardInspiration(card)}</p></div>
              </div>

              <div className="workspaceHubCardFooter">
                <span>{card.pointsLabel} 积分 · {getCardOutputLabel(card)}</span>
                {unavailable
                  ? <button className="workspaceHubUseButton" disabled title={getUnavailableLabel(card)} type="button">{getUnavailableLabel(card)}</button>
                  : <a className="workspaceHubUseButton" href={resolveWorkspaceHref(card)}>{resolveWorkspaceActionLabel(card)} <span aria-hidden="true">→</span></a>}
              </div>
            </article>
          })}
        </div>
        {filteredCards.length === 0 ? <div className="workspaceCatalogEmpty">没有找到匹配的创作工具，试试其他目标或关键词。</div> : null}
      </section>

    </div>
  );
}

function WorkspaceIcon({ card }: { card: WorkspaceCard }) {
  const iconUrl = workspaceIconUrls[card.slug] ?? workspaceIconUrls[card.appSlug];
  if (!iconUrl) return <>{card.emoji}</>;
  return <Image alt="" height={512} src={iconUrl} width={512} />;
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
  if (card.actionLabel === "需完善人设") return appPath("/avatar");
  return appPath(`/apps/${card.appSlug}?from=create&entry=${card.slug}`);
}

function isWorkspaceCardUnavailable(card: WorkspaceCard, hub: HubPayload) {
  return hub.appRuntime?.[card.appSlug]?.available === false;
}

function getUnavailableLabel(card: WorkspaceCard) {
  return card.appSlug === "ppt-maker" ? "PPT暂时不可用" : "功能暂不可用";
}

function getUsageCount(card: WorkspaceCard, usageByApp: Map<string, number>) {
  return usageByApp.get(card.slug) ?? usageByApp.get(card.appSlug) ?? 0;
}

function getCardOutputLabel(card: WorkspaceCard) {
  if (card.slug === "image-card" || card.slug === "wechat-images" || card.slug === "policy-renewal-card") return "图片结果";
  if (card.slug.includes("check")) return "风险报告";
  if (card.slug === "topic-picker") return "6 个选题";
  return "可编辑文案";
}

function getWorkspaceCategory(card: WorkspaceCard): Exclude<WorkspaceCategory, "all"> {
  if (["video-script-polish", "voice-note-copy", "live-script"].includes(card.slug)) return "video";
  if (["image-card", "wechat-images", "policy-renewal-card"].includes(card.slug)) return "image";
  if (["topic-picker", "ip-positioning", "letter"].includes(card.slug)) return "brand";
  return "copy";
}

function getWorkspaceCategoryLabel(card: WorkspaceCard) {
  const category = getWorkspaceCategory(card);
  if (category === "video") return "短视频 & 直播";
  if (category === "image") return "做图";
  if (category === "brand") return "个人品牌";
  return "文案";
}

function getCardInspiration(card: WorkspaceCard) {
  const inspirations: Record<string, string> = {
    "write-copy": "把一次客户提问，变成能发布的口播和朋友圈。",
    "link-remix": "参考一条爆款作品，转化成适合自己账号的原创内容。",
    "image-card": "把复杂保险知识，做成一眼能看懂的知识卡片。",
    "policy-renewal-card": "把续费日期和金额整理成一张有温度、不会写错字的提醒卡。",
    "video-script-polish": "让平淡的开场更抓人，让表达更像真实说话。",
    "voice-note-copy": "把一段随口说出的想法，整理成清晰、有个人感的素材。",
    "live-script": "从开场、讲解到互动收尾，搭好一场直播的完整节奏。",
    "lead-copy": "从一个具体问题切入，让真正需要的人愿意了解。",
    "traffic-copy": "借一个当下话题，说清普通人真正关心的风险。",
    "marketing-copy": "不硬推产品，也能把方案价值讲得具体可信。",
    "topic-picker": "围绕你的客群，一次打开六个可持续表达方向。",
    "general-content": "把生活感受和真实经历，沉淀成有共鸣的内容。",
    "wechat-images": "让长文章在重点、转折和总结处更有阅读节奏。",
    "letter": "在重要节点，用一封信说出平时没说完整的话。",
    "xiaohongshu-check": "发布前检查一次，避免好内容被高风险表达拖累。",
    "ip-positioning": "找到别人为什么记住你，以及你应该长期讲什么。",
  };
  return inspirations[card.slug] ?? card.hint;
}

function getFrequentCards(usageByApp: Map<string, number>) {
  const uniqueApps = visibleWorkspaceCards.filter((card, index, cards) => cards.findIndex((item) => item.appSlug === card.appSlug) === index);
  const ranked = uniqueApps.sort((left, right) => getUsageCount(right, usageByApp) - getUsageCount(left, usageByApp));
  if (ranked.some((card) => getUsageCount(card, usageByApp) > 0)) return ranked.slice(0, 3);
  const fallbackSlugs = ["write-copy", "image-card", "traffic-copy"];
  return fallbackSlugs
    .map((slug) => visibleWorkspaceCards.find((card) => card.slug === slug))
    .filter((card): card is WorkspaceCard => Boolean(card));
}
