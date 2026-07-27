export const localAgentTaskTypes = [
  "source.inspect",
  "creator.discover",
  "creator.refresh",
  "work.discover",
  "work.enrich",
  "metrics.snapshot",
] as const;

export const LOCAL_AGENT_PROTOCOL_VERSION = 1;

export type LocalAgentTaskType = (typeof localAgentTaskTypes)[number];
export type LocalAgentTaskStatus = "pending" | "leased" | "succeeded" | "failed" | "cancelled";
export type LocalAgentNodeStatus = "ready" | "busy" | "degraded" | "offline";

export type LocalAgentHeartbeat = {
  agentId: string;
  status: LocalAgentNodeStatus;
  version: string;
  protocolVersion: number;
  capabilities: Record<string, boolean>;
  health: Record<string, "healthy" | "unhealthy" | "disabled">;
  activeTaskCount: number;
};

export type LinkRemixAvailability = {
  available: boolean;
  reason: string;
  lastSeenAt: string | null;
  enabled: boolean;
  protocolVersion: number;
};

export type SourceInspectResult = {
  status: string;
  finalUrl?: string;
  thumbnailUrl?: string;
  mediaUrl?: string;
  mediaDecryptKey?: string;
  fields: Record<string, string>;
  note?: string;
};

export type LocalAgentTask = {
  id: string;
  taskType: LocalAgentTaskType;
  status: LocalAgentTaskStatus;
  priority: number;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  errorMessage: string | null;
  attemptCount: number;
  maxAttempts: number;
  createdAt: string;
  updatedAt: string;
};

export type LocalAgentTaskEventType = "reset" | "status" | "delta";
export type LocalAgentTaskEvent = {
  id: number;
  taskId: string;
  attemptCount: number;
  eventType: LocalAgentTaskEventType;
  payload: Record<string, unknown>;
  createdAt: string;
};

export function isLocalAgentTaskType(value: string): value is LocalAgentTaskType {
  return localAgentTaskTypes.includes(value as LocalAgentTaskType);
}

export function isSourceInspectResult(value: unknown): value is SourceInspectResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Record<string, unknown>;
  if (typeof result.status !== "string" || !result.fields || typeof result.fields !== "object" || Array.isArray(result.fields)) return false;
  return Object.values(result.fields as Record<string, unknown>).every((field) => typeof field === "string");
}
