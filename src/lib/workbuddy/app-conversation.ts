import type { CreationApp, CreationField, CreationFieldCondition } from "../apps/catalog.ts";
import type { CreationFieldValue } from "../creation/output.ts";
import { remixCapabilityOptions } from "../creation/capabilities.ts";
import { getRemixCapabilitySettings } from "../creation/remix-capability-registry.ts";
import { createCreationAppInitialValues } from "../creation/app-input-values.ts";
import { isCreationFieldVisible } from "../apps/field-interaction.ts";
import { workflowContractForApp } from "../apps/workflow-contract.ts";
import { isOperationalOnlyMaterial, stripOperationalMaterial } from "./material-quality.ts";

const PARAMETER_MARKER = "[应用参数:";
const MATERIAL_FIELD_PATTERN = /^(source|topic|draft|article|content|prompt|material|special_requirements)/i;

type HandoffObservation = { capabilityId: string; status: string; summary: string };

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

export function resolveConversationFormState(
  fields: ConversationAppField[],
  values: Record<string, CreationFieldValue>,
  uploading = false,
) {
  const eligibleFields = fields.filter(field => field.presentation === "data" || isCreationFieldVisible(field, values));
  const missingFields = eligibleFields.filter(field => field.required && (Array.isArray(values[field.id]) ? !values[field.id].length : !String(values[field.id] ?? "").trim()));
  return { eligibleFields, missingFields, submitDisabled: uploading };
}

export function parseConversationAppParameters(text: string, appSlug: string) {
  return parseConversationAppParametersAtDepth(text, appSlug, 0);
}

function parseConversationAppParametersAtDepth(text: string, appSlug: string, depth: number): Record<string, CreationFieldValue> | null {
  const marker = `${PARAMETER_MARKER}${appSlug}]`;
  let before = text.length;
  while (before > 0) {
    const start = text.lastIndexOf(marker, before - 1);
    if (start < 0) return null;
    const line = text.slice(start + marker.length).trimStart().split("\n", 1)[0]?.trim() ?? "";
    if (line) {
      try {
        const parsed = JSON.parse(line.startsWith("{") ? line : decodeURIComponent(line)) as Record<string, CreationFieldValue>;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return depth >= 4 ? parsed : unwrapNestedAppParameters(parsed, appSlug, depth);
      } catch { /* A marker may occur inside an escaped source value; keep scanning backwards. */ }
    }
    before = start;
  }
  return null;
}

function unwrapNestedAppParameters(parameters: Record<string, CreationFieldValue>, appSlug: string, depth: number) {
  const normalized = { ...parameters };
  for (const [id, value] of Object.entries(parameters)) {
    if (!/^(source|topic|draft|article|content|prompt|material)/i.test(id) || typeof value !== "string" || !value.includes(PARAMETER_MARKER)) continue;
    const nested = parseConversationAppParametersAtDepth(value, appSlug, depth + 1);
    if (!nested) continue;
    const replacement = typeof nested[id] === "string" && nested[id].trim()
      ? nested[id]
      : Object.entries(nested).find(([nestedId, nestedValue]) => /^(source|topic|draft|article|content|prompt|material)/i.test(nestedId) && typeof nestedValue === "string" && nestedValue.trim())?.[1];
    if (typeof replacement === "string") normalized[id] = replacement;
  }
  return normalized;
}

/**
 * Builds the durable material passed across the Agent -> confirmation form -> app
 * boundary. Tool observations live only for one Agent runtime, so the form must
 * carry the useful evidence itself instead of carrying a planner instruction.
 */
export function buildConversationAppHandoffSource(input: {
  appSlug: string;
  instruction: string;
  currentRequest: string;
  objective: string;
  observations: HandoffObservation[];
  priorConversationSource?: string;
}) {
  const directSource = resolveConversationAppSource(input.instruction, input.currentRequest, input.objective, input.appSlug);
  const successful = input.observations.filter(item =>
    item.status === "success"
    && item.summary.trim()
    && !isOperationalOnlyMaterial(item.summary)
    && (item.capabilityId.startsWith("agent.") || item.capabilityId.startsWith("tool.") || item.capabilityId.startsWith("app.")),
  );
  const hasVerifiedResearch = successful.some(item => ["agent.fast-research", "agent.deep-research"].includes(item.capabilityId));
  const usefulObservations = successful
    .filter(item => !(hasVerifiedResearch && item.capabilityId === "tool.hot-topic-discovery"))
    .reverse();
  const priorConversationSource = stripOperationalMaterial(stripConversationAppProtocols(input.priorConversationSource ?? "")).slice(0, 14000);
  if (!usefulObservations.length && !priorConversationSource) return isOperationalOnlyMaterial(directSource) ? "" : directSource;

  const evidence = usefulObservations.map((item, index) =>
    `【已有成果${index + 1}｜${item.capabilityId}】\n${removeApplicationProtocol(item.summary)}`,
  ).filter(item => item.trim()).join("\n\n").slice(0, 22000);
  return [
    priorConversationSource && `【上一轮已经确认的主题与成果（本次必须承接，不得重新选题）】\n${priorConversationSource}`,
    evidence && `【已取得的研究、读取或上游应用成果（必须作为本次素材，不得另换主题）】\n${evidence}`,
    `【用户本次要求】\n${removeApplicationProtocol(input.currentRequest || input.objective)}`,
    directSource && directSource !== input.currentRequest && directSource !== input.objective
      ? `【应用执行目标】\n${removeApplicationProtocol(directSource)}`
      : "",
  ].filter(Boolean).join("\n\n").slice(0, 24000);
}

