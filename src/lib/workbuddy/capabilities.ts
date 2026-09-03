import { creationApps, type CreationApp } from "@/lib/apps/catalog";
import { hiddenWorkspaceCardSlugs } from "@/lib/apps/workspace-visibility";
import type { CreationFieldValue } from "@/lib/creation/output";
import { tryListCreationCatalog, trySyncCreationCatalog } from "@/lib/db/repositories";

export type CapabilityKind = "app" | "skill" | "mcp" | "connector" | "agent";
export type CapabilityRisk = "read" | "generate" | "external-write";
export type CapabilityExecutionMode = "sync" | "async" | "interactive";

export type WorkbuddyCapability = {
  id: string;
  kind: CapabilityKind;
  name: string;
  description: string;
  appSlug?: string;
  riskLevel: CapabilityRisk;
  executionMode: CapabilityExecutionMode;
  outputTypes: Array<"text" | "image" | "presentation" | "video" | "data">;
  autoInvoke: boolean;
  systemSkill?: boolean;
  skillIcon?: string;
  skillOrder?: number;
  nativeType?: "general-orchestrator" | "customer-followup" | "product-analysis" | "team-review" | "deep-research" | "fast-research" | "hot-topic-discovery" | "video-link-summary" | "link-reader" | "file-analysis";
  buildInput: (input: CapabilityTaskInput, app: CreationApp) => Record<string, CreationFieldValue>;
};

export type CapabilityTaskInput = {
  objective: string;
  context: string;
  previousArtifact?: string;
  followup?: string;
  searchQueries?: string[];
};

const sourceText = (input: CapabilityTaskInput) => [
  input.objective,
  input.context && `补充资料：\n${input.context}`,
  input.previousArtifact && `已有版本：\n${input.previousArtifact}`,
  input.followup && `本轮修改要求：\n${input.followup}`,
].filter(Boolean).join("\n\n");

function selectedTrafficCoachIds(input: CapabilityTaskInput) {
  const text = [input.objective, input.context, input.followup].filter(Boolean).join("\n");
  const raw = text.match(/创作教练ID[：:]\s*([^\n]+)/)?.[1] ?? "";
  const ids = raw.split(/[，,]/).map((value) => value.trim()).filter(Boolean).slice(0, 2);
  return ids.length ? ids : ["default"];
}

const excludedAppSlugs = new Set(["digital-human-video"]);

function isExcludedApp(app: CreationApp) {
  return excludedAppSlugs.has(app.slug) || app.slug.startsWith("digital-human-") || hiddenWorkspaceCardSlugs.has(app.slug);
}

function buildGenericInput(input: CapabilityTaskInput, app: CreationApp) {
  const source = sourceText(input);
  return Object.fromEntries(app.fields.map((field) => {
    if (field.type === "multiselect") return [field.id, field.options?.slice(0, 2).map((option) => option.value) ?? []];
    if (field.type === "radio" || field.type === "select") return [field.id, field.options?.[0]?.value ?? ""];
    if (field.type === "file") return [field.id, ""];
    return [field.id, source];
  })) as Record<string, CreationFieldValue>;
}

function genericCapability(app: CreationApp): WorkbuddyCapability {
  const needsInteractiveInput = app.resultType === "image" || app.resultType === "image-plan" || app.resultType === "presentation" || app.fields.some((field) => field.required && field.type === "file");
  return {
    id: `app.${app.slug}`,
    kind: "app",
    name: app.name,
    appSlug: app.slug,
    description: app.description,
    riskLevel: "generate",
    executionMode: needsInteractiveInput ? "interactive" : "sync",
    outputTypes: [app.resultType === "presentation" ? "presentation" : app.resultType === "image" || app.resultType === "image-plan" ? "image" : "text"],
    autoInvoke: !needsInteractiveInput,
    buildInput: buildGenericInput,
  };
}

