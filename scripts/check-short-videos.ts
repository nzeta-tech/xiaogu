import assert from "node:assert/strict";
import { classifyShortVideo, getShortVideoFeed, normalizeProviderItem, isStructurallyEligible } from "../src/lib/short-videos/catalog";
import type { ProviderItem } from "../src/lib/short-videos/catalog";

const base: ProviderItem = {
  id: "v1",
  title: "家庭医疗保障结构参考",
  platform: "douyin",
  source_url: "https://example.invalid/video/v1",
  published_at: "2026-07-20T00:00:00Z",
  metrics: { views: 100, likes: 10, statistics_at: "2026-07-22T00:00:00Z" },
  themes: ["健康医疗"],
  authorized: true,
  fact_status: "human_verified",
  fact_type: "policy_term",
  fact_claims: ["示例事实"],
  evidence: [{ officialUrl: "https://example.invalid/evidence", institution: "官方机构", publishedAt: "2026-07-19T00:00:00Z", excerpt: "官方证据摘录" }],
  jurisdiction: "CN",
  effective_at: "2026-07-19T00:00:00Z",
  reviewed_at: "2026-07-21T00:00:00Z",
  reviewer_id: "reviewer-1",
  rights_basis: "official_api_display",
  rights_scope: "metadata_only",
  rights_expires_at: "2026-12-31T00:00:00Z",
  attribution: "平台及原作者",
  platform_policy_checked_at: "2026-07-21T00:00:00Z",
};

function item(overrides: Partial<ProviderItem> = {}) {
  return normalizeProviderItem({ ...base, ...overrides });
}

assert.equal(classifyShortVideo(item()), "displayable");
assert.equal(classifyShortVideo(item({ evidence: [] })), "pending_review", "缺 evidence 只能待核验");
assert.equal(classifyShortVideo(item({ rights_expires_at: "2020-01-01T00:00:00Z" })), "filtered", "过期权利必须过滤");
assert.equal(classifyShortVideo(item({ source_url: "http://example.invalid/video" })), "filtered", "非 HTTPS 必须过滤");
assert.equal(classifyShortVideo(item({ platform_deleted: true })), "filtered", "平台删除必须过滤");
assert.equal(classifyShortVideo(item({ title: "这款保险必赔，闭眼买" })), "filtered", "绝对化话术必须过滤");
assert.equal(classifyShortVideo(item({ title: "客户手机号 13800000000" })), "filtered", "敏感信息必须过滤");
assert.equal(classifyShortVideo({ ...item(), availability: "stale" }), "pending_review", "stale 不得作为可发布内容");
assert.equal(isStructurallyEligible(item({ metrics: { views: 100 } })), false, "缺统计时间必须过滤");
assert.equal(classifyShortVideo(item({ fact_status: "unverified" })), "pending_review", "事实未核验必须待核验");
assert.equal(classifyShortVideo(item({ fact_status: "rejected" })), "filtered", "事实被拒绝必须过滤");

async function main() {
  const configuredProvider = process.env.AUTHORIZED_SHORT_VIDEO_API_BASE;
  delete process.env.AUTHORIZED_SHORT_VIDEO_API_BASE;
  const noSource = await getShortVideoFeed();
  assert.deepEqual(noSource.items, [], "无授权源必须返回空列表");
  assert.equal(noSource.degradationReason, "provider_not_configured");

  const originalFetch = globalThis.fetch;
  const validProviderItem = { ...base, source_url: "https://example.invalid/video/valid" };
  const structurallyFilteredItem = { ...base, id: "unauthorized", authorized: false, source_url: "http://example.invalid/video/filtered" };
  process.env.AUTHORIZED_SHORT_VIDEO_API_BASE = "https://provider.example.invalid";
  globalThis.fetch = async () => new Response(JSON.stringify({ data: [validProviderItem, structurallyFilteredItem] }), { status: 200, headers: { "content-type": "application/json" } });
  const providerResult = await getShortVideoFeed({ refresh: true });
  assert.equal(providerResult.items.length, 1, "eligible provider item remains available");
  assert.equal(providerResult.filteredCount, 1, "structurally rejected provider item is retained in filteredCount");
  globalThis.fetch = originalFetch;
  if (configuredProvider) process.env.AUTHORIZED_SHORT_VIDEO_API_BASE = configuredProvider;
  console.log("short-video policy negative checks passed");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