export function buildPriorConversationAppSource(input: {
  currentRequest: string;
  activeTopic: string;
  latestAssistantContent: string;
  app?: CreationApp;
}) {
  const request = input.currentRequest.trim();
  const referential = /(?:这个|该|上述|上面|刚才|前面|这些|刚完成(?:的)?|刚生成(?:的)?|刚写好(?:的)?|刚才完成(?:的)?)(?:话题|新闻|事件|方向|角度|内容|材料|稿子|成果|正文|文案|文章|口播|图片|视频)?/.test(request)
    || /^(?:重新写(?:一版)?|重写|再写一版|再写一个版本|换个版本|另写一版|从头写|重新生成)(?:一下|一遍|正文|这篇|这一篇|吧)?[。！!\s]*$/.test(request);
  if (!referential && !isGenericApplicationIntent(request, input.app)) return "";
  const topic = stripConversationAppProtocols(input.activeTopic).trim();
  const result = stripConversationAppProtocols(input.latestAssistantContent).trim();
  if (result.length < 40) return "";
  return [topic && topic !== request ? `【当前承接主题】\n${topic}` : "", `【上一轮成果】\n${result}`].filter(Boolean).join("\n\n").slice(0, 16000);
}

/** A confirmation handoff is single-use and app-scoped. Historical forms must
 * never leak their material into a later free-form request. */
export function resolvePendingApplicationHandoff(
  messages: Array<{ message_type?: string; metadata_json?: Record<string, unknown> | null }>,
  currentRequest: string,
) {
  const confirmedApp = currentRequest.match(/\[应用参数:([^\]]+)\]/)?.[1]?.trim();
  if (!confirmedApp) return { instruction: "", source: "" };
  const clarification = [...messages].reverse().find(item =>
    item.message_type === "clarification"
    && item.metadata_json?.reason === `app-parameters:${confirmedApp}`,
  );
  return {
    instruction: typeof clarification?.metadata_json?.pendingAppInstruction === "string" ? clarification.metadata_json.pendingAppInstruction : "",
    source: typeof clarification?.metadata_json?.pendingAppSource === "string" ? clarification.metadata_json.pendingAppSource : "",
  };
}

/** Remove internal confirmation envelopes from material fields before billing. */
export function sanitizeConversationAppValues(values: Record<string, CreationFieldValue>, appSlug: string) {
  const sanitized = { ...values };
  for (const [id, value] of Object.entries(sanitized)) {
    if (!MATERIAL_FIELD_PATTERN.test(id) || typeof value !== "string" || !value.includes(PARAMETER_MARKER)) continue;
    const nested = parseConversationAppParameters(value, appSlug);
    const replacement = nested && Object.entries(nested).find(([nestedId, nestedValue]) => MATERIAL_FIELD_PATTERN.test(nestedId) && typeof nestedValue === "string" && nestedValue.trim())?.[1];
    sanitized[id] = typeof replacement === "string" ? replacement.trim() : removeApplicationProtocol(value);
  }
  return sanitized;
}

function removeApplicationProtocol(value: string) {
  if (!value.includes(PARAMETER_MARKER)) return value.trim();
  return value.slice(0, value.indexOf(PARAMETER_MARKER))
    .replace(/已确认(?:[“\"]?.+?[”\"]?的)?创作设置[：:]?/g, "")
    .replace(/开始生成[。.]?/g, "")
    .replace(/^[\s。.:：]+|[\s。.:：]+$/g, "")
    .trim();
}

/**
 * Keep historical chat useful as prose while removing executable form
 * envelopes. This is intentionally app-agnostic so one application's old
 * confirmation cannot leak into another application's source field.
 */
export function stripConversationAppProtocols(value: string) {
  if (!value.includes(PARAMETER_MARKER)) return value;
  const lines = value.split("\n");
  const kept: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].trim().startsWith(PARAMETER_MARKER)) {
      kept.push(lines[index]);
      continue;
    }
    const next = lines[index + 1]?.trim() ?? "";
    if (next) {
      try { JSON.parse(next.startsWith("{") ? next : decodeURIComponent(next)); index += 1; } catch { /* discard only the marker */ }
    }
  }
  return kept.join("\n")
    .replace(/已确认(?:[“"]?.+?[”"]?的)?创作设置[：:]?\s*/g, "")
    .replace(/开始生成[。.]?\s*/g, "")
    .trim();
}

