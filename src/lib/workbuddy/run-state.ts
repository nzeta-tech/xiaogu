import type { DeliverableContract } from "./deliverable-contract.ts";
import type { ExecutionBudget, ExecutionBudgetState } from "./execution-budget.ts";
import type { ObservationEnvelope, TurnEnvelope } from "./interaction-protocol.ts";

export type WorkbuddyRunPhase = "intaking" | "routing" | "planning" | "executing" | "evaluating" | "repairing" | "waiting_user" | "completed" | "failed" | "interrupted";

export type WorkbuddyRunState = {
  protocolVersion: "1";
  runId: string;
  taskId: string;
  phase: WorkbuddyRunPhase;
  iteration: number;
  turn: TurnEnvelope;
  deliverableContract: DeliverableContract | null;
  outputSlots: string[];
  observations: ObservationEnvelope[];
  completedArtifactIds: string[];
  budget: ExecutionBudget;
  budgetState: ExecutionBudgetState;
  promptFingerprint?: string;
  stablePromptFingerprint?: string;
  updatedAt: string;
};

export function reduceRunState(state: WorkbuddyRunState, event:
  | { type: "phase"; phase: WorkbuddyRunPhase }
  | { type: "observation"; observation: ObservationEnvelope }
  | { type: "prompt"; fingerprint: string; stableFingerprint: string }
  | { type: "iteration"; iteration: number }): WorkbuddyRunState {
  const updatedAt = new Date().toISOString();
  if (event.type === "phase") return { ...state, phase: event.phase, updatedAt };
  if (event.type === "iteration") return { ...state, iteration: event.iteration, updatedAt };
  if (event.type === "prompt") return { ...state, promptFingerprint: event.fingerprint, stablePromptFingerprint: event.stableFingerprint, updatedAt };
  const observations = [...state.observations.filter(item => item.observationId !== event.observation.observationId), event.observation];
  const completedArtifactIds = [...new Set([...state.completedArtifactIds, ...event.observation.outputs.flatMap(item => item.artifactId ? [item.artifactId] : [])])];
  return { ...state, observations, completedArtifactIds, updatedAt };
}
