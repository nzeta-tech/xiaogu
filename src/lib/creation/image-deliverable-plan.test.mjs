import assert from "node:assert/strict";
import test from "node:test";
import { assertImageDeliverablesComplete, buildImageDeliverablePlan } from "./image-deliverable-plan.ts";

test("two explicit card subjects become two isolated image prompts", () => {
  const source = "分别生成2张图片。卡片1主题：维权与敲诈的边界。核心信息：依法维权。卡片2主题：家庭风险底账。核心信息：现金流与保障。两张均使用简体中文。";
  const plan = buildImageDeliverablePlan(source, `知识卡片\n用户素材：${source}`);
  assert.equal(plan.expectedCount, 2);
  assert.equal(plan.variantPrompts.length, 2);
  assert.match(plan.variantPrompts[0], /维权与敲诈/);
  assert.doesNotMatch(plan.variantPrompts[0], /家庭风险底账/);
  assert.match(plan.variantPrompts[1], /家庭风险底账/);
});

test("explicit image count creates matching independent variants", () => {
  const plan = buildImageDeliverablePlan("请生成3张知识图片，分别使用不同构图", "基础提示");
  assert.equal(plan.expectedCount, 3);
  assert.equal(plan.variantPrompts.length, 3);
});

test("incomplete image output fails deterministic acceptance", () => {
  assert.doesNotThrow(() => assertImageDeliverablesComplete(2, 2));
  assert.throws(() => assertImageDeliverablesComplete(2, 1), /要求 2 张，实际只生成 1 张/);
});

test("markdown deliverable sections become one image per source artifact", () => {
  const source = `【上一轮成果】
## 提前退休最容易算错的一笔账 · 李璞IFA · V1版
第一篇口播正文，核心是先算退休后的现金流缺口。

## 三娃妈妈如何理解提前退休 · 港圈Lina姐 · V1版
第二篇口播正文，核心是家庭不依赖一份工资硬扛。

【用户本次要求】
请制作视频封面。`;
  const plan = buildImageDeliverablePlan(source, `封面基础要求\n${source}`);
  assert.equal(plan.expectedCount, 2);
  assert.equal(plan.source, "explicit-items");
  assert.equal(plan.sourceItems.length, 2);
  assert.match(plan.variantPrompts[0], /现金流缺口/);
  assert.doesNotMatch(plan.variantPrompts[0], /三娃妈妈/);
  assert.match(plan.variantPrompts[1], /三娃妈妈/);
  assert.doesNotMatch(plan.variantPrompts[1], /李璞IFA/);
});