export function hasConversationAppParameters(text: string, appSlug: string) {
  return Boolean(parseConversationAppParameters(text, appSlug));
}

export function resolveConversationAppParameters(currentMessage: string, context: string, appSlug: string) {
  const marker = `${PARAMETER_MARKER}${appSlug}]`;
  if (currentMessage.includes(marker)) return parseConversationAppParameters(currentMessage, appSlug);
  // Application envelopes are single-use commands. Historical conversation
  // context may explain the user's intent, but must never silently re-submit a
  // form from an earlier turn (or reuse a consumed workflow/work id).
  void context;
  return null;
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
  if (/^(我)?(想|要|需要|打算)?(写|做|制作|生成|创作|优化|分析|整理|看|看看|诊断|弄)(一下|下)?(一|1)?(篇|个|份|条|张|套|段)?(短视频)?(口播文案稿?|口播稿?|文案稿?|文章|公众号文章|小红书笔记|图片|海报|封面|知识(?:卡片|图片)|PPT|幻灯片|视频|报告|方案|保单|产品|资料|直播稿|招募文案|续期提醒卡|IP定位)$/.test(normalized)) return true;
  const appName = app?.name.replace(/[（）()·\s]/g, "");
  return Boolean(appName && new RegExp(`^(我)?(想|要|需要)?(用|使用|打开|做|制作|生成)?${escapeRegExp(appName)}$`).test(normalized));
}

