import assert from "node:assert/strict";
import test from "node:test";
import { extractVolcengineBusinessError, normalizeVolcenginePayload, searchWeb } from "./volcengine-search.ts";

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

test("detects HTTP 200 business errors from Volcengine", () => {
  assert.deepEqual(extractVolcengineBusinessError({ ResponseMetadata: { Error: { Code: "10406", Message: "Free quota has been exhausted." } }, Result: null }), {
    code: "10406",
    message: "Free quota has been exhausted.",
  });
});

test("search gateway falls back to Tavily after a Volcengine business error", async () => {
  const originalFetch = globalThis.fetch;
  const originalVolcengineKey = process.env.VOLCENGINE_SEARCH_API_KEY;
  const originalTavilyKey = process.env.TAVILY_API_KEY;
  process.env.VOLCENGINE_SEARCH_API_KEY = "volc-test";
  process.env.TAVILY_API_KEY = "tavily-test";
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1) return new Response(JSON.stringify({ ResponseMetadata: { Error: { Code: "10406", Message: "quota exhausted" } }, Result: null }), { status: 200 });
    return new Response(JSON.stringify({ results: [{ title: "HYROX official update", url: "https://hyrox.com/news", content: "Official result", published_date: "2026-09-13", score: 0.9 }] }), { status: 200 });
  };
  try {
    const results = await searchWeb("HYROX latest news", { count: 3 });
    assert.equal(calls, 2);
    assert.equal(results[0].provider, "tavily");
    assert.equal(results[0].title, "HYROX official update");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalVolcengineKey === undefined) delete process.env.VOLCENGINE_SEARCH_API_KEY; else process.env.VOLCENGINE_SEARCH_API_KEY = originalVolcengineKey;
    if (originalTavilyKey === undefined) delete process.env.TAVILY_API_KEY; else process.env.TAVILY_API_KEY = originalTavilyKey;
  }
});
