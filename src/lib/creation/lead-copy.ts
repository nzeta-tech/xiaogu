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

export function buildLeadCopyPrompt(
  fields: CreationField[],
  values: Record<string, CreationFieldValue>,
  hint: string,
  caseContext: string[] = [],
) {
  const tone = stringifyCreationFieldValue(values.tone).trim();
  const source = stringifyCreationFieldValue(values.source).trim();
  const targets = Array.isArray(values.targets) ? values.targets.filter((item) => item.trim().length > 0) : [];
  const targetBlocks = targets
    .map(getLeadCopyTargetSpec)
    .filter((item): item is LeadCopyTargetSpec => Boolean(item));

  const lines = [
    "你现在在执行小谷应用：写引流文案。",
    "这是一个结构化的多渠道引流文案任务。请直接输出可发布成稿，不要分析应用、页面、产品设计或结果页结构。",
    ...caseContext,
    `应用提示：${hint}`,
    "请严格围绕用户提供的原始素材进行创作，不要脱离素材编造新事实。",
    "",
    "核心原则：",
    "1. 核心任务是让目标人群愿意停留、产生信任，并自然承接评论或私信互动。",
    "2. 所有内容都要遵循“点他-懂他-压他-破他-证他-接他”的引流骨架。",
    "3. 不得编造具体个人、公司、年份、精确金额、精确百分比。",
    "4. 不要写套话、口号和鸡汤；素材不支持具体案例时，使用经验观察或逻辑推演。",
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
    "5. 每篇内容结尾自然补充：内容中的“福利资料”可自行调整，并可用平台【引流资料】制作智能体制作。",
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

function getLeadCopyTargetSpec(target: string): LeadCopyTargetSpec | null {
  if (target === "video_batch") {
    return {
      heading: "一、短视频引流口播",
      label: "口播稿x3",
      instructions: [
        "必须输出且只输出 3 篇：",
        "版本一｜反常识版",
        "版本二｜直击痛点版",
        "版本三｜故事共鸣版",
        "三篇都要有完整引流闭环，但切入角度、论证路径和互动关键词不能重复；语言要能直接口播。",
      ],
    };
  }

  if (target === "redbook_batch") {
    return {
      heading: "二、小红书笔记",
      label: "小红书x2",
      instructions: [
        "必须输出且只输出 2 篇：",
        "版本一｜情绪洞察型",
        "版本二｜干货拆解型",
        "两篇都要完整走完引流骨架，保留小红书平台语感、标签和评论区引导。",
      ],
    };
  }

  if (target === "wechat_batch") {
    return {
      heading: "三、公众号文章",
      label: "公众号x2",
      instructions: [
        "必须输出且只输出 2 篇：",
        "版本一｜洞察型文章成稿",
        "版本二｜温度型文章成稿",
        "两篇都要重新组织语言和结构，形成完整长文，并在文末自然承接留言或私信关键词。",
      ],
    };
  }

  return null;
}

export function formatLeadCopyToneLabel(value: string) {
  if (value === "sharp_insight") return "犀利洞察";
  if (value === "gentle_empathy") return "温和共鸣";
  if (value === "analogy_thinking") return "类比思维";
  if (value === "raw_restore") return "原汁原味（还原整理）";
  return value;
}