export function shouldSkipTrafficTopicSelection(text: string) {
  const hasCompiledFocus = text.includes("【当前焦点｜必须优先承接】") || text.includes("【上一轮已经确认的主题与成果（本次必须承接，不得重新选题）】");
  const createsFromContext = /(?:写|生成|创作|制作|输出|做成|转成).{0,18}(?:口播|文案|正文|稿|文章|脚本)/.test(text);
  return hasCompiledFocus && createsFromContext || /(?:题目|选题|角度)(?:已经|已|就|都)?(?:定了|确定|明确)|(?:无需|不用|不要|跳过)(?:再)?(?:分析|推荐|选择)?选题|直接(?:按这个题|根据这个题|写|生成)(?:口播|文案|正文|稿)?|^(?:重新写(?:一版)?|重写|再写一版|再写一个版本|换个版本|另写一版|从头写|重新生成)(?:一下|一遍|正文|这篇|这一篇|吧)?[。！!\s]*$|(?:重新写(?:一版)?|重写|再写一版|换个版本|另写一版|从头写|重新生成(?:并优化)?).{0,50}(?:已承接|已有|上一版|原(?:来|有)|口播|正文|文案)/.test(text);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function resolveConversationAppSource(pendingInstruction: string, followup: string, objective: string, appSlug = "") {
  for (const candidate of [pendingInstruction, followup]) {
    const parameters = appSlug ? parseConversationAppParameters(candidate, appSlug) : null;
    if (parameters) {
      const material = Object.entries(parameters).find(([id, value]) => MATERIAL_FIELD_PATTERN.test(id) && typeof value === "string" && value.trim());
      if (material) return String(material[1]).trim();
    }
    const plain = candidate.trim();
    if (plain && !plain.includes(PARAMETER_MARKER)) return plain;
  }
  return objective.trim();
}

export function buildConversationAppFields(app: CreationApp, source: string): ConversationAppField[] {
  const initialValues = createCreationAppInitialValues(app);
  const base = app.fields.map((field) => fieldToConversationField(field, source, initialValues[field.id]));
  if (app.slug === "image-card" && source.trim()) return lockImageCardToTextCreation(base);
  if (app.slug !== "link-remix") return base;
  const dynamic = new Map<string, ConversationAppField>();
  for (const target of remixCapabilityOptions) {
    for (const setting of getRemixCapabilitySettings(target.value)) {
      const converted = fieldToConversationField(setting, source, initialValues[setting.id]);
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

/** Upgrade persisted forms created before newer field constraints existed. */
export function upgradeStoredConversationPresentation(metadata: Record<string, unknown>, apps: CreationApp[]) {
  const presentation = metadata.presentation;
  if (!presentation || typeof presentation !== "object" || !Array.isArray((presentation as { blocks?: unknown }).blocks)) return metadata;
  const blocks = (presentation as { blocks: Array<Record<string, unknown>> }).blocks.map(block => {
    if (block.type === "choices" && Array.isArray(block.options)) return {
      ...block,
      options: (block.options as Array<Record<string, unknown>>).map(option => {
        const continuation = option.continuation;
        if (!continuation || typeof continuation !== "object") return option;
        const value = continuation as Record<string, unknown>;
        return value.appSlug === "xiaohongshu-studio" && value.kind === "same-work" && value.targetStep === "assets"
          ? { ...option, href: undefined, continuation: { ...value, targetCapabilityId: "skill.xiaohongshu-assets", presentation: "inline-form" } }
          : option;
      }),
    };
    if (block.type !== "form" || typeof block.appSlug !== "string" || !Array.isArray(block.fields)) return block;
    const app = apps.find(item => item.slug === block.appSlug);
    if (!app) return block;
    const storedFields = block.fields as Array<Record<string, unknown>>;
    const source = storedFields.find(field => typeof field.id === "string" && MATERIAL_FIELD_PATTERN.test(field.id) && typeof field.initialValue === "string" && field.initialValue.trim())?.initialValue;
    if (typeof source !== "string" || !source.trim()) return block;
    const currentFields = new Map(buildConversationAppFields(app, source).map(field => [field.id, field]));
    return {
      ...block,
      fields: storedFields.map(field => {
        const current = typeof field.id === "string" ? currentFields.get(field.id) : null;
        return current?.presentation === "data" && current.initialValue
          ? { ...field, presentation: "data", initialValue: current.initialValue }
          : field;
      }),
    };
  });
  return { ...metadata, presentation: { ...(presentation as Record<string, unknown>), blocks } };
}

function lockImageCardToTextCreation(fields: ConversationAppField[]) {
  return fields.flatMap(field => {
    if (["remix_instruction", "portrait_reference_image"].includes(field.id)) return [];
    if (field.id === "creation_mode") return [{ ...field, presentation: "data" as const, initialValue: "text_to_card" }];
    if (field.id === "reference_image") return [{
      ...field,
      label: "选择或上传人物参考图",
      helper: "仅在选择“使用我上传的形象照”后显示，可上传 1—3 张清晰参考图。",
      visibleWhen: [{ fieldId: "draw_portrait", equals: "yes" }],
      visibleWhenAny: undefined,
    }];
    return [field];
  });
}

function fieldToConversationField(field: CreationField, source: string, initialValue?: CreationFieldValue): ConversationAppField {
  const type = field.type === "radio" || field.type === "select" ? "single"
    : field.type === "multiselect" ? "multiple"
      : field.type === "file" || field.type === "text_or_file" ? "file"
        : field.type;
  const sourceLike = MATERIAL_FIELD_PATTERN.test(field.id);
  const inheritedSourceValue = source.trim() && field.inheritedSourceValue;
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
    presentation: inheritedSourceValue ? "data" : field.presentation,
    step: field.step,
    options: field.options?.map((option) => ({ label: option.label, value: option.value, description: option.hint, previewUrl: option.previewUrl })),
    initialValue: inheritedSourceValue || (sourceLike && (type === "text" || type === "textarea" || type === "file") ? source : initialValue ?? (type === "multiple" ? [] : "")),
  };
}

export function mergeConversationAppParameters(base: Record<string, CreationFieldValue>, taskText: string, appSlug: string) {
  return { ...base, ...(parseConversationAppParameters(taskText, appSlug) ?? {}) };
}

export function appNextActions(appSlug: string, resultType: CreationApp["resultType"], resultUrl = "", context: { workId?: string; sourceArtifactId?: string } = {}) {
  const contract = workflowContractForApp({ slug: appSlug, name: appSlug, resultType });
  return contract.continuations.map(continuation => ({
    label: continuation.label,
    value: continuation.instruction,
    description: continuation.description,
    ...(continuation.presentation === "embedded-workspace" && resultUrl ? { href: resultUrl } : {}),
    continuation: {
      protocolVersion: 1 as const,
      appSlug,
      id: continuation.id,
      kind: continuation.kind,
      presentation: continuation.presentation,
      ...(continuation.targetStep ? { targetStep: continuation.targetStep } : {}),
      ...(continuation.targetCapabilityId ? { targetCapabilityId: continuation.targetCapabilityId } : {}),
      ...(context.workId ? { workId: context.workId } : {}),
      ...(context.sourceArtifactId ? { sourceArtifactId: context.sourceArtifactId } : {}),
    },
  }));
}
