import assert from "node:assert/strict";
import test from "node:test";
import { conversationContinuationMessage, isWorkbuddyWorkspaceUrl, parseConversationContinuation, shouldContinueInsideConversation, shouldOpenEmbeddedContinuation } from "./continuation-navigation.ts";

test("legacy persisted href choices remain embedded after protocol upgrades", () => {
  assert.equal(shouldOpenEmbeddedContinuation({ href: "/apps/xiaohongshu-studio?workId=old" }), true);
  assert.equal(shouldOpenEmbeddedContinuation({ href: "/apps/xiaohongshu-studio?workId=new", continuation: { presentation: "embedded-workspace" } }), true);
  assert.equal(shouldOpenEmbeddedContinuation({ continuation: { presentation: "inline-form" } }), false);
});

test("legacy studio image action upgrades instead of replaying image-card", () => {
  const legacy = {
    href: "/apps/xiaohongshu-studio?workId=legacy-work",
    value: "承接正文生成配图\n[应用参数:image-card]\n{\"creation_mode\":\"text_to_card\"}",
  };
  assert.equal(shouldContinueInsideConversation(legacy), false);
  const message = conversationContinuationMessage(legacy);
  assert.doesNotMatch(message, /应用参数:image-card/);
  assert.equal(parseConversationContinuation(message)?.presentation, "embedded-workspace");
  assert.equal(parseConversationContinuation(message)?.workId, "legacy-work");
});

test("same-work continuation carries durable workflow context into chat", () => {
  const message = conversationContinuationMessage({
    label: "继续生成配图",
    value: "继续生成配图",
    continuation: { appSlug: "xiaohongshu-studio", kind: "same-work", targetStep: "assets", workId: "work-1" },
  });
  assert.match(message, /^继续生成配图/);
  assert.match(message, /\[工作流续作\]/);
  assert.match(message, /"targetStep":"assets"/);
  assert.match(message, /"workId":"work-1"/);
  assert.equal(parseConversationContinuation(message)?.targetStep, "assets");
  assert.equal(parseConversationContinuation(message)?.userLabel, "继续生成配图");
});

test("generic revise continuation keeps its declared capability", () => {
  const message = conversationContinuationMessage({
    value: "请基于刚完成的产物继续处理。",
    continuation: { appSlug: "wechat-images", kind: "revise", targetCapabilityId: "app.wechat-images", workId: "image-work" },
  });
  assert.equal(parseConversationContinuation(message)?.targetCapabilityId, "app.wechat-images");
  assert.doesNotMatch(message, /video-cover/);
});

test("only Workbuddy-compatible application routes occupy the task workspace", () => {
  assert.equal(isWorkbuddyWorkspaceUrl("/apps/xiaohongshu-studio?workId=1"), true);
  assert.equal(isWorkbuddyWorkspaceUrl("/apps/wechat-studio/work-1"), true);
  assert.equal(isWorkbuddyWorkspaceUrl("/workbuddy/video-editor"), true);
  assert.equal(isWorkbuddyWorkspaceUrl("/apps/digital-human-video?workId=1"), false);
  assert.equal(isWorkbuddyWorkspaceUrl("https://example.com/editor"), false);
});
