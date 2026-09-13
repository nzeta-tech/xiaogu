import test from "node:test";
import assert from "node:assert/strict";
import { discloseCapabilities } from "./capability-disclosure.ts";

const capability = (id, name, description, outputTypes = ["text"], operations = ["create"]) => ({ id, name, description, outputTypes, operations, kind: "app", riskLevel: "generate", executionMode: "sync", autoInvoke: true, buildInput: () => ({}) });

test("image request discloses image capability without flooding unrelated apps", () => {
  const selected = discloseCapabilities({ request: "把这两个分别做成知识图片", max: 3, capabilities: [
    capability("app.image-card", "知识图片", "生成知识卡片", ["image"]),
    capability("app.topic-picker", "找选题", "寻找热门选题"),
    capability("app.ppt", "PPT", "生成演示文稿", ["presentation"]),
  ] });
  assert.equal(selected[0].id, "app.image-card");
  assert.ok(selected.length < 3);
});

test("unsegmented Chinese request recalls a named capability through generic lexical overlap", () => {
  const selected = discloseCapabilities({ request: "再帮我整理成一篇星球社区帖子", max: 2, capabilities: [
    capability("app.community-post", "星球社区内容", "创作适合社区发布的帖子"),
    capability("app.presentation", "演示文稿", "生成商务汇报", ["presentation"]),
    capability("agent.fast-research", "快速研究", "检索当前资料"),
  ] });
  assert.equal(selected[0].id, "app.community-post");
});
