import { stringifyCreationFieldValue, type CreationFieldValue } from "@/lib/creation/output";

const MAX_SUBJECT_LENGTH = 28;

const titleFieldPriorities: Record<string, string[]> = {
  "write-copy": ["source"],
  "image-card": ["source"],
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
  "wechat-images": ["article"],
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
  const subject = generatedTitle || fieldTitle || fallbackSubjects[input.appSlug] || "本次创作";
  return `${input.appName}｜${truncateSubject(subject)}`;
}

function extractFieldTitle(appSlug: string, values: Record<string, CreationFieldValue>) {
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
    const candidate = normalizeSubject(stringifyCreationFieldValue(values[fieldId]));
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
      if (candidate && !isStructuralHeading(candidate)) return candidate;
      continue;
    }

    const headingLabel = normalizeSubject(line.replace(/^#{1,3}\s+/, ""));
    if (["文章标题", "文章标题建议", "标题建议", "推荐标题", "标题"].includes(headingLabel)) {
      const nextLine = lines.slice(index + 1).find((item) => item.trim());
      const candidate = normalizeSubject(nextLine ?? "");
      if (candidate && !isStructuralHeading(candidate)) return candidate;
      continue;
    }

    const match = line.match(/^#{1,3}\s+(.+)$/);
    if (!match) continue;

    const candidate = normalizeSubject(match[1]);
    if (candidate && !isStructuralHeading(candidate)) return candidate;
  }
  return "";
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
    .replace(/^(?:今天|这次|本期)?我(?:想|要)?(?:和大家)?(?:聊聊|聊一聊|聊|讲讲|讲一下|讲一讲|讲|说说|说)[：，,：:]?\s*/, "")
    .replace(/[“”"'《》]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isStructuralHeading(value: string) {
  const normalized = value.replace(/^[一二三四五六七八九十0-9]+[、，,.）)]\s*/, "");
  return structuralHeadings.some((heading) => normalized === heading || normalized.startsWith(`${heading}：`));
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
