import assert from "node:assert/strict";
import test from "node:test";
import { creationApps } from "./catalog.ts";
import { validateApplicationWorkflowContract, workflowContractForApp } from "./workflow-contract.ts";

test("every creation-plaza application has a valid workflow contract", () => {
  const appSlugs = new Set(creationApps.map(app => app.slug));
  for (const app of creationApps) {
    const contract = workflowContractForApp(app);
    assert.equal(contract.appSlug, app.slug);
    assert.deepEqual(validateApplicationWorkflowContract(contract), [], app.slug);
    for (const continuation of contract.continuations) {
      if (!continuation.targetCapabilityId?.startsWith("app.")) continue;
      assert.equal(appSlugs.has(continuation.targetCapabilityId.slice(4)), true, `${app.slug}:${continuation.id}`);
    }
  }
});

test("multi-step studios preserve one work across their complete workflow", () => {
  const xhs = workflowContractForApp(creationApps.find(app => app.slug === "xiaohongshu-studio"));
  assert.deepEqual(xhs.steps.map(step => step.id), ["input", "draft", "assets", "preview"]);
  assert.equal(xhs.continuations.find(item => item.id === "assets")?.presentation, "inline-form");
  assert.equal(xhs.continuations.find(item => item.id === "assets")?.targetCapabilityId, "skill.xiaohongshu-assets");
  const wechat = workflowContractForApp(creationApps.find(app => app.slug === "wechat-studio"));
  assert.deepEqual(wechat.steps.map(step => step.id), ["input", "draft", "assets", "layout", "publish"]);
});
