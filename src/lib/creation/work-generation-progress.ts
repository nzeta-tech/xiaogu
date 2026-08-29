export type GenerationProgressEvent = {
  phase: string;
  status: "active" | "completed";
  label: string;
  detail: string;
  coachId?: string | null;
  coachLabel?: string | null;
};

export const TRAFFIC_COPY_INITIAL_PROGRESS: GenerationProgressEvent = {
  phase: "task_started",
  status: "active",
  label: "任务已启动",
  detail: "正在读取素材并准备教练创作流程。",
};

export function readGenerationProgress(resultJson?: Record<string, unknown> | null): GenerationProgressEvent[] {
  const value = resultJson?.generationProgress;
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const event = item as Partial<GenerationProgressEvent>;
    if (
      typeof event.phase !== "string"
      || (event.status !== "active" && event.status !== "completed")
      || typeof event.label !== "string"
    ) return [];
    return [{
      phase: event.phase,
      status: event.status,
      label: event.label,
      detail: typeof event.detail === "string" ? event.detail : "",
      coachId: typeof event.coachId === "string" ? event.coachId : null,
      coachLabel: typeof event.coachLabel === "string" ? event.coachLabel : null,
    }];
  });
}

export function mergeGenerationProgress(
  persisted: GenerationProgressEvent[],
  live: GenerationProgressEvent[],
) {
  const merged = [...persisted];
  for (const event of live) {
    const index = merged.findIndex((item) => item.phase === event.phase);
    if (index >= 0) merged[index] = event;
    else merged.push(event);
  }
  return merged;
}

export function resolveGenerationProgress(input: {
  platform: string;
  status: string;
  persisted: GenerationProgressEvent[];
  live: GenerationProgressEvent[];
}) {
  const recovered = mergeGenerationProgress(input.persisted, input.live);
  if (recovered.length > 0) return recovered;
  if (input.platform === "traffic-copy" && input.status === "running") {
    return [{ ...TRAFFIC_COPY_INITIAL_PROGRESS }];
  }
  return [];
}

export function shouldPollWorkGeneration(input: {
  status: string;
  platform: string;
  supportsStreaming: boolean;
  streamConnected: boolean;
  streamError: string;
  lastProgressAt: number;
  now: number;
  staleAfterMs?: number;
}) {
  if (input.status !== "running") return false;
  if (!input.supportsStreaming) return true;
  if (!input.streamConnected || Boolean(input.streamError)) return true;
  if (input.platform !== "traffic-copy") return false;
  const staleAfterMs = input.staleAfterMs ?? 12_000;
  return input.lastProgressAt > 0 && input.now - input.lastProgressAt >= staleAfterMs;
}
