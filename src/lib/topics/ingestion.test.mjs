import test from "node:test";
import assert from "node:assert/strict";
import { HOT_TOPIC_TABS, prepareTopicIngestion, topicDedupeKey } from "./ingestion.ts";
import { waitForTopicRefresh } from "./refresh-warmup.ts";

function topic(title, source = "测试来源", category = "社会热点") {
  return { id: title, title, summary: title, source, heat: "中", category, insuranceRelevance: "中", recommendedAngle: "测试", riskNote: "测试" };
}

test("one ingestion run classifies all four Today Inspiration tabs", () => {
  const prepared = prepareTopicIngestion([
    topic("台风天气与家庭保障"),
    topic("央行利率与基金市场", "财经新闻", "财经"),
    topic("香港港元与恒生指数", "RTHK"),
    topic("美联储与欧洲央行最新决定", "Reuters"),
  ]);

  assert.deepEqual(new Set(prepared.map((item) => item.tab)), new Set(HOT_TOPIC_TABS));
});

test("ingestion removes punctuation-only duplicates and applies a per-tab quota", () => {
  const prepared = prepareTopicIngestion([
    topic("家庭保障：怎么配？"),
    topic("家庭保障怎么配"),
    topic("第二个普通热点"),
  ], 1);

  assert.equal(topicDedupeKey({ title: "家庭保障：怎么配？" }), topicDedupeKey({ title: "家庭保障怎么配" }));
  assert.equal(prepared.filter((item) => item.tab === "热点").length, 1);
});

test("empty ingestion never fabricates placeholder topics", () => {
  assert.deepEqual(prepareTopicIngestion([]), []);
});

test("initial page warmup returns within its request budget while refresh continues", async () => {
  let completed = false;
  const refresh = new Promise((resolve) => setTimeout(() => { completed = true; resolve("done"); }, 150));
  const result = await waitForTopicRefresh(refresh, 100);

  assert.equal(result.timedOut, true);
  await refresh;
  assert.equal(completed, true);
});

test("initial page warmup returns a fast refresh result", async () => {
  const result = await waitForTopicRefresh(Promise.resolve("done"), 100);
  assert.deepEqual(result, { timedOut: false, value: "done" });
});
