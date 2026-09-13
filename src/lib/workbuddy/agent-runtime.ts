import type { WorkbuddyAgentAction } from "./planner";
import { DEFAULT_EXECUTION_BUDGET, initialBudgetState, inspectExecutionBudget, recordBudgetProgress, type ExecutionBudget, type ExecutionBudgetState } from "./execution-budget.ts";
import type { ObservationEnvelope } from "./interaction-protocol.ts";

export type AgentObservation = { capabilityId: string; status: "success" | "error" | "blocked"; summary: string; protocol?: ObservationEnvelope };
export type AgentRuntimeState = { iteration: number; observations: AgentObservation[]; budgetState: ExecutionBudgetState };
export type AgentRuntimeResult = { status: "completed" | "waiting_user" | "failed" | "exhausted"; iterations: number; observations: AgentObservation[]; errorSummary?: string };

export async function runAgentRuntime(input: {
  maxIterations: number;
  budget?: Partial<ExecutionBudget>;
  initialObservations?: AgentObservation[];
  initialBudgetState?: ExecutionBudgetState;
  signal?: AbortSignal;
  decide: (state: AgentRuntimeState) => Promise<WorkbuddyAgentAction>;
  control: (action: WorkbuddyAgentAction, state: AgentRuntimeState) => Promise<{ outcome: "allow" } | { outcome: "ask_user"; question: string; reason: string } | { outcome: "reject"; reason: string }>;
  invoke: (action: Extract<WorkbuddyAgentAction, { type: "tool_call" }>, state: AgentRuntimeState) => Promise<AgentObservation>;
  deliver: (action: Extract<WorkbuddyAgentAction, { type: "final" }>, state: AgentRuntimeState) => Promise<void>;
  validateDelivery?: (action: Extract<WorkbuddyAgentAction, { type: "final" }>, state: AgentRuntimeState) => Promise<{ outcome: "allow" } | { outcome: "continue"; reason: string }>;
  askUser: (question: string, reason: string, state: AgentRuntimeState) => Promise<void>;
  trace?: (event: { type: string; iteration: number; action?: WorkbuddyAgentAction; detail?: Record<string, unknown> }) => Promise<void> | void;
  checkpoint?: (state: AgentRuntimeState, phase: "deciding" | "invoking" | "evaluating" | "waiting_user" | "completed" | "exhausted") => Promise<void> | void;
}) {
  const runtimeStartedAt = Date.now();
  const observations: AgentObservation[] = [...(input.initialObservations ?? [])];
  const budget = { ...DEFAULT_EXECUTION_BUDGET, ...input.budget, maxIterations: input.maxIterations };
  let budgetState = input.initialBudgetState ?? initialBudgetState();
  for (const observation of observations) budgetState = recordBudgetProgress(budgetState, observation);
  let finalizationGraceUsed = false;
  // The extra loop position is reserved for finalization grace. It never
  // permits another tool call and therefore does not expand the action budget.
  for (let iteration = 1; iteration <= budget.maxIterations + 1; iteration += 1) {
    assertRunning(input.signal);
    const budgetInspection = inspectExecutionBudget(budget, budgetState, iteration);
    const successfulObservation = [...observations].reverse().find(item => item.status === "success");
    // A slow tool may return a perfectly usable result after the wall-clock
    // budget. Limits stop additional work; they must not discard an output
    // that is already available. Grant one no-more-tools finalization cycle.
    const finalizationGrace = !budgetInspection.canContinue && Boolean(successfulObservation) && !finalizationGraceUsed;
    if (!budgetInspection.canContinue && !finalizationGrace) {
      await input.trace?.({ type: "cycle.budget_exhausted", iteration, detail: budgetInspection });
      await input.checkpoint?.({ iteration, observations: [...observations], budgetState }, "exhausted");
      return { status: "exhausted", iterations: Math.max(0, iteration - 1), observations, errorSummary: budgetInspection.reason } satisfies AgentRuntimeResult;
    }
    if (finalizationGrace) {
      finalizationGraceUsed = true;
      await input.trace?.({ type: "cycle.finalization_grace", iteration, detail: { reason: budgetInspection.reason } });
    }
    const state = { iteration, observations: [...observations], budgetState };
    await input.trace?.({ type: "cycle.started", iteration });
    await input.checkpoint?.(state, "deciding");
    const decisionStartedAt = Date.now();
    let action = await input.decide(state);
    await input.trace?.({ type: "phase.completed", iteration, detail: { phase: "decide", durationMs: Date.now() - decisionStartedAt } });
    if (finalizationGrace && action.type === "tool_call") {
      action = {
        type: "final",
        content: successfulObservation?.summary || "已有成功结果，请直接交付。",
        reason: "执行预算已到，但工具已成功返回；停止新增调用并交付现有成果",
      };
    }
    await input.trace?.({ type: "action.proposed", iteration, action });
    if (action.type === "tool_call") {
      const priorFailure = [...observations].reverse().find(item => item.capabilityId === action.capabilityId && item.status === "error");
      const retryableIncomplete = priorFailure && /交付不完整|缺失(?:成果|图片)|实际只生成/.test(priorFailure.summary);
      const sameFailureCount = observations.filter(item => item.capabilityId === action.capabilityId && item.status === "error").length;
      if (priorFailure && (!retryableIncomplete || sameFailureCount >= 2)) {
        await input.trace?.({ type: "cycle.stopped", iteration, action, detail: { reason: "repeated_failed_capability", priorFailure } });
        return { status: "failed", iterations: iteration, observations, errorSummary: priorFailure.summary } satisfies AgentRuntimeResult;
      }
    }
    const controlStartedAt = Date.now();
    const control = await input.control(action, state);
    await input.trace?.({ type: "phase.completed", iteration, action, detail: { phase: "control", durationMs: Date.now() - controlStartedAt } });
    await input.trace?.({ type: "action.controlled", iteration, action, detail: control });
    if (control.outcome === "ask_user") {
      await input.askUser(control.question, control.reason, state);
      await input.checkpoint?.(state, "waiting_user");
      return { status: "waiting_user", iterations: iteration, observations } satisfies AgentRuntimeResult;
    }
    if (control.outcome === "reject") {
      observations.push({ capabilityId: action.type === "tool_call" ? action.capabilityId : "agent", status: "blocked", summary: control.reason });
      continue;
    }
    if (action.type === "ask_user") {
      await input.askUser(action.question, action.reason, state);
      await input.checkpoint?.(state, "waiting_user");
      return { status: "waiting_user", iterations: iteration, observations } satisfies AgentRuntimeResult;
    }
    if (action.type === "final") {
      await input.checkpoint?.(state, "evaluating");
      const validationStartedAt = Date.now();
      const validation = await input.validateDelivery?.(action, state) ?? { outcome: "allow" as const };
      await input.trace?.({ type: "phase.completed", iteration, action, detail: { phase: "validate", durationMs: Date.now() - validationStartedAt } });
      await input.trace?.({ type: "delivery.validated", iteration, action, detail: validation });
      if (validation.outcome === "continue") {
        const repeatedStopGateBlock = observations.some(item => item.capabilityId === "agent.stop-gate" && item.status === "blocked" && item.summary === validation.reason);
        if (repeatedStopGateBlock) {
          const hasSuccessfulOutput = observations.some(item => item.status === "success" && item.protocol?.outputs.some(output => output.artifactId || output.contentRef || output.downloadUrl));
          if (hasSuccessfulOutput) {
            await input.trace?.({ type: "delivery.partial", iteration, action, detail: { reason: validation.reason } });
            await input.deliver(action, state);
            await input.checkpoint?.(state, "completed");
            return { status: "completed", iterations: iteration, observations, errorSummary: `部分成果已交付：${validation.reason}` } satisfies AgentRuntimeResult;
          }
          await input.trace?.({ type: "cycle.stopped", iteration, action, detail: { reason: "repeated_stop_gate_deficit", validation } });
          return { status: "failed", iterations: iteration, observations, errorSummary: `交付检查连续发现相同缺失项，已停止重复执行：${validation.reason}` } satisfies AgentRuntimeResult;
        }
        observations.push({ capabilityId: "agent.stop-gate", status: "blocked", summary: validation.reason });
        continue;
      }
      const deliveryStartedAt = Date.now();
      await input.deliver(action, state);
      await input.trace?.({ type: "phase.completed", iteration, action, detail: { phase: "deliver", durationMs: Date.now() - deliveryStartedAt } });
      await input.checkpoint?.(state, "completed");
      await input.trace?.({ type: "run.completed", iteration, detail: { durationMs: Date.now() - runtimeStartedAt, toolCalls: observations.length } });
      return { status: "completed", iterations: iteration, observations } satisfies AgentRuntimeResult;
    }
    await input.checkpoint?.(state, "invoking");
    const invocationStartedAt = Date.now();
    const observation = await input.invoke(action, state);
    await input.trace?.({ type: "phase.completed", iteration, action, detail: { phase: "invoke", durationMs: Date.now() - invocationStartedAt, capabilityId: action.capabilityId, outcome: observation.status } });
    observations.push(observation);
    budgetState = recordBudgetProgress(budgetState, observation);
    await input.trace?.({ type: "observation.recorded", iteration, action, detail: observation });
  }
  const state = { iteration: budget.maxIterations, observations: [...observations], budgetState };
  await input.checkpoint?.(state, "exhausted");
  return { status: "exhausted", iterations: budget.maxIterations, observations } satisfies AgentRuntimeResult;
}

function assertRunning(signal?: AbortSignal) {
  if (signal?.aborted) throw new Error("任务已停止");
}
