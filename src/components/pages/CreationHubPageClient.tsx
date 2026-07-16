"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getCreationExampleBySlug,
  type CreationApp,
  type CreationCategory,
  type CreationCategoryId,
} from "@/lib/apps/catalog";
import { appPath, apiPath } from "@/lib/client/url";
import { useThinkingEntryState } from "@/lib/client/thinking-entry";
import { CreationExamplePageClient } from "@/components/pages/CreationExamplePageClient";

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
  category: CreationCategoryId;
  pointsLabel: string;
  badge?: string;
  description: string;
  hint: string;
  caseSlug?: string;
  actionLabel: "使用" | "需完成思维";
};

const workspaceCards: WorkspaceCard[] = [
  {
    slug: "write-copy",
    appSlug: "write-copy",
    name: "写文案",
    emoji: "🎨",
    category: "content",
    pointsLabel: "5",
    badge: "火",
    description: "把一份真实素材整理成口播、公众号、小红书和朋友圈版本，保持观点一致并适配渠道。",
    hint: "系统会区分事实、观点和待核验信息，再完成多渠道表达。",
    caseSlug: "multi-channel-family-review",
    actionLabel: "使用",
  },
  {
    slug: "image-card",
    appSlug: "image-card",
    name: "做图",
    emoji: "🪄",
    category: "content",
    pointsLabel: "5",
    badge: "火",
    description: "把文章或口述稿整理成原创知识卡片，支持多种通用视觉风格和比例。",
    hint: "优先保证中文可读性、信息层级和内容来源清晰。",
    caseSlug: "knowledge-card-path",
    actionLabel: "使用",
  },
  {
    slug: "video-script-polish",
    appSlug: "video-script-polish",
    name: "口播文案精修",
    emoji: "🔮",
    category: "content",
    pointsLabel: "5",
    badge: "推荐",
    description: "诊断口播底稿的开头、逻辑和口语节奏，在不新增事实的前提下完成精修。",
    hint: "每条修改建议都对应原稿证据，便于对照采用。",
    caseSlug: "spoken-script-review",
    actionLabel: "使用",
  },
  {
    slug: "wechat-article-polish",
    appSlug: "wechat-article-polish",
    name: "公众号文章精修",
    emoji: "🖊️",
    category: "content",
    pointsLabel: "5",
    badge: "推荐",
    description: "在不改变事实与立场的前提下，优化公众号文章的标题、层级、段落和结尾。",
    hint: "信息缺口会被标记，不用流畅表达掩盖不确定性。",
    caseSlug: "wechat-article-clarity",
    actionLabel: "使用",
  },
  {
    slug: "lead-copy",
    appSlug: "lead-copy",
    name: "写引流文案",
    emoji: "🌱",
    category: "content",
    pointsLabel: "5",
    description: "从真实素材中提炼可交付价值，生成口播、小红书和公众号引流内容。",
    hint: "互动动作保持克制，不使用焦虑、虚假稀缺或收益承诺。",
    caseSlug: "consultation-checklist-lead",
    actionLabel: "使用",
  },
  {
    slug: "lead-package",
    appSlug: "lead-package",
    name: "【引流资料】制作",
    emoji: "🎁",
    category: "content",
    pointsLabel: "5",
    description: "围绕一个真实问题生成资料定位、目录、正文、领取说明和发布内容。",
    hint: "资料用于帮助用户整理问题，不替代正式保险建议。",
    caseSlug: "family-risk-workbook",
    actionLabel: "使用",
  },
  {
    slug: "voice-note-copy",
    appSlug: "write-copy",
    name: "录音稿拆解整理",
    emoji: "🎙️",
    category: "content",
    pointsLabel: "5",
    description: "忠实整理录音原意，拆出独立观点、原话亮点和后续创作素材。",
    hint: "不会把未经确认的口误或推测改写成确定事实。",
    actionLabel: "使用",
  },
  {
    slug: "live-script",
    appSlug: "live-script",
    name: "写直播稿",
    emoji: "🎬",
    category: "content",
    pointsLabel: "5",
    description: "根据直播主题、受众、事实材料和互动目标，整理开场、讲解、问答与收尾流程。",
    hint: "涉及产品和案例的内容必须可核验，并在脚本中标记合规边界。",
    caseSlug: "medical-cost-live",
    actionLabel: "使用",
  },
  {
    slug: "topic-picker",
    appSlug: "topic-picker",
    name: "找选题",
    emoji: "✨",
    category: "content",
    pointsLabel: "5",
    description: "结合内容画像生成 6 个选题，覆盖触达、解释和信任三个内容目标。",
    hint: "每个选题包含事实来源要求、写作角度和不应越过的表达边界。",
    caseSlug: "topic-matrix-30-days",
    actionLabel: "需完成思维",
  },
  {
    slug: "general-content",
    appSlug: "general-content",
    name: "泛内容创作",
    emoji: "📝",
    category: "content",
    pointsLabel: "5",
    description: "把输入的内容，变成更有共鸣、容易破圈的口播文案+公众号文章。",
    hint: "适合普通观点、分享型素材和非强销售内容。",
    caseSlug: "retirement-public-topic",
    actionLabel: "使用",
  },
  {
    slug: "wechat-images",
    appSlug: "wechat-images",
    name: "公众号配图",
    emoji: "🖼️",
    category: "content",
    pointsLabel: "5",
    description: "根据公众号文章的章节节奏，生成承担开篇、方法、转折和总结作用的配图。",
    hint: "图片不复制文章全文，只承担章节定位和阅读停顿。",
    caseSlug: "article-image-rhythm",
    actionLabel: "使用",
  },
  {
    slug: "letter",
    appSlug: "letter",
    name: "走心一封信",
    emoji: "📝",
    category: "content",
    pointsLabel: "5",
    description: "根据真实主题、背景和关系，生成适合纪念节点发布的长信与精简版本。",
    hint: "不编造人数、成交、评价或共同经历。",
    caseSlug: "anniversary-letter",
    actionLabel: "使用",
  },
  {
    slug: "xiaohongshu-check",
    appSlug: "xiaohongshu-check",
    name: "小红书违规检测",
    emoji: "🧐",
    category: "content",
    pointsLabel: "5",
    description: "检查绝对化、收益暗示、焦虑营销、隐私和缺少依据的数字，并提供改写建议。",
    hint: "检测用于发布前辅助复核，不代表平台官方审核结论。",
    caseSlug: "platform-copy-check",
    actionLabel: "使用",
  },
  {
    slug: "policy-diagnosis",
    appSlug: "policy-diagnosis",
    name: "保单结构复核",
    emoji: "🛡️",
    category: "content",
    pointsLabel: "5",
    badge: "新！工具",
    description: "整理现有保单的责任、期限、保额与待确认信息，不自动给出购买结论。",
    hint: "缺少正式合同信息时明确列出待确认项，结果不构成保险建议。",
    caseSlug: "policy-structure-review",
    actionLabel: "使用",
  },
  {
    slug: "ip-positioning",
    appSlug: "ip-positioning",
    name: "IP定位",
    emoji: "🎯",
    category: "ip",
    pointsLabel: "5",
    badge: "必用！",
    description: "根据你的思维和业务现状，生成专属 IP 定位、账号标签和内容主线。",
    hint: "从人设、客群、差异化和表达风格四个角度输出定位方案。",
    actionLabel: "需完成思维",
  },
  {
    slug: "breakthrough",
    appSlug: "breakthrough",
    name: "陪你破局增长",
    emoji: "🚀",
    category: "ip",
    pointsLabel: "5",
    description: "把当前卡点拆成问题诊断、破局路径和可执行动作清单。",
    hint: "更偏增长陪跑视角，帮助梳理卡点、动作和复盘指标。",
    actionLabel: "使用",
  },
  {
    slug: "personality-card",
    appSlug: "ip-positioning",
    name: "个性名片",
    emoji: "🪪",
    category: "ip",
    pointsLabel: "5",
    description: "个性名片生成，人群之中记住你！只需上传个人介绍+照片，选风格即可~",
    hint: "更适合做个人形象展示卡，一眼让人记住你是谁、擅长什么。",
    actionLabel: "使用",
  },
  {
    slug: "recruit-script",
    appSlug: "team-recruit",
    name: "增员面谈逐字稿",
    emoji: "📋",
    category: "growth",
    pointsLabel: "5",
    description: "只需上传候选人简历，就能生成一套完整的面试内容，包括：1、候选人画像，2、完整面试流程和话题，3、个性化欢迎、4、应急话术、5、注意事项、6、跟进内容",
    hint: "更适合增员面谈前的准备，快速生成逐字稿和跟进话术。",
    actionLabel: "使用",
  },
  {
    slug: "recruit-followup",
    appSlug: "team-recruit",
    name: "增员跟踪",
    emoji: "🌱",
    category: "growth",
    pointsLabel: "5",
    description: "招募利器！上传和候选人的面谈录音文稿，得到《给ta的一封信》、《候选人信息跟踪表》、《跟踪计划表》、《一篇招募向公众号文章》",
    hint: "更适合面谈后的二次承接和持续跟踪。",
    actionLabel: "使用",
  },
];

