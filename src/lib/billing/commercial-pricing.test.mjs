import assert from "node:assert/strict";
import test from "node:test";
import { creationApps } from "../apps/catalog.ts";
import { defaultBillingPlans, getBillingPlanPresentation } from "./plans.ts";

const prices = Object.fromEntries(creationApps.map((app) => [app.slug, app.points]));

test("commercial application prices use the approved tiers", () => {
  assert.equal(prices["image-card"], 0);
  assert.equal(prices["digital-human-video"], 30);
  for (const slug of ["xiaohongshu-studio", "wechat-studio", "ppt-maker", "link-remix", "lead-package"]) {
    assert.equal(prices[slug], 15, `${slug} should be a heavy creation app`);
  }
  for (const app of creationApps) {
    assert.ok([0, 5, 15, 30].includes(app.points), `${app.slug} has unsupported price ${app.points}`);
  }
});

test("commercial packages have exact prices, credits, order, and no recommendation", () => {
  assert.deepEqual(defaultBillingPlans.map(({ code, amountCents, quotaAmount, recommended }) => ({ code, amountCents, quotaAmount, recommended: Boolean(recommended) })), [
    { code: "trial_29", amountCents: 2990, quotaAmount: 29, recommended: false },
    { code: "creator_100", amountCents: 9990, quotaAmount: 100, recommended: false },
    { code: "professional_300", amountCents: 29990, quotaAmount: 300, recommended: false },
    { code: "team_1000", amountCents: 99990, quotaAmount: 1000, recommended: false },
  ]);
});

test("commercial packages explain distinct, non-cumulative usage examples", () => {
  const presentations = defaultBillingPlans.map(getBillingPlanPresentation);

  assert.equal(new Set(presentations.map((item) => item.description)).size, 4);
  assert.deepEqual(presentations.map((item) => item.usageExamples[0]), [
    "最多 5 次普通创作",
    "最多 20 次普通创作",
    "最多 60 次普通创作",
    "最多 200 次普通创作",
  ]);
  assert.deepEqual(presentations.map((item) => item.usageExamples.at(-1)), [
    "知识卡片永久免费",
    "或 3 次基础口播视频",
    "或 10 次基础口播视频",
    "或 33 次基础口播视频",
  ]);
});
