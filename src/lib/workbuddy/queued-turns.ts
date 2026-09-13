export type QueuedWorkbuddyTurn = {
  id: string;
  content: string;
  supplementalContext: string;
  requestedCapabilityId?: string;
  mode: "after-current-step" | "next-turn";
  createdAt: string;
};

export function createQueuedWorkbuddyTurn(input: {
  id: string;
  content: string;
  supplementalContext?: string;
  requestedCapabilityId?: string;
  createdAt: string;
}): QueuedWorkbuddyTurn {
  const requestedCapabilityId = input.requestedCapabilityId?.trim() || undefined;
  return { id: input.id, content: input.content, supplementalContext: input.supplementalContext ?? "", requestedCapabilityId, mode: requestedCapabilityId ? "next-turn" : "after-current-step", createdAt: input.createdAt };
}

export function partitionQueuedWorkbuddyTurns(items: QueuedWorkbuddyTurn[], kind: "steering" | "next-turn") {
  const matches = (item: QueuedWorkbuddyTurn) => kind === "next-turn" ? Boolean(item.requestedCapabilityId) : !item.requestedCapabilityId;
  return { selected: items.filter(matches).map(item => ({ ...item, supplementalContext: item.supplementalContext ?? "" })), remaining: items.filter(item => !matches(item)) };
}
