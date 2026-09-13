import assert from "node:assert/strict";
import test from "node:test";
import { extractDiscussedTopics, resolveConversationState, suggestedConversationTitle } from "./conversation-state.ts";

test("an alternatives follow-up excludes topics already discussed", () => {
  const state = resolveConversationState({ currentRequest: "还有没有其他热点", recentMessages: [{ role: "assistant", content: "| 灵活就业医保 | 已核验 |\n| 40年房贷 | 待核验 |\n\n## 最推荐：灵活就业医保" }] });
  assert.equal(state.turnRelation, "alternatives");
  assert.equal(state.answerDepth, "brief");
  assert.ok(state.excludedTopics.some(item => item.includes("灵活就业医保")));
  assert.ok(state.excludedTopics.some(item => item.includes("40年房贷")));
});

test("content selection uses creator memory without implying a deliverable", () => {
  const state = resolveConversationState({ currentRequest: "根据我的分身定位找几个今天适合讲的热点" });
  assert.equal(state.useCreatorMemory, true);
  assert.equal(state.explicitDeliverable, false);
  assert.equal(state.phase, "research");
});

test("an exploratory follow-up inherits the active research phase", () => {
  const state = resolveConversationState({ currentRequest: "早春晴朗相关的有什么值得讲的吗", previous: { phase: "research", activeTopic: "今天有什么热点" } });
  assert.equal(state.phase, "research");
  assert.equal(state.turnRelation, "continue");
});

test("explicit writing enters creation", () => {
  const state = resolveConversationState({ currentRequest: "就用第二个角度，直接写一篇完整口播" });
  assert.equal(state.explicitDeliverable, true);
  assert.equal(state.phase, "creation");
});

test("a generic creation command preserves the established subject", () => {
  const state = resolveConversationState({ currentRequest: "帮我写一篇口播文案稿", previous: { activeTopic: "女子发45秒视频被追诉后获国家赔偿" } });
  assert.equal(state.activeTopic, "女子发45秒视频被追诉后获国家赔偿");
  assert.equal(state.phase, "creation");
});

test("a referential creation command preserves the established subject", () => {
  const state = resolveConversationState({ currentRequest: "用这个写一篇口播文案", previous: { activeTopic: "铁头一审获刑8年" } });
  assert.equal(state.activeTopic, "铁头一审获刑8年");
  assert.equal(state.phase, "creation");
});

test("a terse rewrite is a new delivery of the established subject", () => {
  for (const request of ["重新写", "重新写一版"]) {
    const state = resolveConversationState({ currentRequest: request, previous: { activeTopic: "女子发45秒视频被追诉后获国家赔偿" } });
    assert.equal(state.activeTopic, "女子发45秒视频被追诉后获国家赔偿");
    assert.equal(state.explicitDeliverable, true);
    assert.equal(state.phase, "creation");
  }
});

test("extracts headings and table candidates for future deduplication", () => {
  assert.deepEqual(extractDiscussedTopics("| 40年房贷 | 已核验 |\n\n## 第二顺位：存款利率倒挂"), ["40年房贷", "存款利率倒挂"]);
  assert.equal(suggestedConversationTitle("你好"), "");
  assert.equal(suggestedConversationTitle("请帮我找今天适合讲的热点"), "找今天适合讲的热点");
});
