import type { CreationField } from "@/lib/apps/catalog";
import {
  isEmptyCreationFieldValue,
  stringifyCreationFieldValue,
  type CreationFieldValue,
} from "@/lib/creation/output";

type LeadCopyTargetSpec = {
  heading: string;
  label: string;
  instructions: string[];
};

export type MultiChannelCopyVariant = "lead" | "traffic" | "marketing";

export function isMultiChannelCopyAppSlug(slug: string) {
  return slug === "lead-copy" || slug === "traffic-copy" || slug === "marketing-copy";
}

export function getMultiChannelCopyVariant(slug: string): MultiChannelCopyVariant {
  if (slug === "traffic-copy") return "traffic";
  if (slug === "marketing-copy") return "marketing";
  return "lead";
}

export function getMultiChannelCopyStyleMode(slug: string): "traffic" | "marketing" {
  return slug === "marketing-copy" ? "marketing" : "traffic";
}

export function buildLeadCopyPrompt(
  fields: CreationField[],
  values: Record<string, CreationFieldValue>,
  hint: string,
  caseContext: string[] = [],
  variant: MultiChannelCopyVariant = "lead",
) {
  const tone = stringifyCreationFieldValue(values.tone).trim();
  const source = stringifyCreationFieldValue(values.source).trim();
  const targets = Array.isArray(values.targets) ? values.targets.filter((item) => item.trim().length > 0) : [];
  const targetBlocks = targets
    .map((target) => getLeadCopyTargetSpec(target, variant))
    .filter((item): item is LeadCopyTargetSpec => Boolean(item));

  if (variant !== "lead" && targetBlocks.length === 0) {
    return buildStandaloneModePrompt(variant, source, hint, caseContext);
  }

  const lines = [
    `你现在在执行小谷应用：${getVariantName(variant)}。`,
    `这是一个结构化的多渠道${getVariantName(variant)}任务。请直接输出可发布成稿，不要分析应用、页面、产品设计或结果页结构。`,
    ...caseContext,
    `应用提示：${hint}`,
    "请严格围绕用户提供的原始素材进行创作，不要脱离素材编造新事实。",
    "",
    "核心原则：",
    ...getVariantPrinciples(variant),
    "",
    "本轮输入：",
    `- 表达倾向：${formatLeadCopyToneLabel(tone) || "未填写"}`,
    `- 引流素材：${source || "未填写"}`,
    `- 目标输出：${targetBlocks.map((item) => item.label).join("、") || "未填写"}`,
    "",
    "格式是结果页的数据契约，必须严格遵守：",
    "1. 只输出用户勾选的模块，并按下方给出的一级标题原样输出。",
    "2. 一级标题独占一行，不得添加 Markdown 井号、方括号、前言、总结或解释。",
    "3. 每个版本标题独占一行，必须使用“版本一｜名称”格式，版本之间不要使用分隔线。",
    "4. 每个模块都保留该渠道自己的节奏和格式，不能只是同一篇内容换标题。",
    variant === "lead"
      ? "5. 每篇内容结尾自然补充：内容中的“福利资料”可自行调整，并可用平台【引流资料】制作智能体制作。"
      : "5. 本应用的渠道、篇数和一级标题契约优先于通用写作模式的默认篇数。",
    "",
  ];

  for (const block of targetBlocks) {
    lines.push(block.heading);
    lines.push(...block.instructions);
    lines.push("");
  }

  const extraFields = fields
    .filter((field) => !["tone", "source", "targets"].includes(field.id))
    .map((field) => {
      const value = values[field.id];
      if (isEmptyCreationFieldValue(value)) return null;
      return `- ${field.label}：${stringifyCreationFieldValue(value)}`;
    })
    .filter((value): value is string => Boolean(value));

  if (extraFields.length > 0) {
    lines.push("补充信息：", ...extraFields, "");
  }

  lines.push("原始素材：", source);
  return lines.join("\n");
}

function buildStandaloneModePrompt(
  variant: Exclude<MultiChannelCopyVariant, "lead">,
  source: string,
  hint: string,
  caseContext: string[],
) {
  const outputContract = variant === "traffic"
    ? [
        "严格按以下四个一级标题输出：",
        "【开头论点】",
        "【主体论据】",
        "【结尾总结】",
        "【标题建议（3个）】",
        "正文默认控制在 520-680 字；开头必须使用反常识或冲突钩子，并点名素材中的核心实体。",
      ]
    : [
        "严格输出 4 篇彼此独立的营销成稿，一级标题依次为：",
        "【第一篇｜讲产品】",
        "【第二篇｜讲方案】",
        "【第三篇｜讲案例】",
        "【第四篇｜讲观念】",
        "每篇都包含标题、正文和具体互动动作；四篇分工明显，不重复同一套表达。",
      ];

  return [
    `你现在在执行小谷应用：${getVariantName(variant)}。`,
    "请直接输出可发布成稿，不要解释任务、应用或页面结构。",
    ...caseContext,
    `应用提示：${hint}`,
    "请严格依据用户素材，不得补造客户、产品、金额、收益、承保或理赔事实。",
    "",
    ...getVariantPrinciples(variant),
    "",
    ...outputContract,
    "",
    "用户素材：",
    source || "未填写",
  ].join("\n");
}