const appCapabilities: WorkbuddyCapability[] = [
  {
    id: "app.traffic-copy", kind: "app", name: "口播文案（流量型）", appSlug: "traffic-copy",
    description: "把已经选定的热点、事件或观点生成一条可直接录制的流量型口播。用户明确要求流量口播、获客口播或选择候选后要求写口播时，应调用本应用交付专业产物；已有上下文足以构成素材时无需再次询问。", riskLevel: "generate", executionMode: "sync", outputTypes: ["text"], autoInvoke: true,
    buildInput: (input) => ({ source: sourceText(input), creative_coach_version_ids: selectedTrafficCoachIds(input) }),
  },
  {
    id: "app.topic-picker", kind: "app", name: "找选题", appSlug: "topic-picker",
    description: "围绕财经、财富、保险或通用业务目标生成可执行选题，并保持用户指定领域。", riskLevel: "generate", executionMode: "sync", outputTypes: ["text"], autoInvoke: true,
    buildInput: (input) => ({ special_requirements: sourceText(input) }),
  },
  {
    id: "app.write-copy", kind: "app", name: "多平台文案创作", appSlug: "write-copy",
    description: "生成口播、小红书、公众号与朋友圈等多平台文案。", riskLevel: "generate", executionMode: "sync", outputTypes: ["text"], autoInvoke: true,
    buildInput: (input) => ({ tone: "self", source: sourceText(input), targets: ["video_script", "xiaohongshu", "wechat_article", "moments"] }),
  },
  {
    id: "app.xiaohongshu-studio", kind: "app", name: "小红书笔记创作", appSlug: "xiaohongshu-studio",
    description: "根据素材或想法生成完整小红书笔记。", riskLevel: "generate", executionMode: "sync", outputTypes: ["text"], autoInvoke: true,
    buildInput: (input) => ({ topic: sourceText(input), creation_mode: input.context || input.previousArtifact ? "rewrite" : "idea", length_mode: "standard" }),
  },
  {
    id: "app.wechat-studio", kind: "app", name: "公众号文章创作", appSlug: "wechat-studio",
    description: "生成可继续排版与发布的公众号文章。", riskLevel: "generate", executionMode: "sync", outputTypes: ["text"], autoInvoke: true,
    buildInput: (input) => ({ topic: sourceText(input), audience: "existing-clients", tone: "professional", lengthMode: "standard" }),
  },
  {
    id: "app.video-script-polish", kind: "app", name: "口播稿优化", appSlug: "video-script-polish",
    description: "把已有内容优化为自然、准确且符合原题领域的口播稿。", riskLevel: "generate", executionMode: "sync", outputTypes: ["text"], autoInvoke: true,
    buildInput: (input) => ({ draft: sourceText(input) }),
  },
  {
    id: "app.general-content", kind: "app", name: "泛内容创作", appSlug: "general-content",
    description: "把业务资料整理为多渠道内容成果。", riskLevel: "generate", executionMode: "sync", outputTypes: ["text"], autoInvoke: true,
    buildInput: (input) => ({ source: sourceText(input), targets: ["video_script", "wechat_article"] }),
  },
  {
    id: "app.policy-diagnosis", kind: "app", name: "保单结构复核", appSlug: "policy-diagnosis",
    description: "基于用户提供的真实保单资料完成结构复核，不替代专业核保或理赔结论。", riskLevel: "generate", executionMode: "sync", outputTypes: ["text"], autoInvoke: true,
    buildInput: (input) => ({ household_stage: "parenting", diagnosis_goal: ["gap", "duplicate", "premium-pressure"], insured_overview: input.objective, policy_info: input.context || input.previousArtifact || "用户尚未提供完整保单资料，请只整理待核验清单，不得推断具体保障。", concerns: input.followup || "" }),
  },
  {
    id: "app.ppt-maker", kind: "app", name: "PPT 轻松制作", appSlug: "ppt-maker",
    description: "生成可编辑 PPTX；当前需要进入专业编辑器确认大纲和版式。", riskLevel: "generate", executionMode: "interactive", outputTypes: ["presentation"], autoInvoke: false,
    buildInput: () => ({}),
  },
];

