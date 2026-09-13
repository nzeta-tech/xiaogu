import { createHash, randomUUID } from "node:crypto";
import type { DeliverableKind } from "./deliverable-contract.ts";

export const WORKBUDDY_PROTOCOL_VERSION = "1" as const;
export type WorkbuddyProtocolVersion = typeof WORKBUDDY_PROTOCOL_VERSION;
export type WorkbuddyExecutionMode = "discover" | "create" | "edit" | "transform" | "evaluate" | "repair";
export type WorkbuddyTurnRelation = "new_objective" | "continue" | "modify_current" | "repair_result" | "clarify" | "cancel" | "unrelated";
export type WorkbuddyMessageVisibility = "user_and_model" | "model_only" | "ui_only" | "audit_only";

export type TurnEnvelope = {
  protocolVersion: WorkbuddyProtocolVersion;
  turnId: string;
  runId?: string;
  relation: WorkbuddyTurnRelation;
  mode: WorkbuddyExecutionMode;
  target: { kind: "artifact" | "run" | "app" | "conversation"; ids: string[] };
  request: {
    action: string;
    outputKind?: DeliverableKind;
    count?: number;
    independence?: "single" | "collection" | "one_per_source";
  };
  confidence: number;
  ambiguities: string[];
};

export type ToolCallEnvelope<TInput = Record<string, unknown>> = {
  protocolVersion: WorkbuddyProtocolVersion;
  runId: string;
  stepId: string;
  attempt: number;
  capabilityId: string;
  input: TInput;
  sourceArtifactIds: string[];
  outputSlotIds: string[];
  idempotencyKey: string;
  timeoutMs: number;
};

export type ObservationOutput = {
  slotId: string;
  artifactId?: string;
  kind: DeliverableKind;
  title?: string;
  preview?: string;
  contentRef?: string;
  downloadUrl?: string;
  editorUrl?: string;
};

export type ObservationEnvelope = {
  protocolVersion: WorkbuddyProtocolVersion;
  observationId: string;
  runId: string;
  stepId: string;
  attempt: number;
  status: "success" | "partial" | "failed" | "blocked";
  retryable: boolean;
  preview: string;
  fullResultRef?: string;
  outputs: ObservationOutput[];
  error?: { code: string; message: string };
};

export type EvaluationEnvelope = {
  protocolVersion: WorkbuddyProtocolVersion;
  satisfied: boolean;
  expectedSlots: string[];
  completedSlots: string[];
  missingSlots: string[];
  invalidSlots: string[];
  duplicatedSlots: string[];
  action: "finalize" | "repair_missing" | "retry_whole" | "ask_user" | "stop_partial";
  repairInstructions?: Array<{ slotId: string; reason: string; preserveArtifactIds: string[] }>;
};

