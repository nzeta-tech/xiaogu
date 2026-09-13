export type TrafficWorkflowObservation = { capabilityId: string; status: string };

export function needsTrafficTopicSelection(observations: TrafficWorkflowObservation[]) {
  return observations.some((item) => item.status === "success" && item.capabilityId.startsWith("app.") && item.capabilityId.endsWith(":topics"));
}
