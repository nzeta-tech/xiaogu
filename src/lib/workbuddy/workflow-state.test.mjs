import assert from "node:assert/strict";
import test from "node:test";
import { buildWorkflowRetrySource, classifyWorkflowTurn } from "./workflow-state.ts";

const workflow = { appSlug: "traffic-copy", phase: "awaiting-selection", source: "两起催捐热点及核验来源", candidateTitles: ["旧选题一", "旧选题二"], updatedAt: "2026-09-11T00:00:00.000Z" };

test("short follow-ups are resolved against the active workflow", () => {
  assert.equal(classifyWorkflowTurn("换一批", workflow), "retry");
  assert.equal(classifyWorkflowTurn("第2个", workflow), "select");
  assert.equal(classifyWorkflowTurn("换个话题", workflow), "exit");
  assert.equal(classifyWorkflowTurn("今天天气怎么样", workflow), "unrelated");
});

test("retry source preserves original material and excludes prior candidates", () => {
  const source = buildWorkflowRetrySource(workflow);
  assert.match(source, /两起催捐热点/);
  assert.match(source, /旧选题一/);
  assert.match(source, /不得重复/);
});
