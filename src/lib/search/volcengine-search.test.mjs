import assert from "node:assert/strict";
import test from "node:test";
import { normalizeVolcenginePayload } from "./volcengine-search.ts";

test("normalizes documented Result.WebResults response", () => {
  const results = normalizeVolcenginePayload({ Result: { WebResults: [{
    Title: "官方政策发布", Url: "https://example.com/policy", Content: "政策正文摘要",
    PublishTime: "2026-08-15T10:00:00+08:00", RankScore: 0.97,
  }] } });
  assert.deepEqual(results, [{
    title: "官方政策发布", url: "https://example.com/policy", content: "政策正文摘要",
    publishedDate: "2026-08-15T10:00:00+08:00", score: 0.97, provider: "volcengine",
  }]);
});

test("drops malformed results without a title or URL", () => {
  assert.deepEqual(normalizeVolcenginePayload({ Result: { WebResults: [{ Title: "无链接" }] } }), []);
});
