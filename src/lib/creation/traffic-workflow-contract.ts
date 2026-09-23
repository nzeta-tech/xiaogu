import type { CreationFieldValue } from "@/lib/creation/output";

export type TrafficWorkflowTopic = {
  id?: string;
  title?: string;
  assignedCoachId?: string;
  assignedCoachLabel?: string;
  recommendedCoachId?: string;
  recommendedCoachLabel?: string;
  [key: string]: unknown;
};

export type TrafficWorkflowArena = {
  topics?: TrafficWorkflowTopic[];
  coaches?: Array<{ id?: string; label?: string; title?: string; summary?: string; scenarios?: string[]; styleTags?: string[]; bestFor?: string }>;
  research?: string;
  evidencePack?: unknown;
  topicProcess?: unknown;
};

export function isTrafficWorkflowRequest(appSlug: string, values: Record<string, CreationFieldValue>) {
  return appSlug === "traffic-copy" || appSlug === "link-remix" && values.remix_target === "traffic-copy";
}

export function buildTrafficTopicAnalysisValues(
  base: Record<string, CreationFieldValue>,
  appEntry: string,
) {
  const { traffic_arena_coach_version_ids: _legacyCoachSelection, ...coachIndependentBase } = base;
  return {
    ...coachIndependentBase,
    traffic_topic_only: "yes",
    app_entry: appEntry,
  } satisfies Record<string, CreationFieldValue>;
}

export function buildTrafficGenerationValues(input: {
  base: Record<string, CreationFieldValue>;
  topicWorkId: string;
  topics: TrafficWorkflowTopic[];
  selectedTopicIds: string[];
  research?: string;
  evidencePack?: unknown;
  topicProcess?: unknown;
  coachOverrides?: Record<string, string>;
  coachLabels?: Record<string, string>;
  appEntry: string;
}) {
  const selectedIdSet = new Set(input.selectedTopicIds);
  if (!input.topicWorkId || selectedIdSet.size < 1 || selectedIdSet.size > 3) throw new Error("请选择1—3个有效选题");
  const selectedTopics = input.topics.filter(topic => typeof topic.id === "string" && selectedIdSet.has(topic.id));
  if (selectedTopics.length !== selectedIdSet.size) throw new Error("部分选题已经失效，请重新选择");
  const normalizedTopics = selectedTopics.map(topic => {
    const topicId = String(topic.id);
    const coachId = input.coachOverrides?.[topicId] || topic.assignedCoachId || topic.recommendedCoachId || "default";
    const coachLabel = input.coachLabels?.[coachId] || topic.assignedCoachLabel || topic.recommendedCoachLabel || (coachId === "default" ? "小谷教练" : "创作教练");
    return { ...topic, assignedCoachId: coachId, assignedCoachLabel: coachLabel };
  });
  return {
    ...input.base,
    app_entry: input.appEntry,
    traffic_topic_only: "no",
    traffic_existing_work_id: input.topicWorkId,
    traffic_selected_topics: normalizedTopics.map(topic => JSON.stringify(topic)),
    traffic_shared_research: input.research || "",
    traffic_shared_evidence_pack: input.evidencePack ? stringifyStoredValue(input.evidencePack, 60_000) : "",
    traffic_topic_process: input.topicProcess ? stringifyStoredValue(input.topicProcess, 120_000) : "",
    creative_coach_version_ids: [...new Set(normalizedTopics.map(topic => String(topic.assignedCoachId || "default")))],
  } satisfies Record<string, CreationFieldValue>;
}

export function trafficCoachOverrideFieldId(topicId: string) {
  return `traffic_topic_coach_${topicId}`;
}

export function readTrafficCoachOverrides(values: Record<string, CreationFieldValue>, topicIds: string[]) {
  return Object.fromEntries(topicIds.flatMap(topicId => {
    const value = values[trafficCoachOverrideFieldId(topicId)];
    return typeof value === "string" && value ? [[topicId, value]] : [];
  }));
}

const trafficRegenerationKeys = ["traffic_selected_topics", "traffic_shared_research", "traffic_shared_evidence_pack", "traffic_topic_process", "creative_coach_version_ids"] as const;

export function restoreTrafficRegenerationValues(current: Record<string, CreationFieldValue>, previous: Record<string, CreationFieldValue> | null | undefined, request: string) {
  if (!previous || !Array.isArray(previous.traffic_selected_topics) || previous.traffic_selected_topics.length === 0) return current;
  const restored = { ...current };
  for (const key of trafficRegenerationKeys) if (previous[key] !== undefined) restored[key] = previous[key];
  restored.traffic_topic_only = "no";
  delete restored.traffic_existing_work_id;
  delete restored.traffic_selected_topic_ids;
  const originalSource = typeof previous.source === "string" ? previous.source.trim() : "";
  if (originalSource) restored.source = [originalSource, request.trim() && `【用户本轮要求】\n${request.trim()}`].filter(Boolean).join("\n\n");
  return restored;
}

function stringifyStoredValue(value: unknown, maxLength: number) {
  return (typeof value === "string" ? value : JSON.stringify(value)).slice(0, maxLength);
}
