export type CreationWorkflowPhase = "collecting-inputs" | "researching" | "awaiting-selection" | "generating" | "completed";
export type CreationWorkflowStage = { workflow: string; phase: CreationWorkflowPhase };

export function isAwaitingWorkflowSelection(value: unknown) {
  if (!value || typeof value !== "object") return false;
  return (value as Partial<CreationWorkflowStage>).phase === "awaiting-selection";
}
