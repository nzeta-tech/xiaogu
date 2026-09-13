import type { WorkbuddyCapability, WorkbuddyOperation } from "./capabilities.ts";

export function discloseCapabilities(input: {
  request: string;
  capabilities: WorkbuddyCapability[];
  operation?: WorkbuddyOperation;
  targetCapabilityId?: string | null;
  max?: number;
}) {
  const max = input.max ?? 8;
  const forced = input.targetCapabilityId ? input.capabilities.find(item => item.id === input.targetCapabilityId) : null;
  const coreIds = new Set(["agent.fast-research", "agent.deep-research", "tool.hot-topic-discovery"]);
  const scored = input.capabilities.map(capability => ({ capability, score: scoreCapability(capability, input.request, input.operation, coreIds) }))
    .filter(item => item.score > 0 || item.capability.id === forced?.id)
    .sort((a, b) => b.score - a.score || a.capability.name.localeCompare(b.capability.name, "zh-CN"));
  const selected = scored.slice(0, max).map(item => item.capability);
  if (forced && !selected.some(item => item.id === forced.id)) selected.unshift(forced);
  return selected.slice(0, max);
}

export function capabilityManifest(capabilities: WorkbuddyCapability[]) {
  return capabilities.map(item => ({
    id: item.id,
    name: item.name,
    description: item.description.slice(0, 180),
    operations: item.operations,
    outputs: item.outputTypes,
    formats: item.outputFormats,
    accepts: item.inputKinds,
    workflow: item.workflow ? {
      version: item.workflow.version,
      preservesWorkId: item.workflow.preservesWorkId,
      steps: item.workflow.steps.map(step => step.id),
      continuations: item.workflow.continuations.map(item => ({ id: item.id, kind: item.kind, targetStep: item.targetStep, targetCapabilityId: item.targetCapabilityId, presentation: item.presentation })),
    } : undefined,
    risk: item.riskLevel,
  }));
}

function scoreCapability(capability: WorkbuddyCapability, request: string, operation: WorkbuddyOperation | undefined, coreIds: Set<string>) {
  let score = coreIds.has(capability.id) ? 1 : 0;
  if (operation && capability.operations?.includes(operation)) score += 3;
  if (capability.id === "app.traffic-copy" && /(?:口播|流量文案|获客文案)/.test(request)) score += 20;
  if (capability.id === "app.topic-picker" && /(?:选题|选角度|找主题)/.test(request)) score += 16;
  if (capability.outputTypes.includes("image") && /(?:图片|知识图|卡片|海报|封面)/.test(request)) score += 20;
  if (capability.outputTypes.includes("presentation") && /(?:PPT|幻灯片|演示文稿)/i.test(request)) score += 20;
  if (capability.outputTypes.includes("video") && /(?:视频|剪辑|成片)/.test(request)) score += 16;
  if (capability.id === "tool.hot-topic-discovery" && /(?:热点|热搜|候选|话题)/.test(request)) score += 14;
  if (capability.id === "agent.fast-research" && /(?:查|核验|最新|今天|判刑|政策|价格)/.test(request)) score += 10;
  if (capability.id === "agent.deep-research" && /(?:深入|完整研究|报告|多方|全面)/.test(request)) score += 10;
  const terms = request.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(term => term.length >= 2);
  const haystack = `${capability.name} ${capability.description} ${(capability.outputFormats ?? []).join(" ")}`.toLowerCase();
  score += Math.min(6, terms.filter(term => haystack.includes(term)).length * 2);
  // Chinese requests often have no spaces, so whole-token matching misses an
  // explicitly named platform or capability. Character n-grams provide a
  // generic lexical-retrieval fallback without maintaining product keywords.
  score += Math.min(12, sharedNgramCount(request, haystack, 2));
  return score;
}

function sharedNgramCount(left: string, right: string, size: number) {
  const normalize = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  const source = normalize(left);
  const target = normalize(right);
  const grams = new Set<string>();
  for (let index = 0; index <= source.length - size; index += 1) grams.add(source.slice(index, index + size));
  let matches = 0;
  for (const gram of grams) if (target.includes(gram)) matches += 1;
  return matches;
}
