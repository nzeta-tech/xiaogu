import type { WorkbuddyAgentAction } from "./planner";

export type AgentObservation = { capabilityId: string; status: "success" | "error" | "blocked"; summary: string };
export type AgentRuntimeState = { iteration: number; observations: AgentObservation[] };
export type AgentRuntimeResult = { status: "completed" | "waiting_user" | "exhausted"; iterations: number; observations: AgentObservation[] };

export async function runAgentRuntime(input: {
  maxIterations: number;
  signal?: AbortSignal;
  decide: (state: AgentRuntimeState) => Promise<WorkbuddyAgentAction>;
  control: (action: WorkbuddyAgentAction, state: AgentRuntimeState) => Promise<{ outcome: "allow" } | { outcome: "ask_user"; question: string; reason: string } | { outcome: "reject"; reason: string }>;
  invoke: (action: Extract<WorkbuddyAgentAction, { type: "tool_call" }>, state: AgentRuntimeState) => Promise<AgentObservation>;
  deliver: (action: Extract<WorkbuddyAgentAction, { type: "final" }>, state: AgentRuntimeState) => Promise<void>;
  askUser: (question: string, reason: string, state: AgentRuntimeState) => Promise<void>;
  trace?: (event: { type: string; iteration: number; action?: WorkbuddyAgentAction; detail?: Record<string, unknown> }) => Promise<void> | void;
}) {
  const observations: AgentObservation[] = [];
  for (let iteration = 1; iteration <= input.maxIterations; iteration += 1) {
    assertRunning(input.signal);
    const state = { iteration, observations: [...observations] };
    await input.trace?.({ type: "cycle.started", iteration });
    const action = await input.decide(state);
    await input.trace?.({ type: "action.proposed", iteration, action });
    const control = await input.control(action, state);
    await input.trace?.({ type: "action.controlled", iteration, action, detail: control });
    if (control.outcome === "ask_user") {
      await input.askUser(control.question, control.reason, state);
      return { status: "waiting_user", iterations: iteration, observations } satisfies AgentRuntimeResult;
    }
    if (control.outcome === "reject") {
      observations.push({ capabilityId: action.type === "tool_call" ? action.capabilityId : "agent", status: "blocked", summary: control.reason });
      continue;
    }
    if (action.type === "ask_user") {
      await input.askUser(action.question, action.reason, state);
      return { status: "waiting_user", iterations: iteration, observations } satisfies AgentRuntimeResult;
    }
    if (action.type === "final") {
      await input.deliver(action, state);
      return { status: "completed", iterations: iteration, observations } satisfies AgentRuntimeResult;
    }
    const observation = await input.invoke(action, state);
    observations.push(observation);
    await input.trace?.({ type: "observation.recorded", iteration, action, detail: observation });
  }
  return { status: "exhausted", iterations: input.maxIterations, observations } satisfies AgentRuntimeResult;
}

function assertRunning(signal?: AbortSignal) {
  if (signal?.aborted) throw new Error("任务已停止");
}
