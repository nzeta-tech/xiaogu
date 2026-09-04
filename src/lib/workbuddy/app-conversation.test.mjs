import assert from "node:assert/strict";
import test from "node:test";
import { applicationNeedsConversationForm, appNextActions, assessApplicationReadiness, buildConversationAppFields, isGenericApplicationIntent, mergeConversationAppParameters, parseConversationAppParameters, resolveConversationAppSource, shouldSkipTrafficTopicSelection } from "./app-conversation.ts";
import { getCreationAppBySlug } from "../apps/catalog.ts";

const app = {
  id: "demo", slug: "demo", name: "演示应用", emoji: "", category: "content", points: 1,
  description: "", promptHint: "", resultType: "text",
  fields: [
    { id: "platform", label: "平台", type: "radio", required: true, options: [{ label: "视频号", value: "wechat" }, { label: "抖音", value: "douyin" }] },
    { id: "source", label: "素材", type: "textarea", required: true },
    { id: "reference", label: "资料", type: "file" },
  ],
};

test("application fields become a chat-native form", () => {
  assert.equal(applicationNeedsConversationForm(app), true);
  const fields = buildConversationAppFields(app, "已有素材");
  assert.equal(fields[0].type, "single");
  assert.equal(fields[1].initialValue, "已有素材");
  assert.equal(fields[2].type, "file");
});

test("confirmed application parameters override defaults", () => {
  const message = `[应用参数:demo]\n${JSON.stringify({ platform: "douyin", source: "用户内容" })}\n继续执行`;
  assert.deepEqual(parseConversationAppParameters(message, "demo"), { platform: "douyin", source: "用户内容" });
  assert.deepEqual(mergeConversationAppParameters({ platform: "wechat", source: "默认" }, message, "demo"), { platform: "douyin", source: "用户内容" });
});

test("researched application instruction seeds the confirmation form", () => {
  const pending = "围绕梅艳芳的信托养老安排，解释按月支付与一次性继承的区别。";
  assert.equal(resolveConversationAppSource(pending, "", "梅艳芳今天很火，帮我找一个角度写"), pending);
  assert.equal(resolveConversationAppSource("", "按信托角度继续", "原始目标"), "按信托角度继续");
});

test("generic creation intent is not treated as executable source material", () => {
  const traffic = getCreationAppBySlug("traffic-copy");
  assert.equal(isGenericApplicationIntent("我想写一篇口播稿", traffic), true);
  assert.equal(assessApplicationReadiness(traffic, "我想写一篇口播稿").ready, false);
  assert.equal(assessApplicationReadiness(traffic, "围绕40年房贷，讲清月供降低和总利息增加").ready, true);
  assert.equal(assessApplicationReadiness(traffic, "基于上面的热点写一篇口播稿").ready, true);
});

test("readiness gate covers other material-dependent applications", () => {
  assert.equal(assessApplicationReadiness(getCreationAppBySlug("wechat-studio"), "帮我写一篇文章").ready, false);
  assert.equal(assessApplicationReadiness(getCreationAppBySlug("video-cover"), "帮我做一个封面").ready, false);
  assert.equal(assessApplicationReadiness(getCreationAppBySlug("policy-diagnosis"), "帮我看一下保单").ready, false);
  assert.equal(assessApplicationReadiness(getCreationAppBySlug("image-card"), "做个知识卡片").ready, false);
  assert.equal(assessApplicationReadiness(getCreationAppBySlug("topic-picker"), "帮我找几个选题").ready, true);
});

test("application results expose natural next actions", () => {
  const actions = appNextActions("traffic-copy", "text");
  assert.ok(actions.some((item) => item.label.includes("视频封面")));
  assert.ok(actions.every((item) => item.value.length > 2));
});

test("link remix keeps parser data hidden and exposes target-specific settings", () => {
  const remix = getCreationAppBySlug("link-remix");
  const fields = buildConversationAppFields(remix, "https://example.com/post");
  assert.equal(fields.find((field) => field.id === "source_title")?.presentation, "data");
  assert.ok(fields.find((field) => field.id === "audience")?.visibleWhenAny?.some((condition) => condition.equals === "wechat-studio"));
  assert.ok(fields.find((field) => field.id === "length_mode")?.visibleWhenAny?.some((condition) => condition.equals === "xiaohongshu-studio"));
});

test("traffic copy only skips topic selection when the creator explicitly asks", () => {
  assert.equal(shouldSkipTrafficTopicSelection("我想写一篇口播稿"), false);
  assert.equal(shouldSkipTrafficTopicSelection("热点标题：多地小学老师转教初中"), false);
  assert.equal(shouldSkipTrafficTopicSelection("这个题目已经定了，直接写正文"), true);
  assert.equal(shouldSkipTrafficTopicSelection("不用推荐选题，直接生成口播"), true);
  assert.equal(shouldSkipTrafficTopicSelection("请先进入选题流程，不要直接写正文"), false);
  assert.equal(shouldSkipTrafficTopicSelection("不要跳过选题，也别直接生成正文"), false);
  assert.equal(shouldSkipTrafficTopicSelection("不要再推荐选题，直接写正文"), true);
});
