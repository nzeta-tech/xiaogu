import type { WorkbuddyCapability, WorkbuddyOperation } from "./capabilities.ts";

export type SemanticDeliverableContract = {
  required: boolean;
  kind: "text" | "image" | "presentation" | "video" | "data" | null;
  format: string | null;
  count: number;
  sourceRelation: "new" | "previous-artifact" | "referenced-artifact" | "conversation";
};

export type SemanticRoute = {
  mode: "chat" | "direct" | "fast-research" | "deep-research" | "capability";
  intent: string;
  targetCapabilityId: string | null;
  requiresFreshInformation: boolean;
  rationale: string;
  operation?: WorkbuddyOperation;
  preserve?: Array<"topic" | "material" | "research" | "coach" | "format" | "platform" | "length">;
  evidenceRequirement?: "none" | "current" | "verification";
  researchProfile?: {
    explicitDeepResearch: boolean;
    highStakes: boolean;
    requiresConflictResolution: boolean;
    broadSynthesis: boolean;
  };
  prerequisites?: Array<{
    capabilityId: "agent.fast-research" | "agent.deep-research" | "tool.hot-topic-discovery";
    intent: string;
    rationale: string;
  }>;
  deliverable?: SemanticDeliverableContract;
};

/**
 * Pick the cheapest research capability that can plausibly finish the task.
 * Sequential lookups are not by themselves deep research: Fast Research can
 * discover an entity and issue follow-up queries. Deep Research is reserved
 * for explicit depth, high-stakes conclusions, conflicting evidence, or broad
 * synthesis across several independent domains.
 */
export function normalizeResearchDepth(route: SemanticRoute): SemanticRoute {
  const profile = route.researchProfile;
  const deepRequired = Boolean(profile && (
    profile.explicitDeepResearch
    || profile.highStakes
    || profile.requiresConflictResolution
    || profile.broadSynthesis
  ));
  const prerequisites = route.prerequisites?.map(item => item.capabilityId === "agent.deep-research" && !deepRequired
    ? { ...item, capabilityId: "agent.fast-research" as const, rationale: `${item.rationale}；先用低成本研究，证据不足时再升级` }
    : item);
  if (route.mode !== "deep-research") return { ...route, prerequisites };
  if (deepRequired) return { ...route, targetCapabilityId: "agent.deep-research", prerequisites };
  return {
    ...route,
    mode: "fast-research",
    targetCapabilityId: "agent.fast-research",
    prerequisites,
    rationale: `${route.rationale}；任务虽有连续检索依赖，但尚无直接深研条件，先执行 Fast Research`.slice(0, 300),
  };
}

/**
 * Keep a planner's valid semantic decision when only its transport vocabulary
 * differs from the runtime contract. Research is an action; its materialized
 * output belongs in the generic data deliverable kind.
 */
export function normalizeSemanticRouteCandidate(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const deliverable = isRecord(value.deliverable) ? value.deliverable : null;
  if (deliverable?.kind !== "research") return value;
  return { ...value, deliverable: { ...deliverable, kind: "data" } };
}

export function reconcileSemanticRoute(route: SemanticRoute, capabilities: WorkbuddyCapability[]) {
  const contract = route.deliverable;
  if (!contract?.required) return route;
  // A research route is itself executable and does not need a creation app to
  // "own" its data format. Requiring an app target here used to reject correct
  // fast/deep-research decisions before the agent loop could call a tool.
  if (route.mode === "fast-research" || route.mode === "deep-research") return route;
  const formatMatches = contract.format
    ? capabilities.filter(capability => capability.outputFormats?.includes(contract.format!))
    : [];
  const current = route.targetCapabilityId ? capabilities.find(capability => capability.id === route.targetCapabilityId) : null;
  const currentMatches = Boolean(current && (!contract.format || current.outputFormats?.includes(contract.format)));
  const matched = currentMatches ? current : formatMatches.length === 1 ? formatMatches[0] : null;
  if (!matched) return null;
  const operations = matched.operations ?? inferCapabilityOperations(matched.kind);
  const operation = route.operation ?? "create";
  const compatibleOperation = operations.includes(operation)
    ? operation
    : operations.includes("transform") && contract.sourceRelation !== "new"
      ? "transform"
      : operations.includes("create") ? "create" : null;
  if (!compatibleOperation) return null;
  return {
    ...route,
    mode: "capability" as const,
    targetCapabilityId: matched.id,
    operation: compatibleOperation,
    rationale: currentMatches ? route.rationale : `${route.rationale}；产物契约已匹配 ${matched.name}`,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Resolve an explicitly named app from the registry without product aliases. */
export function matchNamedCapability(request: string, capabilities: WorkbuddyCapability[]) {
  const source = normalizeName(request);
  const ranked = capabilities
    .filter(capability => capability.kind === "app")
    .map(capability => ({ capability, overlap: longestCommonSubstring(source, normalizeName(capability.name)) }))
    .filter(item => item.overlap >= 3)
    .sort((left, right) => right.overlap - left.overlap);
  if (!ranked[0] || ranked[1]?.overlap === ranked[0].overlap) return null;
  return ranked[0].capability;
}

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

function longestCommonSubstring(left: string, right: string) {
  let longest = 0;
  const row = new Array(right.length + 1).fill(0);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    for (let rightIndex = right.length; rightIndex >= 1; rightIndex -= 1) {
      row[rightIndex] = left[leftIndex - 1] === right[rightIndex - 1] ? row[rightIndex - 1] + 1 : 0;
      longest = Math.max(longest, row[rightIndex]);
    }
  }
  return longest;
}

function inferCapabilityOperations(kind: string): WorkbuddyOperation[] {
  return kind === "agent" || kind === "connector" || kind === "mcp" ? ["research", "verify"] : ["create", "regenerate", "revise", "transform"];
}
