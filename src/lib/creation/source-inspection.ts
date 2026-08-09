import { createHash } from "node:crypto";
import type { LocalAgentTask, SourceInspectResult } from "@/lib/local-agent/contracts";
import { enqueueLocalAgentTask } from "@/lib/local-agent/repository";

const supportedHosts = /(^|\.)((douyin\.com)|(weixin\.qq\.com)|(channels\.weixin\.qq\.com)|(xiaohongshu\.com)|(xhslink\.com))$/i;

export const SOURCE_INSPECTION_PRIORITIES = {
  LINK_REMIX: 1_000,
  VIRAL_CONTENT: 1_000,
  AVATAR_TRAINING: 100,
} as const;

export type SourceInspectionPurpose = "link_remix" | "viral_content" | "avatar_training";

export type StandardizedSourceInspection = {
  sourceUrl: string;
  finalUrl: string;
  platform: "video_channel" | "douyin" | "wechat_article" | "xiaohongshu" | "unknown";
  title: string;
  transcript: string;
  author: string;
  thumbnailUrl: string;
  status: "succeeded" | "failed";
  failureStage: "parsing" | "media" | "transcribing" | "";
  failureReason: string;
};

export function canonicalizeInspectableSourceUrl(rawUrl: string) {
  const parsed = new URL(rawUrl.trim());
  if (!/^https?:$/.test(parsed.protocol) || !supportedHosts.test(parsed.hostname)) {
    throw new Error("仅支持抖音、视频号、公众号和小红书的单条作品链接。");
  }
  parsed.hash = "";
  return parsed.toString();
}

export async function enqueueSourceInspectionTask(input: {
  userId: string;
  url: string;
  purpose: SourceInspectionPurpose;
  priority?: number;
  maxAttempts?: number;
}) {
  const canonicalUrl = canonicalizeInspectableSourceUrl(input.url);
  const dedupeKey = createHash("sha256").update(`${input.userId}:${canonicalUrl}`).digest("hex");
  const task = await enqueueLocalAgentTask({
    taskType: "source.inspect",
    ownerUserId: input.userId,
    payload: { url: canonicalUrl, userId: input.userId, purpose: input.purpose },
    dedupeKey,
    priority: input.priority ?? 100,
    maxAttempts: input.maxAttempts ?? 3,
  });
  return { task, canonicalUrl };
}

export function standardizeSourceInspection(input: {
  sourceUrl: string;
  result?: Record<string, unknown> | null;
  taskStatus?: LocalAgentTask["status"];
  errorMessage?: string | null;
}): StandardizedSourceInspection {
  const result = recordValue(input.result);
  const fields = stringRecord(result.fields);
  const sourceUrl = input.sourceUrl;
  const title = fields.source_title ?? "";
  const transcript = fields.source_transcript ?? "";
  const taskFailed = input.taskStatus === "failed" || input.taskStatus === "cancelled";
  const missingReason = !title ? "未读取到作品标题。" : !transcript ? "未读取到可用于训练的口播转写。" : "";
  const failureReason = taskFailed ? (input.errorMessage?.trim() || "作品处理失败。") : missingReason;
  return {
    sourceUrl,
    finalUrl: stringValue(result.finalUrl) || sourceUrl,
    platform: platformFromSource(fields.source_type, sourceUrl),
    title,
    transcript,
    author: fields.source_author ?? "",
    thumbnailUrl: stringValue(result.thumbnailUrl),
    status: failureReason ? "failed" : "succeeded",
    failureStage: failureReason ? inferFailureStage(failureReason, title) : "",
    failureReason,
  };
}

function platformFromSource(sourceType = "", url: string): StandardizedSourceInspection["platform"] {
  const value = sourceType.toLowerCase();
  if (value.includes("douyin")) return "douyin";
  if (value.includes("xiaohongshu") || value.includes("xhs")) return "xiaohongshu";
  if (value.includes("article")) return "wechat_article";
  if (value.includes("channel") || value.includes("视频号")) return "video_channel";
  try {
    const parsed = new URL(url);
    if (/douyin\.com$/i.test(parsed.hostname)) return "douyin";
    if (/xiaohongshu\.com$|xhslink\.com$/i.test(parsed.hostname)) return "xiaohongshu";
    if (/^mp\.weixin\.qq\.com$/i.test(parsed.hostname)) return "wechat_article";
    if (/weixin\.qq\.com$|channels\.weixin\.qq\.com$/i.test(parsed.hostname)) return "video_channel";
  } catch {}
  return "unknown";
}

function inferFailureStage(message: string, title: string): StandardizedSourceInspection["failureStage"] {
  if (/转写|语音|transcrib/i.test(message)) return "transcribing";
  if (/下载|音频|视频|media/i.test(message) || (title && message.includes("口播"))) return "media";
  return "parsing";
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringRecord(value: unknown): Record<string, string> {
  const record = recordValue(value);
  return Object.fromEntries(Object.entries(record).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

function stringValue(value: unknown) { return typeof value === "string" ? value.trim() : ""; }

// Compile-time guard: the shared result keeps the established Viral Remix fields intact.
const _sourceInspectResultCompatibility: Pick<SourceInspectResult, "fields"> | null = null;
void _sourceInspectResultCompatibility;
