import assert from "node:assert/strict";
import { classifyShortVideo, normalizeProviderItem } from "../src/lib/short-videos/catalog";
import type { ProviderItem } from "../src/lib/short-videos/catalog";

const authorizedMetadata: ProviderItem = {
  id: "tiktok-oembed-fixture",
  title: "家庭保障结构参考",
  platform: "tiktok",
  source_url: "https://www.tiktok.com/@example/video/123",
  published_at: "2026-07-20T00:00:00Z",
  authorized: true,
  rights_basis: "platform_embed",
  rights_scope: "embed_only",
  attribution: "原作者与 TikTok",
  platform_policy_checked_at: "2026-07-21T00:00:00Z",
};

const withVerifiedFixture: ProviderItem = {
  ...authorizedMetadata,
  metrics: { views: 42, statistics_at: "2026-07-22T00:00:00Z" },
  fact_status: "human_verified",
  fact_type: "policy_term",
  fact_claims: ["示例事实"],
  evidence: [{
    officialUrl: "https://example.invalid/official-evidence",
    institution: "官方机构",
    publishedAt: "2026-07-19T00:00:00Z",
    excerpt: "固定 fixture 证据",
  }],
  jurisdiction: "CN",
  effective_at: "2026-07-19T00:00:00Z",
  reviewed_at: "2026-07-21T00:00:00Z",
  reviewer_id: "fixture-reviewer",
};

const wechatFixture: ProviderItem = {
  ...withVerifiedFixture,
  id: "wechat-channels-fixture",
  platform: "wechat_channels",
  platform_adapter: "wechat_channels_official",
  source_url: "https://channels.weixin.qq.com/example/video/1",
};

const metadataOnly = normalizeProviderItem(authorizedMetadata);
assert.equal(metadataOnly.metrics.statisticsAt, "", "oEmbed metadata must not invent statistics time");
assert.equal(classifyShortVideo(metadataOnly), "filtered", "metadata without statistics is not a ranking item");

const displayableEmbed = normalizeProviderItem(withVerifiedFixture);
assert.equal(displayableEmbed.compliance.status, "displayable");
assert.equal(displayableEmbed.compliance.rightsScope, "embed_only");

const displayableWechat = normalizeProviderItem(wechatFixture);
assert.equal(displayableWechat.platformAdapter, "wechat_channels_official");
assert.equal(displayableWechat.compliance.status, "displayable", "authorized WeChat Channels fixture passes the same gates");
assert.equal(
  classifyShortVideo(normalizeProviderItem({ ...wechatFixture, platform_adapter: "douyin_official" })),
  "filtered",
  "cross-platform adapter mismatch must be filtered",
);

assert.equal(
  classifyShortVideo(normalizeProviderItem({ ...withVerifiedFixture, metrics: undefined })),
  "filtered",
  "missing provider statistics must be filtered, never fabricated",
);

console.log("official-source fixture checks passed");
