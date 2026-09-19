import test from "node:test";
import assert from "node:assert/strict";
import { buildHotTopicConversation, readHotTopicSource, safeTopicSourceUrl } from "./hot-topic-conversation.ts";

test("hot topic opens a discussion carrying source evidence without selecting a creation skill", () => {
  const topic = { title: "测试热点", summary: "已获取的摘要", source: "公开新闻", sourceUrl: "https://example.com/news", sourcePublishedAt: "2026-09-19T10:00:00Z", evidence: "已获取的报道摘录" };
  const input = buildHotTopicConversation(topic);
  assert.equal(input.objective, "聊聊这个热点：测试热点");
  assert.match(input.context, /已获取的摘要/);
  assert.match(input.context, /已获取的报道摘录/);
  assert.doesNotMatch(input.context, /Fast Research|fast-research|闲聊模式|暂不主动生成/);
  assert.equal(input.requestedCapabilityId, undefined);
  assert.equal(readHotTopicSource(input.context)?.sourceUrl, topic.sourceUrl);
  assert.equal(readHotTopicSource(input.context)?.sourcePublishedAt, topic.sourcePublishedAt);
});
test("source cards do not accept unsafe URLs or ordinary conversation context", () => {
  assert.equal(safeTopicSourceUrl("javascript:alert(1)"), "");
  assert.equal(safeTopicSourceUrl("/relative"), "");
  assert.equal(readHotTopicSource("normal material"), null);
  assert.equal(readHotTopicSource("【今日热点资料】\ninvalid"), null);
});
