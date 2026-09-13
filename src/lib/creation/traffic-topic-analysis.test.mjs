import assert from "node:assert/strict";
import test from "node:test";
import { fallbackFastTopics } from "./traffic-topic-fallback.ts";

test("topic fallback uses the actual entity and prior angles instead of an internal instruction", () => {
  const source = `基于已讨论的电视剧《早春晴朗》观点，生成一篇可直接录制的观点型口播文案。\n\n### 1. 为什么很多人一边上头，一边不舒服？\n内容\n\n### 2. 尚之桃的成长，不该只理解成等一个人回头\n内容`;
  const topics = fallbackFastTopics(source);
  assert.equal(topics.length, 6);
  assert.equal(topics[0].title, "为什么很多人一边上头，一边不舒服？");
  assert.match(topics[2].title, /《早春晴朗》/);
  assert.ok(topics.every((topic) => !topic.title.startsWith("基于已讨论")));
});
