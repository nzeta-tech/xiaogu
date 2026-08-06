import assert from "node:assert/strict";
import test from "node:test";
import { buildWechatSectionImagePrompts } from "./wechat-article-images.ts";

test("creates a distinct image prompt for each article section", () => {
  const plan = buildWechatSectionImagePrompts([
    "# 香港保单要收税，还值吗？",
    "",
    "## 先把极端情况算一遍",
    "先确认税务口径和实际影响，不把个案当成统一结论。",
    "",
    "## 真正要问的不是怕不怕税",
    "长期配置要同时看现金流、合规与自己能否持续管理。",
    "",
    "## 哪些人适合继续比较",
    "基础保障配齐后，再判断是否适合复杂的跨境安排。",
  ].join("\n"), "基础视觉要求", 5);

  assert.equal(plan.prompts.length, 3);
  assert.equal(new Set(plan.prompts).size, 3);
  assert.match(plan.prompts[0], /先把极端情况算一遍/);
  assert.match(plan.prompts[1], /真正要问的不是怕不怕税/);
  assert.match(plan.prompts[2], /哪些人适合继续比较/);
});
