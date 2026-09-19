import assert from "node:assert/strict";
import test from "node:test";
import { matchNamedCapability, normalizeConversationEvidence, normalizeResearchDepth, normalizeSemanticRouteCandidate, reconcileSemanticRoute } from "./semantic-route.ts";

const capability = (id, format) => ({
  id,
  kind: "app",
  name: id,
  description: id,
  riskLevel: "generate",
  executionMode: "sync",
  outputTypes: ["text"],
  outputFormats: [format],
  inputKinds: ["text"],
  autoInvoke: true,
  operations: ["create", "transform"],
  buildInput: () => ({}),
});

test("deliverable contract promotes an incorrect direct route to the matching capability", () => {
  const route = reconcileSemanticRoute({
    mode: "direct",
    intent: "把已有内容转换成平台笔记",
    targetCapabilityId: null,
    requiresFreshInformation: false,
    rationale: "模型理解了转换目标但遗漏能力",
    operation: "transform",
    preserve: ["topic", "material"],
    deliverable: { required: true, kind: "text", format: "platform-note", count: 1, sourceRelation: "previous-artifact" },
  }, [capability("app.platform-note", "platform-note")]);
  assert.equal(route?.mode, "capability");
  assert.equal(route?.targetCapabilityId, "app.platform-note");
  assert.equal(route?.operation, "transform");
});

test("ambiguous format ownership is rejected for semantic self-repair", () => {
  const route = reconcileSemanticRoute({
    mode: "direct",
    intent: "生成专业产物",
    targetCapabilityId: null,
    requiresFreshInformation: false,
    rationale: "目标能力未确定",
    deliverable: { required: true, kind: "text", format: "shared-format", count: 1, sourceRelation: "conversation" },
  }, [capability("app.one", "shared-format"), capability("app.two", "shared-format")]);
  assert.equal(route, null);
});

test("an explicitly named registered app is resolved without product-specific aliases", () => {
  const presentation = { ...capability("app.presentation", "slides"), name: "演示文稿创作" };
  const community = { ...capability("app.community", "community-note"), name: "星愿社区笔记创作" };
  assert.equal(matchNamedCapability("用这个素材帮我写一篇星愿社区笔记", [presentation, community])?.id, "app.community");
  assert.equal(matchNamedCapability("帮我继续处理一下", [presentation, community]), null);
});

test("named application creation survives a semantic-router failure", () => {
  const xiaohongshu = { ...capability("app.xiaohongshu-studio", "xiaohongshu-note"), name: "小红书笔记创作" };
  const multiPlatform = { ...capability("app.write-copy", "multi-platform-copy"), name: "多平台文案创作" };
  assert.equal(matchNamedCapability("用第四个帮我写一篇小红书", [xiaohongshu, multiPlatform])?.id, "app.xiaohongshu-studio");
});


test("semantic reconciliation preserves ordered research prerequisites for a final app", () => {
  const imageCard = { ...capability("app.image-card", "knowledge-card"), outputTypes: ["image"] };
  const route = reconcileSemanticRoute({
    mode: "capability",
    operation: "create",
    intent: "了解 HYROX 最近发生的事情并制作知识卡片",
    targetCapabilityId: "app.image-card",
    requiresFreshInformation: true,
    evidenceRequirement: "current",
    prerequisites: [{ capabilityId: "agent.fast-research", intent: "调查 HYROX 最近发生的事情", rationale: "卡片必须基于当前外部信息" }],
    deliverable: { required: true, kind: "image", format: "knowledge-card", count: 1, sourceRelation: "new" },
    rationale: "先研究再生成",
  }, [imageCard]);
  assert.equal(route?.targetCapabilityId, "app.image-card");
  assert.equal(route?.prerequisites?.[0]?.capabilityId, "agent.fast-research");
});

test("pure research does not need a creation app to own its data deliverable", () => {
  const route = reconcileSemanticRoute({
    mode: "fast-research",
    operation: "research",
    intent: "搜索 HYROX 近期动态",
    targetCapabilityId: null,
    requiresFreshInformation: true,
    evidenceRequirement: "current",
    deliverable: { required: true, kind: "data", format: null, count: 1, sourceRelation: "conversation" },
    rationale: "依赖当前外部信息",
  }, []);
  assert.equal(route?.mode, "fast-research");
});

test("planner research vocabulary is normalized without discarding its intent", () => {
  const normalized = normalizeSemanticRouteCandidate({
    mode: "fast-research",
    requiresFreshInformation: true,
    deliverable: { required: true, kind: "research", format: null, count: 1, sourceRelation: "conversation" },
  });
  assert.equal(normalized.deliverable.kind, "data");
  assert.equal(normalized.requiresFreshInformation, true);
});

test("sequential event and person lookup starts with fast research", () => {
  const route = normalizeResearchDepth({
    mode: "deep-research",
    operation: "research",
    intent: "先搜索近期事件，再搜索事件主人公的介绍",
    targetCapabilityId: null,
    requiresFreshInformation: true,
    evidenceRequirement: "current",
    researchProfile: { explicitDeepResearch: false, highStakes: false, requiresConflictResolution: false, broadSynthesis: false },
    deliverable: { required: true, kind: "data", format: null, count: 1, sourceRelation: "conversation" },
    rationale: "存在连续检索依赖",
  });
  assert.equal(route.mode, "fast-research");
  assert.equal(route.targetCapabilityId, "agent.fast-research");
});

test("structured deep-research reasons preserve deep research", () => {
  const route = normalizeResearchDepth({
    mode: "deep-research",
    operation: "research",
    intent: "消解相互冲突的监管资料",
    targetCapabilityId: null,
    requiresFreshInformation: true,
    researchProfile: { explicitDeepResearch: false, highStakes: true, requiresConflictResolution: true, broadSynthesis: false },
    rationale: "结论高风险且证据冲突",
  });
  assert.equal(route.mode, "deep-research");
  assert.equal(route.targetCapabilityId, "agent.deep-research");
});

const discussionRoute = {
  mode: "chat", operation: "chat",
  intent: "聊聊这个热点：陈建州病房众人齐聚拍照 医院回应",
  targetCapabilityId: null, requiresFreshInformation: false,
  evidenceRequirement: "current", rationale: "基于热榜摘要讨论",
  deliverable: { required: false, kind: null, format: null, count: 1, sourceRelation: "conversation" },
};

test("hot topic discussion verifies current facts even when freshness flag is false", () => {
  const route = normalizeConversationEvidence(discussionRoute);
  assert.equal(route.mode, "fast-research");
  assert.equal(route.operation, "verify");
  assert.equal(route.targetCapabilityId, "agent.fast-research");
  assert.equal(route.requiresFreshInformation, true);
  assert.equal(route.deliverable.required, false);
  assert.equal(route.intent, discussionRoute.intent);
});

test("freshness alone triggers research for chat and direct answers", () => {
  for (const mode of ["chat", "direct"]) {
    const route = normalizeConversationEvidence({ ...discussionRoute, mode, evidenceRequirement: "none", requiresFreshInformation: true });
    assert.equal(route.mode, "fast-research");
    assert.equal(route.evidenceRequirement, "current");
  }
});

test("ordinary chat and existing capability plans remain intact", () => {
  for (const route of [
    { ...discussionRoute, intent: "你好", evidenceRequirement: "none" },
    { ...discussionRoute, mode: "direct", evidenceRequirement: "none" },
    { ...discussionRoute, mode: "capability", targetCapabilityId: "app.traffic-copy" },
    { ...discussionRoute, mode: "deep-research" },
  ]) assert.deepEqual(normalizeConversationEvidence(route), route);
});
