import assert from "node:assert/strict";
import test from "node:test";
import { deterministicSpokenCopyRoute } from "./content-route.ts";
import { classifyWorkflowTurn } from "./workflow-state.ts";

test("routes topic-led new writing to traffic copy", () => {
  assert.equal(deterministicSpokenCopyRoute("围绕梅艳芳信托这个角度，写一篇口播")?.capabilityId, "app.traffic-copy");
  assert.equal(deterministicSpokenCopyRoute("梅艳芳今天很火，帮我写一篇口播")?.requiresFreshInformation, true);
});

test("routes an existing draft with polish intent to script polish", () => {
  const context = "这是一篇已经写好的口播原稿。".repeat(8);
  assert.equal(deterministicSpokenCopyRoute("请帮我优化这篇口播稿", context)?.capabilityId, "app.video-script-polish");
});

test("traffic outcome overrides the fact that an existing draft was supplied", () => {
  const context = "这是一篇已经写好的口播原稿。".repeat(8);
  assert.equal(deterministicSpokenCopyRoute("把这篇稿重写成获客型口播", context)?.capabilityId, "app.traffic-copy");
});

test("a terse rewrite keeps the completed traffic-copy workflow", () => {
  const context = "上一版完整流量口播。".repeat(12);
  for (const text of ["重新写", "重新写一版", "再写一版", "换个版本", "从头写一下"]) {
    assert.equal(deterministicSpokenCopyRoute(text, context, "traffic-copy")?.capabilityId, "app.traffic-copy");
  }
});

test("does not execute a generic spoken-copy wish", () => {
  assert.equal(deterministicSpokenCopyRoute("我想写一篇口播稿"), null);
  assert.equal(deterministicSpokenCopyRoute("帮我优化口播稿"), null);
});

test("topic-stage retry phrases keep the traffic workflow instead of becoming direct chat", () => {
  const workflow = { appSlug: "traffic-copy", phase: "awaiting-selection", source: "催捐热点", updatedAt: new Date().toISOString() };
  for (const text of ["重新选题", "换一批", "这批都不合适，重新推荐", "还有别的选题"]) assert.equal(classifyWorkflowTurn(text, workflow), "retry");
  assert.equal(classifyWorkflowTurn("重新写一下正文", workflow), "unrelated");
  assert.equal(classifyWorkflowTurn("不做了，换个话题", workflow), "exit");
});
