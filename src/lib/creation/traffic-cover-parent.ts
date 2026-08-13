export type TrafficCoverParent = {
  platform?: string | null;
  app_run?: { input_payload?: Record<string, unknown> | null } | null;
  content_json?: Record<string, unknown> | null;
};

export function isTrafficCoverParentWork(parent: TrafficCoverParent | null | undefined) {
  if (!parent) return false;
  if (parent.platform === "traffic-copy") return true;
  const target = parent.app_run?.input_payload?.remix_target ?? parent.content_json?.remixTarget;
  return parent.platform === "link-remix" && target === "traffic-copy";
}
