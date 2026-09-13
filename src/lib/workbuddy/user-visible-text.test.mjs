import assert from "node:assert/strict";
import test from "node:test";
import { workbuddyUserVisibleText } from "./user-visible-text.ts";

test("application envelopes never appear in user-visible text", () => {
  const raw = `[应用参数:xiaohongshu-assets]\n{"_workbuddy_operation":"create","_workbuddy_continuation":"[工作流续作] secret"}`;
  const visible = workbuddyUserVisibleText(raw);
  assert.equal(visible, "已确认“小红书配图”的创作设置，开始生成。");
  assert.doesNotMatch(visible, /应用参数|工作流续作|_workbuddy|secret/);
});

test("visible form summary survives while transport suffix is removed", () => {
  assert.equal(workbuddyUserVisibleText("已确认风格：生活共鸣\n\n[应用参数:xiaohongshu-assets]\n{}"), "已确认风格：生活共鸣");
});

test("selected capability routing instruction becomes a friendly label", () => {
  assert.equal(workbuddyUserVisibleText("用户已明确选择应用 Skill。能力 ID：app.image-card。请优先调用“知识卡片制作”，不要替换。"), "已选择“知识卡片制作”");
});

test("delivery gate implementation details collapse to a progress phrase", () => {
  assert.equal(workbuddyUserVisibleText("交付门禁：image-card 应交付 2 个 image。\n缺失输出槽位：image:2"), "正在补齐尚未生成的成果");
});
