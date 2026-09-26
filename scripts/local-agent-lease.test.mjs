import assert from "node:assert/strict";
import test from "node:test";
import { taskLeaseHeartbeatIntervalMs } from "./local-agent-lease.mjs";

test("renews a ten-minute task lease every minute", () => {
  assert.equal(taskLeaseHeartbeatIntervalMs(600), 60_000);
});

test("keeps at least four renewal opportunities for short leases", () => {
  assert.equal(taskLeaseHeartbeatIntervalMs(60), 15_000);
  assert.equal(taskLeaseHeartbeatIntervalMs(120), 30_000);
});

test("falls back safely for invalid lease settings", () => {
  assert.equal(taskLeaseHeartbeatIntervalMs(Number.NaN), 60_000);
});