export function CreationHubPageClient() {
  const thinkingEntry = useThinkingEntryState();
  const [loading, setLoading] = useState(true);
  const [hubData, setHubData] = useState<HubPayload | null>(null);
  const [activeCategory, setActiveCategory] = useState<CreationCategoryId>("content");
  const [openExampleSlug, setOpenExampleSlug] = useState<string | null>(null);

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

  const apps = useMemo(() => hubData?.apps ?? [], [hubData]);
  const appMap = useMemo(() => new Map(apps.map((app) => [app.slug, app])), [apps]);
  const visibleApps = useMemo(
    () => workspaceCards.filter((app) => app.category === activeCategory),
    [activeCategory],
  );
  const openExample = useMemo(
    () => (openExampleSlug ? getCreationExampleBySlug(openExampleSlug) : null),
    [openExampleSlug],
  );
  const openExampleApp = useMemo(
    () => (openExample ? appMap.get(openExample.appSlug) ?? null : null),
    [appMap, openExample],
  );

  const workspaceCategories = useMemo(
    () => ([
      { id: "content", label: "内容创作", count: 14 },
      { id: "ip", label: "IP&破局", count: 3 },
      { id: "growth", label: "帮你增员", count: 2 },
    ] as const),
    [],
  );
  const showSummary = activeCategory === "content";
  const categoryLead = activeCategory === "ip"
    ? "刚用平台的伙伴必用！这里的每一个智能体都关乎你的增长与变现。"
    : activeCategory === "growth"
      ? ""
      : null;

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
      <section className="workspaceHubHero">
        <div className="workspaceHubHeroIcon" aria-hidden="true">💡</div>
        <div className="workspaceHubHeroCopy">
          <strong>{thinkingEntry.title}</strong>
          <p>{thinkingEntry.description}</p>
        </div>
        <div className="workspaceHubHeroActions">
          <a className="primaryButton linkButton workspaceHubHeroAction" href={thinkingEntry.href}>{thinkingEntry.actionLabel}</a>
        </div>
      </section>

      {showSummary ? (
        <section className="workspaceHubSummary">
          <div className="workspaceHubSummaryHeader">
            <div>
              <h2>围绕获客增长的全场景 AI 内容创作应用</h2>
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
      ) : null}

      <section className="workspaceHubSection">
        <div className="workspaceHubTabsHeader">
          <strong className="workspaceHubTabsTitle">分类</strong>
          <div className="workspaceHubTabs">
            {workspaceCategories.map((category) => (
              <button
                className={category.id === activeCategory ? "workspaceHubTab active" : "workspaceHubTab"}
                key={category.id}
                onClick={() => setActiveCategory(category.id)}
                type="button"
              >
                {category.label}
                <span>({category.count})</span>
              </button>
            ))}
          </div>
        </div>
        {categoryLead ? <p className="workspaceHubCategoryLead">{categoryLead}</p> : null}

        <div className="workspaceHubGrid">
          {visibleApps.map((card) => (
            <article className={`workspaceHubCard ${getCardThemeClass(card.badge)}`} key={card.slug}>
              <div className="workspaceHubCardHeader">
                <span className="workspaceHubCardIcon">{card.emoji}</span>
              </div>

              <div className="workspaceHubCardBody">
                <strong>{card.name}</strong>
                <p>{card.description}</p>
              </div>

              <div className="workspaceHubCardFooter">
                {card.caseSlug ? (
                  <button
                    className="workspaceHubGhostButton"
                    onClick={() => setOpenExampleSlug(card.caseSlug ?? null)}
                    type="button"
                  >
                    案例
                  </button>
                ) : (
                  <span className="workspaceHubCardSpacer" aria-hidden="true" />
                )}
                <a className="workspaceHubUseButton" href={resolveWorkspaceHref(card)}>
                  {resolveWorkspaceActionLabel(card)}
                </a>
              </div>
            </article>
          ))}
        </div>
      </section>

      {openExample && openExampleApp ? (
        <CreationExamplePageClient
          app={openExampleApp}
          example={openExample}
          mode="modal"
          onClose={() => setOpenExampleSlug(null)}
        />
      ) : null}
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
  if (card.actionLabel === "需完成思维") {
    return "先创建思维";
  }
  return card.actionLabel;
}

function resolveWorkspaceHref(card: WorkspaceCard) {
  if (card.actionLabel === "需完成思维") return appPath("/thinking");
  return appPath(`/apps/${card.appSlug}?from=workspace&entry=${card.slug}`);
}
