import assert from "node:assert/strict";
import test from "node:test";
import { FREE_APP_LIMITS, getFreeAppLimits, resolveFreeAppQuotaCost } from "./free-usage-policy.ts";

test("knowledge cards have stable fair-use limits", () => {
  assert.deepEqual(FREE_APP_LIMITS["image-card"], { daily: 3, monthly: 30, overageCost: 5 });
  assert.deepEqual(getFreeAppLimits("image-card"), { daily: 3, monthly: 30, overageCost: 5 });
  assert.equal(getFreeAppLimits("write-copy"), null);
});

test("knowledge cards fall back to paid usage after either free boundary", () => {
  const limits = { daily: 3, monthly: 30, overageCost: 5 };
  assert.equal(resolveFreeAppQuotaCost({ dailyUsed: 2, monthlyUsed: 29 }, limits), 0);
  assert.equal(resolveFreeAppQuotaCost({ dailyUsed: 3, monthlyUsed: 10 }, limits), 5);
  assert.equal(resolveFreeAppQuotaCost({ dailyUsed: 1, monthlyUsed: 30 }, limits), 5);
});