export function inferTurnEnvelope(input: {
  request: string;
  runId?: string;
  sourceArtifactIds?: string[];
  outputKind?: DeliverableKind;
  expectedCount?: number;
  hasActiveRun?: boolean;
}): TurnEnvelope {
  const request = input.request.trim();
  const referential = /(?:这个|这些|它们|上述|上面|刚才|前面|上一版|这版|这两个|两篇|分别|各自|第[一二三四五六七八九十\d]+(?:个|项|条|篇|题)?)/.test(request);
  const repair = /(?:没生成|少了|漏了|不对|重新|重做|修复|补一|补齐|下载按钮)/.test(request);
  const cancel = /^(?:停|停止|取消|算了|不要了)[吧。！!\s]*$/.test(request);
  const transform = /(?:转成|做成|改成|写成|生成|制作|写).{0,12}(?:文案|口播|文章|笔记|小红书|公众号|图片|卡片|封面|视频|PPT)|(?:用|按).{0,16}(?:写|生成|制作|做).{0,12}(?:文案|口播|文章|笔记|小红书|公众号|图片|卡片|封面|视频|PPT)/i.test(request);
  const edit = /(?:修改|改一下|优化|润色|调整)/.test(request);
  const discover = /(?:热点|热搜|选题|候选|找一找|推荐一些)/.test(request) && !transform;
  const relation: WorkbuddyTurnRelation = cancel ? "cancel"
    : repair ? "repair_result"
      : input.hasActiveRun && (referential || transform || edit) ? "modify_current"
        : input.hasActiveRun ? "continue" : "new_objective";
  const mode: WorkbuddyExecutionMode = cancel ? "evaluate" : repair ? "repair" : transform ? "transform" : edit ? "edit" : discover ? "discover" : "create";
  const count = input.expectedCount && input.expectedCount > 0 ? input.expectedCount : undefined;
  const sourceIds = input.sourceArtifactIds ?? [];
  return {
    protocolVersion: WORKBUDDY_PROTOCOL_VERSION,
    turnId: randomUUID(),
    ...(input.runId ? { runId: input.runId } : {}),
    relation,
    mode,
    target: { kind: sourceIds.length ? "artifact" : input.hasActiveRun ? "run" : "conversation", ids: sourceIds },
    request: {
      action: request,
      ...(input.outputKind ? { outputKind: input.outputKind } : {}),
      ...(count ? { count } : {}),
      ...(count ? { independence: sourceIds.length === count || /(?:分别|各自|每个)/.test(request) ? "one_per_source" : "collection" } : {}),
    },
    confidence: referential && !sourceIds.length ? 0.62 : 0.94,
    ambiguities: referential && !sourceIds.length ? ["指代对象尚未解析为具体作品"] : [],
  };
}

export function buildOutputSlots(kind: DeliverableKind, count: number, sourceArtifactIds: string[] = []) {
  return Array.from({ length: Math.max(1, count) }, (_, index) => sourceArtifactIds[index]
    ? `${kind}:source:${sourceArtifactIds[index]}`
    : `${kind}:${index + 1}`);
}

export function createToolCallEnvelope<TInput>(input: Omit<ToolCallEnvelope<TInput>, "protocolVersion" | "idempotencyKey">): ToolCallEnvelope<TInput> {
  const idempotencyKey = createHash("sha256")
    // Step and attempt are deliberately excluded: retrying the same side
    // effect must resolve to the same durable key. Slot-repair calls remain
    // distinct because their requested output slots differ.
    .update(JSON.stringify([input.runId, input.capabilityId, [...input.outputSlotIds].sort(), [...input.sourceArtifactIds].sort(), input.input]))
    .digest("hex")
    .slice(0, 32);
  return { protocolVersion: WORKBUDDY_PROTOCOL_VERSION, ...input, idempotencyKey };
}

export function evaluateOutputSlots(input: {
  expectedSlots: string[];
  outputs: ObservationOutput[];
  retryStrategy?: "retry-missing" | "retry-whole" | "interactive";
}): EvaluationEnvelope {
  const completedSlots = [...new Set(input.outputs.filter(item => item.artifactId || item.contentRef || item.downloadUrl).map(item => item.slotId))];
  const missingSlots = input.expectedSlots.filter(slot => !completedSlots.includes(slot));
  const duplicatedSlots = completedSlots.filter((slot, index) => completedSlots.indexOf(slot) !== index);
  const satisfied = missingSlots.length === 0 && duplicatedSlots.length === 0;
  return {
    protocolVersion: WORKBUDDY_PROTOCOL_VERSION,
    satisfied,
    expectedSlots: input.expectedSlots,
    completedSlots,
    missingSlots,
    invalidSlots: [],
    duplicatedSlots,
    action: satisfied ? "finalize" : input.retryStrategy === "interactive" ? "ask_user" : input.retryStrategy === "retry-whole" ? "retry_whole" : "repair_missing",
    ...(!satisfied ? { repairInstructions: missingSlots.map(slotId => ({ slotId, reason: "交付槽位尚无有效产物", preserveArtifactIds: input.outputs.flatMap(item => item.artifactId ? [item.artifactId] : []) })) } : {}),
  };
}
