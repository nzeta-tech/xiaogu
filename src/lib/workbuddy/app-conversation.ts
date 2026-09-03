import type { CreationApp, CreationField, CreationFieldCondition } from "../apps/catalog.ts";
import type { CreationFieldValue } from "../creation/output.ts";
import { remixCapabilityOptions } from "../creation/capabilities.ts";
import { getRemixCapabilitySettings } from "../creation/remix-capability-registry.ts";

const PARAMETER_MARKER = "[应用参数:";

export type ConversationAppField = {
  id: string;
  label: string;
  type: "text" | "textarea" | "single" | "multiple" | "file";
  required: boolean;
  placeholder?: string;
  helper?: string;
  accept?: string;
  multiple?: boolean;
  maxFiles?: number;
  visibleWhen?: CreationFieldCondition[];
  visibleWhenAny?: CreationFieldCondition[];
  revealAfter?: string[];
  presentation?: "field" | "data";
  step?: number;
  options?: Array<{ label: string; value: string; description?: string; previewUrl?: string }>;
  initialValue?: CreationFieldValue;
};

export function parseConversationAppParameters(text: string, appSlug: string) {
  const marker = `${PARAMETER_MARKER}${appSlug}]`;
  const start = text.lastIndexOf(marker);
  if (start < 0) return null;
  const line = text.slice(start + marker.length).trimStart().split("\n", 1)[0]?.trim() ?? "";
  if (!line) return null;
  try {
    const parsed = JSON.parse(line.startsWith("{") ? line : decodeURIComponent(line)) as Record<string, CreationFieldValue>;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch { return null; }
}

export function hasConversationAppParameters(text: string, appSlug: string) {
  return Boolean(parseConversationAppParameters(text, appSlug));
}

export function applicationNeedsConversationForm(app: CreationApp) {
  return app.fields.some((field) => field.type === "select" || field.type === "radio" || field.type === "multiselect" || field.type === "file" || field.type === "text_or_file");
}

export type ApplicationReadiness = { ready: true } | { ready: false; question: string; missingInputs: string[] };

export function assessApplicationReadiness(app: CreationApp, currentRequest: string): ApplicationReadiness {
  const requiredFreeform = app.fields.filter((field) => field.required && ["text", "textarea", "text_or_file", "file"].includes(field.type));
  const conditionalMaterial = app.fields.filter((field) => ["source", "topic", "draft", "article", "content", "material"].some((prefix) => field.id.toLowerCase().startsWith(prefix)) && ["text", "textarea", "text_or_file", "file"].includes(field.type));
  const materialFields = requiredFreeform.length ? requiredFreeform : conditionalMaterial;
  if (!materialFields.length) return { ready: true };
  const request = currentRequest.trim();
  if (!request || isGenericApplicationIntent(request, app)) {
    return {
      ready: false,
      question: `可以使用“${app.name}”。开始前还需要具体主题、素材或目标；你也可以让我先帮你找热点或选题。`,
      missingInputs: materialFields.map((field) => field.label),
    };
  }
  return { ready: true };
}

export function isGenericApplicationIntent(request: string, app?: CreationApp) {
  const normalized = request.replace(/[，。！？!?、；;：:\s]/g, "").replace(/^(请|可以|麻烦)?(帮我|给我|替我)/, "");
  if (/^(我)?(想|要|需要|打算)?(写|做|制作|生成|创作|优化|分析|整理|看|看看|诊断|弄)(一下|下)?(一|1)?(篇|个|份|条|张|套|段)?(短视频)?(口播稿?|文案|文章|公众号文章|小红书笔记|图片|海报|封面|知识卡片|PPT|幻灯片|视频|报告|方案|保单|产品|资料|直播稿|招募文案|续期提醒卡|IP定位)$/.test(normalized)) return true;
  const appName = app?.name.replace(/[（）()·\s]/g, "");
  return Boolean(appName && new RegExp(`^(我)?(想|要|需要)?(用|使用|打开|做|制作|生成)?${escapeRegExp(appName)}$`).test(normalized));
}

export function shouldSkipTrafficTopicSelection(text: string) {
  return /(?:题目|选题|角度)(?:已经|已|就|都)?(?:定了|确定|明确)|(?:无需|不用|不要|跳过)(?:再)?(?:分析|推荐|选择)?选题|直接(?:按这个题|根据这个题|写|生成)(?:口播|文案|正文|稿)?/.test(text);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function resolveConversationAppSource(pendingInstruction: string, followup: string, objective: string) {
  return pendingInstruction.trim() || followup.trim() || objective.trim();
}

export function buildConversationAppFields(app: CreationApp, source: string): ConversationAppField[] {
  const base = app.fields.map((field) => fieldToConversationField(field, source));
  if (app.slug !== "link-remix") return base;
  const dynamic = new Map<string, ConversationAppField>();
  for (const target of remixCapabilityOptions) {
    for (const setting of getRemixCapabilitySettings(target.value)) {
      const converted = fieldToConversationField(setting, source);
      const existing = dynamic.get(converted.id);
      dynamic.set(converted.id, {
        ...(existing ?? converted),
        options: [...(existing?.options ?? []), ...(converted.options ?? [])].filter((option, index, options) => options.findIndex(item => item.value === option.value) === index),
        visibleWhenAny: [...(existing?.visibleWhenAny ?? []), { fieldId: "remix_target", equals: target.value }],
        revealAfter: ["remix_target"],
        step: 3,
      });
    }
  }
  return [...base, ...dynamic.values()];
}

function fieldToConversationField(field: CreationField, source: string): ConversationAppField {
  const type = field.type === "radio" || field.type === "select" ? "single"
    : field.type === "multiselect" ? "multiple"
      : field.type === "file" || field.type === "text_or_file" ? "file"
        : field.type;
  const sourceLike = /^(source|topic|draft|article|content|prompt|material)/i.test(field.id);
  return {
    id: field.id,
    label: field.label,
    type,
    required: Boolean(field.required),
    placeholder: field.placeholder,
    helper: field.helper ?? field.uploadHint,
    accept: field.accept,
    multiple: field.multiple || field.type === "multiselect",
    maxFiles: field.maxFiles,
    visibleWhen: field.visibleWhen,
    visibleWhenAny: field.visibleWhenAny,
    revealAfter: field.revealAfter,
    presentation: field.presentation,
    step: field.step,
    options: field.options?.map((option) => ({ label: option.label, value: option.value, description: option.hint, previewUrl: option.previewUrl })),
    initialValue: sourceLike && (type === "text" || type === "textarea" || type === "file") ? source : type === "multiple" ? [] : "",
  };
}

export function mergeConversationAppParameters(base: Record<string, CreationFieldValue>, taskText: string, appSlug: string) {
  return { ...base, ...(parseConversationAppParameters(taskText, appSlug) ?? {}) };
}

export function appNextActions(appSlug: string, resultType: CreationApp["resultType"]) {
  const specific: Record<string, Array<{ label: string; value: string; description: string }>> = {
    "traffic-copy": [
      { label: "制作视频封面", value: "请基于刚完成的口播正文，调用视频封面制作应用继续完成发布封面。", description: "继续在对话中选择平台、风格和尺寸" },
      { label: "继续优化口播", value: "请保留当前口播的事实和核心观点，先问我想调整哪一部分，再继续优化。", description: "调整开头、节奏、观点或结尾" },
    ],
    "wechat-studio": [
      { label: "生成公众号配图", value: "请基于刚完成的公众号文章，调用公众号配图应用继续生成配图方案。", description: "沿用当前文章作为素材" },
      { label: "继续修改文章", value: "请基于刚完成的公众号文章，先让我选择要调整的部分，再继续修改。", description: "标题、结构、语气或篇幅" },
    ],
    "xiaohongshu-studio": [
      { label: "制作知识卡片", value: "请基于刚完成的小红书内容，调用知识卡片应用继续制作配图。", description: "把核心观点转成可发布卡片" },
      { label: "继续修改笔记", value: "请基于刚完成的小红书笔记，先让我选择要调整的部分，再继续修改。", description: "标题、正文、标签或语气" },
    ],
  };
  return specific[appSlug] ?? [
    { label: "继续修改", value: "请基于刚完成的产物，先问我希望调整的部分，再继续修改。", description: "保留当前结果并进行定向调整" },
    { label: resultType === "text" ? "转换内容形式" : "再生成一个版本", value: resultType === "text" ? "请基于刚完成的产物，给我可转换的内容形式选项。" : "请保留当前要求，再生成一个不同版本。", description: resultType === "text" ? "选择口播、公众号、小红书等形式" : "沿用本次参数继续创作" },
  ];
}