function getLeadCopyTargetSpec(target: string, variant: MultiChannelCopyVariant): LeadCopyTargetSpec | null {
  if (target === "video_batch") {
    if (variant === "marketing") return buildMarketingTarget("一、短视频引流口播", "口播稿x4", "语言要能直接口播");
    return {
      heading: "一、短视频引流口播",
      label: "口播稿x3",
      instructions: [
        "必须输出且只输出 3 篇：",
        "版本一｜反常识版",
        "版本二｜直击痛点版",
        "版本三｜故事共鸣版",
        "三篇都要有完整引流闭环，但切入角度、论证路径和互动关键词不能重复；语言要能直接口播。",
        ...(variant === "traffic" ? ["每篇都要包含反常识或冲突钩子、事实到逻辑的迁移链、普通人代入场景、明确互动动作和 3 个标题建议。"] : []),
      ],
    };
  }

  if (target === "redbook_batch") {
    if (variant === "marketing") return buildMarketingTarget("二、小红书笔记", "小红书x4", "保留小红书平台语感、标题和评论区引导");
    return {
      heading: "二、小红书笔记",
      label: "小红书x2",
      instructions: [
        "必须输出且只输出 2 篇：",
        "版本一｜情绪洞察型",
        "版本二｜干货拆解型",
        "两篇都要完整走完引流骨架，保留小红书平台语感、标签和评论区引导。",
        ...(variant === "traffic" ? ["每篇都要有明确立场、冲突推进、读者代入和 3 个标题建议，不写新闻摘要。"] : []),
      ],
    };
  }

  if (target === "wechat_batch") {
    if (variant === "marketing") return buildMarketingTarget("三、公众号文章", "公众号x4", "按公众号阅读节奏形成完整长文");
    return {
      heading: "三、公众号文章",
      label: "公众号x2",
      instructions: [
        "必须输出且只输出 2 篇：",
        "版本一｜洞察型文章成稿",
        "版本二｜温度型文章成稿",
        "两篇都要重新组织语言和结构，形成完整长文，并在文末自然承接留言或私信关键词。",
        ...(variant === "traffic" ? ["每篇都要用事实、迁移逻辑与家庭风险场景推进，结尾给出可执行启发和 3 个标题建议。"] : []),
      ],
    };
  }

  return null;
}

function buildMarketingTarget(heading: string, label: string, channelInstruction: string): LeadCopyTargetSpec {
  return {
    heading,
    label,
    instructions: [
      "必须输出且只输出 4 篇：",
      "版本一｜讲产品",
      "版本二｜讲方案",
      "版本三｜讲案例",
      "版本四｜讲观念",
      `四篇都要包含标题、正文和具体互动动作，分工明显且不重复；${channelInstruction}。`,
      "讲产品突出核心规则与适用边界；讲方案说明具体人群和配置逻辑；讲案例只使用素材支持的情境；讲观念给出决策框架。",
      "涉及健康告知、既往症、等待期、续保、免责、承保或理赔时必须说明边界，不得只写好处。",
    ],
  };
}

function getVariantName(variant: MultiChannelCopyVariant) {
  if (variant === "traffic") return "流量文案";
  if (variant === "marketing") return "营销文案";
  return "写引流文案";
}

function getVariantPrinciples(variant: MultiChannelCopyVariant) {
  if (variant === "traffic") {
    return [
      "1. 目标是高传播、高代入和可直接发布，不写新闻摘要、讲义或空泛鸡汤。",
      "2. 开头必须使用反常识或冲突钩子并点名素材核心实体；主体按事实、原因、迁移逻辑和普通人场景推进。",
      "3. 每篇至少包含一次反问、一次明确结论和一个普通人代入场景，结尾回到家庭风险或现金流安全感。",
      "4. 可以有情绪张力，但不得编造事实、承诺收益或理赔，也不得把推测写成确定结论。",
    ];
  }
  if (variant === "marketing") {
    return [
      "1. 目标是把客户画像、产品规则和投保难点写成专业、可信、可转化的内容。",
      "2. 内容按讲产品、讲方案、讲案例、讲观念四类分工，不能重复同一套表达。",
      "3. 同时讲清价值与规则边界，互动动作必须具体可执行，不写硬广口号。",
      "4. 不得承诺一定承保、一定理赔或确定收益；素材缺少案例事实时改用典型情境，不得虚构人物与结果。",
    ];
  }
  return [
    "1. 核心任务是让目标人群愿意停留、产生信任，并自然承接评论或私信互动。",
    "2. 所有内容都要遵循“点他-懂他-压他-破他-证他-接他”的引流骨架。",
    "3. 不得编造具体个人、公司、年份、精确金额、精确百分比。",
    "4. 不要写套话、口号和鸡汤；素材不支持具体案例时，使用经验观察或逻辑推演。",
  ];
}

export function formatLeadCopyToneLabel(value: string) {
  if (value === "sharp_insight") return "犀利洞察";
  if (value === "gentle_empathy") return "温和共鸣";
  if (value === "analogy_thinking") return "类比思维";
  if (value === "raw_restore") return "原汁原味（还原整理）";
  if (value === "professional_direct") return "专业直接";
  if (value === "warm_trust") return "温和可信";
  if (value === "scenario_analogy") return "场景类比";
  if (value === "material_faithful") return "忠于素材";
  return value;
}
