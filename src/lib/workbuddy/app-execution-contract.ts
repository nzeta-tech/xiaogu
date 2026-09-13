import type { CreationApp } from "@/lib/apps/catalog";
import type { DeliverableKind } from "./deliverable-contract";

export type NormalizedDeliverable = { id: string; kind: DeliverableKind; title: string; content: string; url?: string };

export function previewDeliverableContent(item: Pick<NormalizedDeliverable, "kind" | "title" | "content">, limit = 600) {
  if (/^data:[^;,]+(?:;[^,]*)?,/i.test(item.content)) return `[${item.kind} binary omitted] ${item.title}`;
  return item.content.slice(0, limit);
}

/** A request for missing input is an interaction, not a generated artifact. */
export function isAppClarificationResponse(content: string) {
  const text = content.replace(/[*_#`]/g, "").replace(/\s+/g, " ").trim();
  if (!text || text.length > 500) return false;
  const asksForInput = /(?:请|需要|还差|先).{0,80}(?:提供|补充|发送|发我|上传|粘贴|输入|选择|告诉)/.test(text);
  const namesMaterial = /(?:素材|原文|资料|内容|主题|话题|文件|图片|链接|信息|参数)/.test(text);
  return asksForInput && namesMaterial;
}
export type AppExecutionContract = {
  appSlug: string;
  outputKind: DeliverableKind;
  artifactMode: "single" | "collection";
  defaultCount: number;
  retryStrategy: "retry-missing" | "retry-whole" | "interactive";
};

const overrides: Record<string, Partial<AppExecutionContract>> = {
  "digital-human-video": { outputKind: "data", retryStrategy: "interactive" },
  "wechat-images": { artifactMode: "collection", defaultCount: 4, retryStrategy: "retry-missing" },
  "image-card": { artifactMode: "collection", retryStrategy: "retry-missing" },
  "wechat-cover": { retryStrategy: "retry-whole" },
  "video-cover": { retryStrategy: "retry-whole" },
  "policy-renewal-card": { retryStrategy: "retry-whole" },
  "write-copy": { artifactMode: "collection" },
  "traffic-copy": { artifactMode: "collection" },
  "ppt-maker": { retryStrategy: "interactive" },
};

export function contractForCreationApp(app: Pick<CreationApp, "slug" | "resultType">): AppExecutionContract {
  const outputKind: DeliverableKind = app.resultType === "presentation" ? "presentation" : app.resultType === "image" || app.resultType === "image-plan" ? "image" : "text";
  return { appSlug: app.slug, outputKind, artifactMode: "single", defaultCount: 1, retryStrategy: outputKind === "image" ? "retry-missing" : "retry-whole", ...overrides[app.slug] };
}

export function contractForCapability(capability: { id: string; outputTypes: DeliverableKind[] }): AppExecutionContract | null {
  if (capability.outputTypes.length !== 1) return null;
  const outputKind = capability.outputTypes[0];
  if (capability.id === "skill.xiaohongshu-assets") return { appSlug: capability.id, outputKind: "image", artifactMode: "collection", defaultCount: 5, retryStrategy: "retry-missing" };
  return { appSlug: capability.id, outputKind, artifactMode: outputKind === "data" ? "collection" : "single", defaultCount: 1, retryStrategy: outputKind === "image" || outputKind === "video" ? "retry-missing" : "retry-whole" };
}

export function normalizeAppDeliverables(input: {
  contract: AppExecutionContract;
  content?: string;
  contentJson?: Record<string, unknown>;
  resultUrl?: string;
}): NormalizedDeliverable[] {
  const { contract } = input;
  const json = input.contentJson ?? {};
  if (contract.outputKind === "image") {
    const images = firstArray(json.images, nested(json, "result", "images"), nested(json, "contentJson", "images"));
    return images.flatMap((item, index) => normalizeMedia(item, index, "image"));
  }
  if (contract.outputKind === "presentation") {
    const files = firstArray(json.presentations, json.files, nested(json, "result", "files"));
    const normalized = files.flatMap((item, index) => normalizeMedia(item, index, "presentation"));
    if (normalized.length) return normalized;
    const url = firstString(json.downloadUrl, json.resultUrl, input.resultUrl);
    return url ? [{ id: `${contract.appSlug}-presentation-1`, kind: "presentation", title: "演示文稿", content: url, url }] : [];
  }
  if (contract.outputKind === "video") {
    const videos = firstArray(json.videos, json.files, nested(json, "result", "videos"));
    return videos.flatMap((item, index) => normalizeMedia(item, index, "video"));
  }
  if (contract.outputKind === "data") {
    const items = firstArray(json.items, json.rows, nested(json, "result", "items"));
    const normalized = items.map((item, index) => ({ id: itemId(item, index), kind: "data" as const, title: itemTitle(item, index), content: stringify(item) }));
    if (normalized.length) return normalized;
    // Research/connectors often return one aggregate evidence package rather
    // than a conventional `items` array. The package itself is the data
    // deliverable; dropping it here leaves the protocol output slot empty and
    // makes the stop gate retry a successful read forever.
    const content = input.content?.trim() || (Object.keys(json).length ? stringify(json) : "");
    return content ? [{ id: `${contract.appSlug}-data-1`, kind: "data", title: "数据结果", content }] : [];
  }
  const contentRoot = isRecord(json.contentJson) ? json.contentJson : json;
  const batches = Array.isArray(contentRoot.batches) ? contentRoot.batches : [];
  const batchItems = batches.flatMap((batch, batchIndex) => isRecord(batch) && Array.isArray(batch.items)
    ? batch.items.flatMap((item, itemIndex) => normalizeTextItem(item, `${batchIndex + 1}-${itemIndex + 1}`)) : []);
  if (batchItems.length) return batchItems;
  for (const key of ["scripts", "articles", "items", "outputs", "drafts"]) {
    if (Array.isArray(contentRoot[key])) {
      const items = (contentRoot[key] as unknown[]).flatMap((item, index) => normalizeTextItem(item, String(index + 1)));
      if (items.length) return items;
    }
  }
  return input.content?.trim() ? [{ id: `${contract.appSlug}-text-1`, kind: "text", title: "生成内容", content: input.content.trim() }] : [];
}

export function buildMissingDeliverableInstruction(contract: AppExecutionContract, expected: number, actual: number, sourceArtifactIds: string[]) {
  const missing = Math.max(0, expected - actual);
  return [
    `交付门禁：${contract.appSlug} 应交付 ${expected} 个 ${contract.outputKind} 成果，当前只有 ${actual} 个，还缺 ${missing} 个。`,
    sourceArtifactIds.length ? `必须继续承接这些来源成果：${sourceArtifactIds.join("、")}。` : "",
    contract.retryStrategy === "retry-missing" ? "只生成缺失项，保留已有成功结果；不得合并成拼图或单个成果。" : contract.retryStrategy === "interactive" ? "保持当前编辑任务并补齐缺失的可下载成果。" : "重新执行当前应用并确保完整交付。",
  ].filter(Boolean).join("\n");
}

function normalizeTextItem(item: unknown, suffix: string): NormalizedDeliverable[] {
  if (typeof item === "string" && item.trim()) return [{ id: `text-${suffix}`, kind: "text", title: `内容 ${suffix}`, content: item.trim() }];
  if (!isRecord(item)) return [];
  const content = firstString(item.body, item.content, item.text, item.script);
  return content ? [{ id: typeof item.id === "string" ? item.id : `text-${suffix}`, kind: "text", title: firstString(item.title, item.label) || `内容 ${suffix}`, content }] : [];
}

function normalizeMedia(item: unknown, index: number, kind: "image" | "presentation" | "video"): NormalizedDeliverable[] {
  if (typeof item === "string") return [{ id: `${kind}-${index + 1}`, kind, title: `${kind} ${index + 1}`, content: item, url: item }];
  if (!isRecord(item)) return [];
  const url = firstString(item.url, item.imageUrl, item.downloadUrl, item.fileUrl, item.src);
  if (!url) return [];
  return [{ id: typeof item.id === "string" ? item.id : `${kind}-${index + 1}`, kind, title: firstString(item.title, item.name, item.filename) || `${kind} ${index + 1}`, content: url, url }];
}

function nested(value: Record<string, unknown>, key: string, child: string) { return isRecord(value[key]) ? (value[key] as Record<string, unknown>)[child] : undefined; }
function firstArray(...values: unknown[]) { return values.find(Array.isArray) as unknown[] | undefined ?? []; }
function firstString(...values: unknown[]) { return values.find((value): value is string => typeof value === "string" && Boolean(value.trim())) ?? ""; }
function itemId(item: unknown, index: number) { return isRecord(item) && typeof item.id === "string" ? item.id : `data-${index + 1}`; }
function itemTitle(item: unknown, index: number) { return isRecord(item) ? firstString(item.title, item.name, item.label) || `数据 ${index + 1}` : `数据 ${index + 1}`; }
function stringify(value: unknown) { return typeof value === "string" ? value : JSON.stringify(value); }
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
