import assert from "node:assert/strict";
import test from "node:test";
import {
  resetViralDataPreparationSchedulerForTest,
  startViralDataPreparationScheduler,
  viralDataScheduleIntervalMs,
} from "./viral-data-scheduler.ts";

test("formal viral preparation starts immediately and repeats on the configured interval", async () => {
  resetViralDataPreparationSchedulerForTest();
  const triggers = [];
  let scheduled;
  let delay;
  const started = startViralDataPreparationScheduler({
    run: async ({ trigger }) => { triggers.push(trigger); },
    registerInterval: (callback, configuredDelay) => {
      scheduled = callback;
      delay = configuredDelay;
      return 1;
    },
    intervalMs: 6 * 60 * 60 * 1000,
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(started, true);
  assert.equal(delay, 6 * 60 * 60 * 1000);
  assert.deepEqual(triggers, ["web-startup"]);
  scheduled();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(triggers, ["web-startup", "web-interval"]);
});

test("scheduler is singleton per process and clamps unsafe intervals", () => {
  assert.equal(startViralDataPreparationScheduler({ run: async () => undefined }), false);
  assert.equal(viralDataScheduleIntervalMs("1"), 60 * 60 * 1000);
  assert.equal(viralDataScheduleIntervalMs(String(48 * 60 * 60 * 1000)), 24 * 60 * 60 * 1000);
  assert.equal(viralDataScheduleIntervalMs("invalid"), 6 * 60 * 60 * 1000);
});

test("a failed preparation does not cancel the next scheduled attempt", async () => {
  resetViralDataPreparationSchedulerForTest();
  let attempts = 0;
  let scheduled;
  startViralDataPreparationScheduler({
    run: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("controlled provider failure");
    },
    registerInterval: (callback) => {
      scheduled = callback;
      return 1;
    },
  });
  await new Promise((resolve) => setImmediate(resolve));
  scheduled();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(attempts, 2);
});
