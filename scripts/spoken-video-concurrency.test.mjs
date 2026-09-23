import { test } from "node:test";
import assert from "node:assert/strict";
import { mapVideoWork } from "./spoken-video-concurrency.mjs";

test("video work overlaps only up to its limit and preserves segment order", async () => {
  let active = 0, peak = 0;
  const result = await mapVideoWork([40, 5, 10, 5], 2, async (delay, index) => {
    peak = Math.max(peak, ++active);
    await new Promise(resolve => setTimeout(resolve, delay));
    active--;
    return index;
  });
  assert.equal(peak, 2);
  assert.equal(active, 0);
  assert.deepEqual(result, [0, 1, 2, 3]);
});

test("failure stops new work and drains the other branch before cleanup", async () => {
  const started = [];
  let drained = false;
  await assert.rejects(mapVideoWork([0, 1, 2, 3], 2, async value => {
    started.push(value);
    if (value === 0) {
      await new Promise(resolve => setTimeout(resolve, 5));
      throw new Error("provider unavailable");
    }
    await new Promise(resolve => setTimeout(resolve, 30));
    drained = true;
  }), /provider unavailable/);
  assert.equal(drained, true);
  assert.deepEqual(started, [0, 1]);
});
