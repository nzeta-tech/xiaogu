import { getCreationAppBySlug, type CreationField } from "../apps/catalog.ts";
import type { CreationFieldValue, CreationOutputViewMode } from "./output.ts";
import { normalizeRemixCapability, type RemixCapabilityId } from "./capabilities.ts";
import { buildRemixStudioSource } from "./remix-studio-source.ts";

export type RemixCapabilityDefinition = {
  id: RemixCapabilityId;
  appSlug: "traffic-copy" | "wechat-studio" | "xiaohongshu-studio" | "write-copy";
  settingFieldIds: string[];
  defaults: Record<string, CreationFieldValue>;
  lockedValues: Record<string, CreationFieldValue>;
  sourceField: "source" | "topic";
  result: { id: string; label: string; viewMode: CreationOutputViewMode; view: "traffic-copy" | "wechat-studio" | "xiaohongshu-studio" | "write-copy" };
};

const definitions: Record<RemixCapabilityId, RemixCapabilityDefinition> = {
  "traffic-copy": {
    id: "traffic-copy",
    appSlug: "traffic-copy",
    settingFieldIds: [],
    defaults: { creator_skill_version_ids: ["default"] },
    lockedValues: {},
    sourceField: "source",
    result: { id: "remix-video", label: "口播文案", viewMode: "plain", view: "traffic-copy" },
  },
  "wechat-studio": {
    id: "wechat-studio",
    appSlug: "wechat-studio",
    settingFieldIds: ["audience", "tone", "lengthMode"],
    defaults: { audience: "young-family", tone: "professional", lengthMode: "minimal" },
    lockedValues: {},
    sourceField: "topic",
    result: { id: "remix-wechat", label: "微信公众号", viewMode: "wechat", view: "wechat-studio" },
  },
  "xiaohongshu-studio": {
    id: "xiaohongshu-studio",
    appSlug: "xiaohongshu-studio",
    settingFieldIds: ["length_mode"],
    defaults: { length_mode: "standard" },
    lockedValues: { creation_mode: "rewrite" },
    sourceField: "topic",
    result: { id: "remix-xhs", label: "小红书", viewMode: "xiaohongshu", view: "xiaohongshu-studio" },
  },
  moments: {
    id: "moments",
    appSlug: "write-copy",
    settingFieldIds: ["tone"],
    defaults: { tone: "self" },
    lockedValues: { targets: ["moments"] },
    sourceField: "source",
    result: { id: "remix-moments", label: "朋友圈", viewMode: "plain", view: "write-copy" },
  },
};

export function getRemixCapabilityDefinition(value: unknown) {
  return definitions[normalizeRemixCapability(value)];
}

export function getRemixCapabilitySettings(value: unknown): CreationField[] {
  const definition = getRemixCapabilityDefinition(value);
  const app = getCreationAppBySlug(definition.appSlug);
  if (!app) return [];
  const fields = new Map(app.fields.map((field) => [field.id, field]));
  return definition.settingFieldIds.flatMap((id) => fields.get(id) ? [fields.get(id)!] : []);
}

export function getRemixCapabilityDefaults(value: unknown) {
  const definition = getRemixCapabilityDefinition(value);
  return { ...definition.defaults, ...definition.lockedValues };
}

export function adaptRemixCapabilityInput(
  value: unknown,
  values: Record<string, CreationFieldValue>,
  sourceMaterial: string,
) {
  const definition = getRemixCapabilityDefinition(value);
  const settings = Object.fromEntries(definition.settingFieldIds.flatMap((id) => values[id] === undefined ? [] : [[id, values[id]]]));
  return {
    ...definition.defaults,
    ...settings,
    ...definition.lockedValues,
    [definition.sourceField]: sourceMaterial,
  } as Record<string, CreationFieldValue>;
}

export function getRemixResultMeta(value: unknown) {
  return getRemixCapabilityDefinition(value).result;
}

export function buildPendingRemixContentJson(values: Record<string, CreationFieldValue>) {
  const definition = getRemixCapabilityDefinition(values.remix_target);
  const source = buildRemixStudioSource(values);
  return {
    batches: [],
    effectiveAppSlug: definition.appSlug,
    remixTarget: definition.id,
    ...(definition.id === "wechat-studio" ? { wechatStudioState: {
      topic: source,
      audience: String(values.audience || definition.defaults.audience || "young-family"),
      tone: String(values.tone || definition.defaults.tone || "professional"),
      lengthMode: String(values.lengthMode || definition.defaults.lengthMode || "minimal"),
      content: "",
      activeTab: "article",
      generationPending: true,
    } } : {}),
    ...(definition.id === "xiaohongshu-studio" ? { xiaohongshuStudioState: {
      topic: source,
      creationMode: "rewrite",
      lengthMode: String(values.length_mode || definition.defaults.length_mode || "standard"),
      content: "",
      tab: "note",
      generationPending: true,
    } } : {}),
  };
}
