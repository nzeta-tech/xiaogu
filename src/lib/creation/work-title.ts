import { stringifyCreationFieldValue, type CreationFieldValue } from "@/lib/creation/output";

const MAX_SUBJECT_LENGTH = 28;

const titleFieldPriorities: Record<string, string[]> = {
  "write-copy": ["source"],
  "link-remix": ["source_title", "remix_angle", "source_platform"],
  "image-card": ["source", "signature", "style"],
  "policy-renewal-card": ["customer_salutation", "renewal_date"],
  "lead-copy": ["source"],
  "traffic-copy": ["source"],
  "marketing-copy": ["source"],
  "lead-package": ["theme", "audience"],
  "topic-picker": ["special_requirements"],
  "ip-positioning": ["target_client", "current_state"],
  breakthrough: ["desired_result", "source"],
  "team-recruit": ["candidate", "resume", "followup_notes", "team_offer"],
  "live-script": ["theme", "audience", "goal"],
  "general-content": ["source"],
  "wechat-images": ["article", "style"],
  "video-script-polish": ["draft"],
  letter: ["theme"],
  "xiaohongshu-check": ["content"],
  "policy-diagnosis": ["concerns", "insured_overview", "policy_info"],
  "wechat-article-polish": ["article"],
};

const fallbackSubjects: Record<string, string> = {
  "topic-picker": "本期内容方向",
  "ip-positioning": "个人品牌定位",
  breakthrough: "阶段增长方案",
  "policy-diagnosis": "家庭保障结构",
};

const imageStyleLabels: Record<string, string> = {
  illustration: "手绘插画",
  whiteboard: "白板手写",
  zen: "东方禅意",
  "line-illustration": "线稿插画",
  luxury: "高端质感",
  magazine: "杂志风格",
  graffiti: "城市涂鸦",
  "event-stage": "演讲现场",
  "handwritten-notes": "手写笔记",
  clay: "立体粘土",
  "minimal-drawing": "极简手绘",
  business: "商务风格",
  blackboard: "黑板报",
  "flat-knowledge": "扁平知识",
  morandi: "莫兰迪",
  "science-sketch": "科普手绘",
  "dark-pro": "深色专业",
  "fresh-card": "清爽卡片",
  "daily-sign": "质感日签",
  study: "学霸笔记",
  "large-sign": "大字日签",
  "black-white": "黑白调",
  scrapbook: "手账拼贴",
  "white-orange-blue": "白橙蓝简约",
  daily: "日报风格",
  custom: "自定义风格",
};

const weakSubjects = new Set([
  "标题",
  "标题建议",
  "推荐标题",
  "文章标题",
  "创作结果",
  "生成内容",
  "分析报告",
  "精修报告",
  "精修说明",
  "公众号文章",
  "小红书笔记",
  "短视频口播",
  "illustration",
  "whiteboard",
  "zen",
  "line-illustration",
  "luxury",
  "magazine",
  "graffiti",
  "event-stage",
  "handwritten-notes",
  "clay",
  "minimal-drawing",
  "business",
  "blackboard",
  "flat-knowledge",
  "morandi",
  "science-sketch",
  "dark-pro",
  "fresh-card",
  "daily-sign",
  "study",
  "large-sign",
  "black-white",
  "scrapbook",
  "white-orange-blue",
  "daily",
  "custom",
]);

const structuralHeadings = [
  "生成内容",
  "创作结果",
  "分析报告",
  "精修报告",
  "精修说明",
  "精修后的文章",
  "文章标题建议",
  "标题建议",
  "推荐标题",
  "标题",
  "人设提炼",
  "选题列表",
  "选题使用方法",
  "选题详细指导",
  "短视频口播",
  "小红书笔记",
  "公众号文章",
];

export function buildWorkTitle(input: {
  appName: string;
  appSlug: string;
  values: Record<string, CreationFieldValue>;
  result?: string | null;
}) {
  const generatedTitle = extractGeneratedTitle(input.result ?? "");
  const fieldTitle = extractFieldTitle(input.appSlug, input.values);
  const subject = generatedTitle || fieldTitle || fallbackSubjects[input.appSlug] || defaultSubjectForApp(input.appSlug);
  return `${input.appName}｜${truncateSubject(subject)}`;
}

