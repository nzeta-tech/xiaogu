import assert from "node:assert/strict";
import test from "node:test";
import { buildViralSourceIdentity, calculateCreatorQuality, calculateViralScore, isInsuranceFinanceRelevant } from "./viral-scoring.ts";

test("relative outperformance and growth increase the viral score", () => {
  const fetchedAt = new Date().toISOString();
  const baseline = calculateViralScore({ metricValue: 100, previousMetricValue: 90, creatorMedianMetric: 100, fetchedAt, hasAuthor: true, hasThumbnail: true, hasDetailUrl: true });
  const breakout = calculateViralScore({ metricValue: 400, previousMetricValue: 100, creatorMedianMetric: 100, fetchedAt, hasAuthor: true, hasThumbnail: true, hasDetailUrl: true });
  assert.ok(breakout.total > baseline.total);
  assert.equal(breakout.relativePerformance, 100);
  assert.equal(breakout.growthVelocity, 100);
});

test("missing metrics remain rankable but receive lower confidence", () => {
  const fetchedAt = new Date().toISOString();
  const complete = calculateViralScore({ metricValue: 1000, fetchedAt, hasAuthor: true, hasThumbnail: true, hasDetailUrl: true });
  const incomplete = calculateViralScore({ fetchedAt, hasAuthor: false, hasThumbnail: false, hasDetailUrl: true });
  assert.ok(complete.total > incomplete.total);
  assert.ok(incomplete.total >= 0 && incomplete.total <= 100);
});

test("old works are penalized by freshness", () => {
  const fetchedAt = new Date().toISOString();
  const fresh = calculateViralScore({ metricValue: 100, publishedAt: fetchedAt, fetchedAt, hasAuthor: true, hasThumbnail: false, hasDetailUrl: true });
  const old = calculateViralScore({ metricValue: 100, publishedAt: "2020-01-01T00:00:00.000Z", fetchedAt, hasAuthor: true, hasThumbnail: false, hasDetailUrl: true });
  assert.ok(fresh.total > old.total);
});

test("the publication gate rejects generic news without insurance or finance intent", () => {
  assert.equal(isInsuranceFinanceRelevant({ title: "台风在沿海地区登陆", category: "社会民生", tags: ["灾害"] }), false);
  assert.equal(isInsuranceFinanceRelevant({ title: "台风过后车险怎么理赔", category: "风险提醒", tags: ["保险理赔"] }), true);
  assert.equal(isInsuranceFinanceRelevant({ title: "普通家庭如何规划养老金", category: "养老规划" }), true);
});

test("temporary WeChat signatures do not create duplicate work identities", () => {
  const first = buildViralSourceIdentity({ platform: "公众号", title: "保险理赔怎么做", authorName: "保姐", canonicalUrl: "https://mp.weixin.qq.com/s?src=11&signature=one" });
  const second = buildViralSourceIdentity({ platform: "公众号", title: "保险理赔怎么做", authorName: "保姐", canonicalUrl: "https://mp.weixin.qq.com/s?src=11&signature=two" });
  assert.equal(first, second);
  assert.notEqual(first, "https://mp.weixin.qq.com/s");
});

test("creator quality rewards repeated evidence, profile completeness and authority", () => {
  const sparse = calculateCreatorQuality({ displayName: "某某说", discoveryQuery: "保险", evidenceCount: 1, hasProfile: false });
  const established = calculateCreatorQuality({ displayName: "家庭保险理财规划", discoveryQuery: "保险理赔", evidenceCount: 8, hasProfile: true, followerCount: 100000, platformWorkCount: 300, isVerified: true });
  assert.ok(established.total > sparse.total);
  assert.equal(established.completeness, 100);
  assert.ok(established.authority > sparse.authority);
});
