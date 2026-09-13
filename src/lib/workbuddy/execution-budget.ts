import { createHash } from "node:crypto";

export type ExecutionBudget = {
  maxIterations: number;
  maxDurationMs: number;
  finalizationReserveMs: number;
  maxObservationChars: number;
  diminishingReturnWindow: number;
  minimumProgressDelta: number;
};

export type ExecutionBudgetState = {
  startedAt: number;
  progressHistory: number[];
  observationChars: number;
  fingerprints: string[];
};

export const DEFAULT_EXECUTION_BUDGET: ExecutionBudget = {
  maxIterations: 9,
  // Creation and deep-research tools are intentionally allowed more time than
  // the previous three-minute wall. The reserve prevents a slow tool from
  // consuming the time needed to turn successful observations into a delivery.
  maxDurationMs: 420_000,
  finalizationReserveMs: 30_000,
  maxObservationChars: 80_000,
  diminishingReturnWindow: 3,
  minimumProgressDelta: 1,
};

export const WORKBUDDY_TOOL_TIMEOUT_MS = {
  "agent.fast-research": 90_000,
  "tool.hot-topic-discovery": 90_000,
  "agent.deep-research": 240_000,
  application: 300_000,
  default: 180_000,
} as const;

export function toolTimeoutForCapability(capabilityId: string) {
  if (capabilityId in WORKBUDDY_TOOL_TIMEOUT_MS) {
    return WORKBUDDY_TOOL_TIMEOUT_MS[capabilityId as keyof typeof WORKBUDDY_TOOL_TIMEOUT_MS];
  }
  return capabilityId.startsWith("app.") || capabilityId.startsWith("skill.")
    ? WORKBUDDY_TOOL_TIMEOUT_MS.application
    : WORKBUDDY_TOOL_TIMEOUT_MS.default;
}

export function availableToolTimeMs(budget: ExecutionBudget, state: ExecutionBudgetState, requestedMs: number, now = Date.now()) {
  const remaining = budget.maxDurationMs - (now - state.startedAt) - budget.finalizationReserveMs;
  return Math.max(0, Math.min(requestedMs, remaining));
}

export function initialBudgetState(now = Date.now()): ExecutionBudgetState {
  return { startedAt: now, progressHistory: [], observationChars: 0, fingerprints: [] };
}

export function recordBudgetProgress(state: ExecutionBudgetState, observation: { status: string; summary: string }) {
  const fingerprint = createHash("sha1").update(observation.summary.trim()).digest("hex");
  const novel = !state.fingerprints.includes(fingerprint);
  const delta = observation.status === "success" && novel ? 2 : observation.status === "blocked" && novel ? 1 : 0;
  return {
    ...state,
    progressHistory: [...state.progressHistory, delta],
    observationChars: state.observationChars + observation.summary.length,
    fingerprints: novel ? [...state.fingerprints, fingerprint] : state.fingerprints,
  };
}

export function inspectExecutionBudget(budget: ExecutionBudget, state: ExecutionBudgetState, iteration: number, now = Date.now()) {
  if (iteration > budget.maxIterations) return { canContinue: false, reason: "iteration_limit" as const };
  if (now - state.startedAt >= budget.maxDurationMs) return { canContinue: false, reason: "duration_limit" as const };
  if (state.observationChars >= budget.maxObservationChars) return { canContinue: false, reason: "observation_limit" as const };
  const recent = state.progressHistory.slice(-budget.diminishingReturnWindow);
  if (recent.length === budget.diminishingReturnWindow && recent.every(value => value < budget.minimumProgressDelta)) {
    return { canContinue: false, reason: "diminishing_returns" as const };
  }
  return { canContinue: true, reason: "within_budget" as const };
}

export function executionExhaustionMessage(reason?: string) {
  if (reason === "duration_limit") return "本轮执行已超过时间预算，且尚未取得可交付结果，请重试";
  if (reason === "observation_limit") return "本轮工具结果超过上下文容量，且尚未完成交付，请缩小范围后重试";
  if (reason === "diminishing_returns") return "本轮连续执行没有取得新的有效进展，已停止重复尝试";
  return "小谷达到本轮最大行动次数，仍未形成可交付结果";
}