function extractFieldTitle(appSlug: string, values: Record<string, CreationFieldValue>) {
  const combined = buildCombinedFieldTitle(appSlug, values);
  if (combined) return combined;

  const fieldIds = titleFieldPriorities[appSlug] ?? [
    "theme",
    "source",
    "article",
    "draft",
    "content",
    "goal",
    "current_state",
  ];

  for (const fieldId of fieldIds) {
    const candidate = formatFieldSubject(appSlug, fieldId, stringifyCreationFieldValue(values[fieldId]));
    if (candidate) return candidate;
  }
  return "";
}

function extractGeneratedTitle(result: string) {
  if (!result.trim()) return "";

  const lines = result.replace(/\r\n/g, "\n").split("\n").slice(0, 40);
  for (const [index, rawLine] of lines.entries()) {
    const line = rawLine.trim();
    const inlineTitle = line.match(/^(?:#{1,3}\s*)?(?:\*{1,2})?(?:文章标题|标题建议|推荐标题|标题)(?:\*{1,2})?[：:]\s*(.+?)(?:\*{1,2})?$/);
    if (inlineTitle) {
      const candidate = normalizeSubject(inlineTitle[1]);
      if (candidate && !isStructuralHeading(candidate) && !isWeakSubject(candidate)) return candidate;
      continue;
    }

    const headingLabel = normalizeSubject(line.replace(/^#{1,3}\s+/, ""));
    if (["文章标题", "文章标题建议", "标题建议", "推荐标题", "标题"].includes(headingLabel)) {
      const nextLine = lines.slice(index + 1).find((item) => item.trim());
      const candidate = normalizeSubject(nextLine ?? "");
      if (candidate && !isStructuralHeading(candidate) && !isWeakSubject(candidate)) return candidate;
      continue;
    }

    const match = line.match(/^#{1,3}\s+(.+)$/);
    if (!match) continue;

    const candidate = normalizeSubject(match[1]);
    if (candidate && !isStructuralHeading(candidate) && !isWeakSubject(candidate)) return candidate;
  }
  return "";
}

function buildCombinedFieldTitle(appSlug: string, values: Record<string, CreationFieldValue>) {
  if (appSlug === "policy-renewal-card") {
    const salutation = normalizeSubject(stringifyCreationFieldValue(values.customer_salutation));
    const renewalDate = normalizeSubject(stringifyCreationFieldValue(values.renewal_date));
    if (salutation && renewalDate) return `${salutation}${renewalDate}续费提醒`;
    if (salutation) return `${salutation}续费提醒`;
    if (renewalDate) return `${renewalDate}续费提醒`;
  }

  if (appSlug === "wechat-images") {
    const article = normalizeSubject(stringifyCreationFieldValue(values.article));
    if (article && !isWeakSubject(article)) return `${article}配图`;
  }

  if (appSlug === "image-card") {
    const source = normalizeSubject(stringifyCreationFieldValue(values.source));
    if (source && !isWeakSubject(source)) return source;
    const signature = normalizeSubject(stringifyCreationFieldValue(values.signature));
    if (signature) return `${signature}知识卡片`;
    const style = formatStyleSubject(stringifyCreationFieldValue(values.style), "知识卡片");
    if (style) return style;
  }

  if (appSlug === "live-script") {
    const livePoint = normalizeSubject(stringifyCreationFieldValue(values.live_point));
    if (livePoint) return livePoint;
  }

  if (appSlug === "team-recruit") {
    const candidate = normalizeSubject(stringifyCreationFieldValue(values.candidate));
    const teamOffer = normalizeSubject(stringifyCreationFieldValue(values.team_offer));
    if (candidate && teamOffer) return `${candidate}${teamOffer}`;
  }

  if (appSlug === "topic-picker") {
    const specialRequirements = normalizeSubject(stringifyCreationFieldValue(values.special_requirements));
    if (specialRequirements) return `${specialRequirements}选题`;
  }

  return "";
}

function formatFieldSubject(
  appSlug: string,
  fieldId: string,
  rawValue: string,
) {
  const candidate = normalizeSubject(rawValue);
  if (!candidate) return "";

  if (fieldId === "style") {
    return formatStyleSubject(rawValue, appSlug === "wechat-images" ? "配图" : "知识卡片");
  }

  if (fieldId === "audience" && appSlug === "lead-package") {
    return `${candidate}资料包`;
  }

  if (fieldId === "desired_result" && appSlug === "breakthrough") {
    return `${candidate}增长方案`;
  }

  if (isWeakSubject(candidate)) return "";
  return candidate;
}

function formatStyleSubject(value: string, suffix: string) {
  const normalized = value.trim();
  if (!normalized) return "";
  const label = imageStyleLabels[normalized] ?? normalizeSubject(normalized);
  if (!label || isWeakSubject(label)) return "";
  return `${label}${suffix}`;
}

function normalizeSubject(value: string) {
  const firstMeaningfulLine = value
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .split(/\n+/)
    .map((line) => line.trim())
    .find(Boolean);
  if (!firstMeaningfulLine) return "";

  return firstMeaningfulLine
    .replace(/^#{1,6}\s*/, "")
    .replace(/^[-*•]+\s*/, "")
    .replace(/^\d+[.、）)]\s*/, "")
    .replace(/^【[^】]+】\s*/, "")
    .replace(/^\*{1,2}|\*{1,2}$/g, "")
    .replace(/^(?:主题|标题|文章标题|内容主题)[：:]\s*/, "")
    .replace(/^(?:风格|比例|署名|客户称呼|续费日期)[：:]\s*/, "")
    .replace(/^(?:大家好|你好|哈喽大家好)[，,！!。.\s]*/, "")
    .replace(/^(?:今天|这次|本期)?我(?:想|要)?(?:和大家)?(?:聊聊|聊一聊|聊|讲讲|讲一下|讲一讲|讲|说说|说)[：，,：:]?\s*/, "")
    .replace(/[“”"'《》]/g, "")
    .replace(/[：:]\s*(?:手绘插画|白板手写风格|东方禅意|手绘线稿插画|奢侈高端风格|杂志风格|城市涂鸦风格|演讲现场风格|手写笔记风格|立体粘土风格|极简手绘|商务风格|黑板报风格|扁平知识风格|莫兰迪平面风格|科普知识手绘|深色专业|清爽简约卡片|质感日签|学霸笔记|大字版日签|黑白调|手账拼贴风|简洁白橙蓝|日报风格|illustration|whiteboard|zen|custom)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isStructuralHeading(value: string) {
  const normalized = value.replace(/^[一二三四五六七八九十0-9]+[、，,.）)]\s*/, "");
  return structuralHeadings.some((heading) => normalized === heading || normalized.startsWith(`${heading}：`));
}

function isWeakSubject(value: string) {
  const normalized = value.trim();
  if (!normalized) return true;
  if (weakSubjects.has(normalized)) return true;
  if (/^\d+:\d+$/.test(normalized) || /^\d+[:：]\d+$/.test(normalized)) return true;
  if (/^[a-z-]{2,24}$/i.test(normalized) && normalized.toLowerCase() in imageStyleLabels) return true;
  if (normalized.length <= 2 && !/[\u4e00-\u9fa5]{2}/.test(normalized)) return true;
  return false;
}

function defaultSubjectForApp(appSlug: string) {
  if (appSlug === "image-card") return "知识卡片";
  if (appSlug === "wechat-images") return "文章配图";
  if (appSlug === "policy-renewal-card") return "续费提醒";
  if (appSlug === "live-script") return "直播脚本";
  if (appSlug === "team-recruit") return "招募沟通";
  return "本次创作";
}

function truncateSubject(value: string) {
  const normalized = value.replace(/\s*([，。！？；：])\s*/g, "$1").trim();
  if (normalized.length <= MAX_SUBJECT_LENGTH) return normalized;

  const window = normalized.slice(0, MAX_SUBJECT_LENGTH);
  const punctuationIndex = Math.max(
    window.lastIndexOf("，"),
    window.lastIndexOf("。"),
    window.lastIndexOf("！"),
    window.lastIndexOf("？"),
    window.lastIndexOf("；"),
    window.lastIndexOf("："),
  );
  if (punctuationIndex >= 10) return window.slice(0, punctuationIndex);
  return `${normalized.slice(0, MAX_SUBJECT_LENGTH - 1)}…`;
}
