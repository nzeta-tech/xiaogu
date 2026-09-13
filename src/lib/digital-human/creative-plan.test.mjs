import assert from "node:assert/strict";
import test from "node:test";
import { buildLockedCreativePlan, requiresXiaoguPostProduction, validateLockedCreativePlan } from "./creative-plan.ts";

test("smart plan keeps every spoken segment anchored to the locked source", () => {
  const source = "很多人认为买了保险就一定能赔。\n其实，是否赔付要看合同约定；先看责任，再看免责。";
  const plan = buildLockedCreativePlan({ script: source, aspectRatio: "9:16", templateName: "知识讲解" });
  assert.equal(plan.sourceText, source);
  assert.equal(plan.sourceTextLocked, true);
  assert.ok(plan.scenes.length >= 1);
  for (const scene of plan.scenes) assert.equal(source.slice(scene.sourceStart, scene.sourceEnd), scene.spokenText);
  assert.equal(validateLockedCreativePlan(plan, source), true);
});

test("smart plan is rejected after the spoken copy changes", () => {
  const source = "这是已经定稿的口播文案。请保持原文。";
  const plan = buildLockedCreativePlan({ script: source, aspectRatio: "16:9" });
  assert.equal(validateLockedCreativePlan(plan, `${source}新增内容`), false);
});

test("native presenter-only plans do not trigger a second render", () => {
  const source = "这是保持原文的数字人口播。";
  const plan = buildLockedCreativePlan({ script: source, aspectRatio: "9:16" });
  plan.scenes = plan.scenes.map((scene) => ({ ...scene, presentation: "presenter", overlayText: "" }));
  assert.equal(requiresXiaoguPostProduction(plan), false);
  assert.equal(requiresXiaoguPostProduction(plan, { visualStyleReference: { id: "business" } }), true);
});
