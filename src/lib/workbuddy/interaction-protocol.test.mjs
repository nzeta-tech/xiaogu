import assert from "node:assert/strict";
import test from "node:test";
import { buildOutputSlots, createToolCallEnvelope, evaluateOutputSlots, inferTurnEnvelope } from "./interaction-protocol.ts";

test("referential transform becomes modify_current instead of discovery", () => {
  const turn = inferTurnEnvelope({ request: "用上面这个写一篇口播文案", runId: "run-1", sourceArtifactIds: ["artifact-1"], outputKind: "text", expectedCount: 1, hasActiveRun: true });
  assert.equal(turn.relation, "modify_current");
  assert.equal(turn.mode, "transform");
  assert.deepEqual(turn.target.ids, ["artifact-1"]);
});

test("ordinal transform is treated as a reference to the previous result", () => {
  const turn = inferTurnEnvelope({ request: "用第一个帮我写一篇口播文案", hasActiveRun: true });
  assert.equal(turn.relation, "modify_current");
  assert.equal(turn.mode, "transform");
  assert.deepEqual(turn.ambiguities, ["指代对象尚未解析为具体作品"]);
});

test("named platform writing is recognized as a deliverable transform", () => {
  for (const request of ["帮我写一篇小红书", "用第四个写一篇小红书笔记", "按这个写一篇公众号文章"]) {
    assert.equal(inferTurnEnvelope({ request, hasActiveRun: true }).mode, "transform");
  }
});

test("one-per-source output slots remain independently addressable", () => {
  assert.deepEqual(buildOutputSlots("image", 2, ["case-a", "case-b"]), ["image:source:case-a", "image:source:case-b"]);
});

test("tool envelopes have stable idempotency for the same attempt", () => {
  const input = { runId: "run", stepId: "step", attempt: 1, capabilityId: "app.image-card", input: { objective: "做图" }, sourceArtifactIds: ["a"], outputSlotIds: ["image:source:a"], timeoutMs: 1000 };
  assert.equal(createToolCallEnvelope(input).idempotencyKey, createToolCallEnvelope(input).idempotencyKey);
});

test("tool envelope idempotency survives step and attempt changes", () => {
  const base = { runId: "run-1", capabilityId: "app.image-card", input: { objective: "分别生成" }, sourceArtifactIds: ["a1", "a2"], outputSlotIds: ["image:1", "image:2"], timeoutMs: 1000 };
  const first = createToolCallEnvelope({ ...base, stepId: "step-1", attempt: 1 });
  const retry = createToolCallEnvelope({ ...base, stepId: "step-2", attempt: 2 });
  assert.equal(first.idempotencyKey, retry.idempotencyKey);
  const repair = createToolCallEnvelope({ ...base, stepId: "step-3", attempt: 3, outputSlotIds: ["image:2"] });
  assert.notEqual(first.idempotencyKey, repair.idempotencyKey);
});

test("evaluation repairs only missing slots", () => {
  const result = evaluateOutputSlots({ expectedSlots: ["image:a", "image:b"], outputs: [{ slotId: "image:a", artifactId: "asset-a", kind: "image" }], retryStrategy: "retry-missing" });
  assert.equal(result.satisfied, false);
  assert.equal(result.action, "repair_missing");
  assert.deepEqual(result.missingSlots, ["image:b"]);
  assert.deepEqual(result.repairInstructions?.[0].preserveArtifactIds, ["asset-a"]);
});
