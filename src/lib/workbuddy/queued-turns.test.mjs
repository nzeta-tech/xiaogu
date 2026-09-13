import assert from "node:assert/strict";
import test from "node:test";
import { createQueuedWorkbuddyTurn, partitionQueuedWorkbuddyTurns } from "./queued-turns.ts";

const now = "2026-09-12T12:00:00.000Z";

test("plain queued requirements steer the current loop without becoming a new capability turn", () => {
  const steering = createQueuedWorkbuddyTurn({ id: "one", content: "标题更短一点", supplementalContext: "语气保持温和", createdAt: now });
  assert.equal(steering.mode, "after-current-step");
  const result = partitionQueuedWorkbuddyTurns([steering], "steering");
  assert.deepEqual(result.selected, [steering]);
  assert.deepEqual(result.remaining, []);
});

test("an explicitly selected Skill is preserved as a fresh turn with its own material", () => {
  const current = createQueuedWorkbuddyTurn({ id: "one", content: "标题更短一点", createdAt: now });
  const next = createQueuedWorkbuddyTurn({ id: "two", content: "把这两篇分别做成知识图片", supplementalContext: "第一篇真实正文\n第二篇真实正文", requestedCapabilityId: "app.image-card", createdAt: now });
  assert.equal(next.mode, "next-turn");
  const steering = partitionQueuedWorkbuddyTurns([current, next], "steering");
  assert.deepEqual(steering.selected.map(item => item.id), ["one"]);
  assert.deepEqual(steering.remaining.map(item => item.id), ["two"]);
  const capabilityTurn = partitionQueuedWorkbuddyTurns(steering.remaining, "next-turn");
  assert.equal(capabilityTurn.selected[0].requestedCapabilityId, "app.image-card");
  assert.equal(capabilityTurn.selected[0].supplementalContext, "第一篇真实正文\n第二篇真实正文");
  assert.deepEqual(capabilityTurn.remaining, []);
});

test("draining one kind never drops or merges queued turns of the other kind", () => {
  const items = [createQueuedWorkbuddyTurn({ id: "s1", content: "补充事实", createdAt: now }), createQueuedWorkbuddyTurn({ id: "n1", content: "生成封面", requestedCapabilityId: "app.video-cover", createdAt: now }), createQueuedWorkbuddyTurn({ id: "n2", content: "再做PPT", requestedCapabilityId: "app.ppt-maker", createdAt: now })];
  const first = partitionQueuedWorkbuddyTurns(items, "next-turn");
  assert.deepEqual(first.selected.map(item => item.id), ["n1", "n2"]);
  assert.deepEqual(first.remaining.map(item => item.id), ["s1"]);
  assert.equal(first.selected[0].content, "生成封面");
  assert.equal(first.selected[1].content, "再做PPT");
});
