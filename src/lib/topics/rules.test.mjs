import test from "node:test";
import assert from "node:assert/strict";
import { enrichHotTopicDomains, ensureInternationalFinanceCoverage, getHotTopicCategoryStats, inferHotTopicCategory, normalizeSourcePublishedAt } from "./rules.ts";

function topic(title, category = "家庭责任") {
  return { id: title, title, summary: title, source: "test", heat: "中", category, insuranceRelevance: "中", recommendedAngle: "test", riskNote: "test" };
}

test("international finance candidate is kept in the visible first ten", () => {
  const candidates = [...Array.from({ length: 12 }, (_, index) => topic(`家庭热点${index}`)), topic("美联储调整利率与美股波动", "社会热点")];
  const selected = ensureInternationalFinanceCoverage(candidates, 12);
  assert.equal(selected.length, 12);
  assert.equal(inferHotTopicCategory(selected[9].title), "国际财经");
  assert.equal(selected.slice(0, 10).filter((item) => inferHotTopicCategory(item.title) === "国际财经").length, 1);
});

test("source timestamps support seconds, milliseconds, and ISO values", () => {
  assert.equal(normalizeSourcePublishedAt(1_750_000_000), "2025-06-15T15:06:40.000Z");
  assert.equal(normalizeSourcePublishedAt("2026-07-23T00:00:00Z"), "2026-07-23T00:00:00.000Z");
  assert.equal(normalizeSourcePublishedAt("not-a-date"), undefined);
});

test("category concentration counts legacy international titles", () => {
  const stats = getHotTopicCategoryStats([topic("美股与美元汇率波动", "社会热点"), topic("家庭责任事件")]);
  assert.equal(stats[0].category, "国际财经");
  assert.equal(stats[0].ratio, 0.5);
});

test("finance topics receive a native finance angle instead of forced insurance", () => {
  const enriched = enrichHotTopicDomains(topic("美联储降息后黄金和美债如何变化", "国际财经"));
  assert.equal(enriched.primaryDomain, "finance");
  assert.equal(enriched.recommendedAngles[0].domain, "finance");
  assert.doesNotMatch(enriched.recommendedAngle, /投保|核保|保障规划/);
});

test("insurance topics retain insurance relevance and professional angle", () => {
  const enriched = enrichHotTopicDomains(topic("医疗险续保和理赔条件发生变化", "健康医疗"));
  assert.equal(enriched.primaryDomain, "insurance");
  assert.equal(enriched.insuranceRelevance, "高");
  assert.match(enriched.recommendedAngle, /保险责任|承保|理赔/);
});
