import assert from "node:assert/strict";
import test from "node:test";
import { isCapacityLimitedModelError, resolveModelRequestTimeout } from "./model-runtime-policy.ts";

test("traffic model requests receive a 180 second minimum without changing other modes", () => {
  assert.equal(resolveModelRequestTimeout(120, "traffic"), 180);
  assert.equal(resolveModelRequestTimeout(240, "traffic"), 240);
  assert.equal(resolveModelRequestTimeout(120, "general"), 120);
  assert.equal(resolveModelRequestTimeout(120, "traffic", 45), 45);
});

test("capacity-limit failures are distinguished from ordinary model errors", () => {
  assert.equal(isCapacityLimitedModelError(new Error("429 Concurrency limit exceeded")), true);
  assert.equal(isCapacityLimitedModelError(new Error("rate_limit_exceeded")), true);
  assert.equal(isCapacityLimitedModelError(new Error("upstream timeout")), false);
});
