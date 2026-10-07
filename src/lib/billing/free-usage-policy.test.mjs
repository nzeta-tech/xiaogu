import assert from "node:assert/strict";
import test from "node:test";
import { FREE_APP_LIMITS, freeAppLimitError, getFreeAppLimits } from "./free-usage-policy.ts";

test("knowledge cards have stable fair-use limits", () => {
  assert.deepEqual(FREE_APP_LIMITS["image-card"], { daily: 3, monthly: 30 });
  assert.deepEqual(getFreeAppLimits("image-card"), { daily: 3, monthly: 30 });
  assert.equal(getFreeAppLimits("write-copy"), null);
});

test("free usage reports the first exhausted boundary", () => {
  const limits = { daily: 3, monthly: 30 };
  assert.equal(freeAppLimitError({ dailyUsed: 2, monthlyUsed: 29 }, limits), null);
  assert.match(freeAppLimitError({ dailyUsed: 3, monthlyUsed: 10 }, limits), /每天 3 次/);
  assert.match(freeAppLimitError({ dailyUsed: 1, monthlyUsed: 30 }, limits), /每月 30 次/);
});