const nativeCapabilities: WorkbuddyCapability[] = [
  {
    id: "tool.video-link-summary", kind: "connector", name: "视频链接转写总结", nativeType: "video-link-summary",
    description: "读取抖音、视频号或小红书作品链接，完成语音转写，并输出摘要、结构、关键信息和完整转写。", riskLevel: "read", executionMode: "async", outputTypes: ["text", "data"], autoInvoke: true, systemSkill: true, skillIcon: "▶", skillOrder: 1,
    buildInput: () => ({}),
  },
  {
    id: "tool.link-reader", kind: "connector", name: "读取链接内容", nativeType: "link-reader",
    description: "读取公众号文章或支持平台的内容链接，忠实提取正文、核心观点和可复用素材。", riskLevel: "read", executionMode: "async", outputTypes: ["text", "data"], autoInvoke: true, systemSkill: true, skillIcon: "↗", skillOrder: 2,
    buildInput: () => ({}),
  },
  {
    id: "agent.file-analysis", kind: "agent", name: "文件阅读分析", nativeType: "file-analysis",
    description: "阅读用户上传的 PDF、Word、CSV、TXT 或 Markdown，提炼摘要、要点、数据和待确认事项。", riskLevel: "read", executionMode: "sync", outputTypes: ["text", "data"], autoInvoke: true, systemSkill: true, skillIcon: "▤", skillOrder: 3,
    buildInput: () => ({}),
  },
  {
    id: "tool.hot-topic-discovery", kind: "connector", name: "今日热点", nativeType: "hot-topic-discovery",
    description: "读取小谷实时热点榜单，返回平台、热度、发布时间、原始链接、多领域评分和推荐角度；榜单信号不等于事实核验。", riskLevel: "read", executionMode: "sync", outputTypes: ["data"], autoInvoke: true,
    buildInput: () => ({}),
  },
  {
    id: "agent.fast-research", kind: "agent", name: "快速查证", nativeType: "fast-research",
    description: "用 1–3 个动态查询并发取得紧凑证据包，快速回答单一事实、当前状态或范围清晰的简单比较；复杂、多跳或高风险问题应使用深度研究。", riskLevel: "read", executionMode: "async", outputTypes: ["text", "data"], autoInvoke: true,
    systemSkill: true, skillIcon: "⌕", skillOrder: 4,
    buildInput: () => ({}),
  },
  {
    id: "agent.orchestrator", kind: "agent", name: "小谷", nativeType: "general-orchestrator",
    description: "在专项规划无法形成时，由小谷依据角色、上下文与安全边界直接处理通用任务。", riskLevel: "generate", executionMode: "async", outputTypes: ["text"], autoInvoke: true,
    buildInput: () => ({}),
  },
  {
    id: "agent.customer-followup", kind: "agent", name: "客户会谈整理", nativeType: "customer-followup",
    description: "从会谈或聊天资料提取客户事实、需求、异议和下一步行动。", riskLevel: "generate", executionMode: "sync", outputTypes: ["text"], autoInvoke: true,
    systemSkill: true, skillIcon: "客", skillOrder: 5,
    buildInput: () => ({}),
  },
  {
    id: "agent.product-analysis", kind: "agent", name: "保单/产品资料解读", nativeType: "product-analysis",
    description: "基于用户提供的保单或产品资料进行结构化提取、对比和客户版讲解。", riskLevel: "generate", executionMode: "sync", outputTypes: ["text", "data"], autoInvoke: true,
    systemSkill: true, skillIcon: "保", skillOrder: 6,
    buildInput: () => ({}),
  },
  {
    id: "agent.team-review", kind: "agent", name: "经营复盘", nativeType: "team-review",
    description: "根据经营数据或会议资料形成事实、问题、行动和验收标准。", riskLevel: "generate", executionMode: "sync", outputTypes: ["text", "data"], autoInvoke: true,
    buildInput: () => ({}),
  },
  {
    id: "agent.deep-research", kind: "agent", name: "深度研究", nativeType: "deep-research",
    description: "检索公开资料并形成带来源、时间和待核验项的财经、财富、保险或通用研究报告。", riskLevel: "read", executionMode: "async", outputTypes: ["text", "data"], autoInvoke: true,
    buildInput: () => ({}),
  },
];

const explicitCapabilityBySlug = new Map(appCapabilities.flatMap((capability) => capability.appSlug ? [[capability.appSlug, capability] as const] : []));

function capabilityForApp(app: CreationApp) {
  return explicitCapabilityBySlug.get(app.slug) ?? genericCapability(app);
}

export function listWorkbuddyCapabilities() {
  return [...nativeCapabilities.map((capability) => ({ ...capability, points: 0, available: true })), ...creationApps.filter((app) => !isExcludedApp(app)).map((app) => {
    const capability = capabilityForApp(app);
    return { ...capability, points: app?.points ?? 0, available: Boolean(app) };
  })];
}

export async function listActiveWorkbuddyCapabilities() {
  await trySyncCreationCatalog();
  const catalog = await tryListCreationCatalog();
  return [...nativeCapabilities.map((capability) => ({ ...capability, points: 0, available: true })), ...catalog.apps.filter((app) => !isExcludedApp(app)).map((app) => ({ ...capabilityForApp(app), points: app.points, available: true }))];
}

export function getWorkbuddyCapability(id: string) {
  const native = nativeCapabilities.find((item) => item.id === id);
  if (native) return native;
  const app = creationApps.find((item) => `app.${item.slug}` === id && !isExcludedApp(item));
  return app ? capabilityForApp(app) : null;
}

export async function resolveActiveWorkbuddyCapability(id: string) {
  return (await listActiveWorkbuddyCapabilities()).find((capability) => capability.id === id) ?? null;
}
