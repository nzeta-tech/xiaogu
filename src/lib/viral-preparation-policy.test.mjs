import test from "node:test";
import assert from "node:assert/strict";
import { buildViralCoverTask, viralPlatformPublishLimit, wrapCoverTitle } from "./viral-preparation-policy.ts";

test("Douyin keeps a useful natural pool while other platform limits stay bounded", () => {
  assert.equal(viralPlatformPublishLimit("抖音"), 30);
  assert.equal(viralPlatformPublishLimit("公众号"), 3);
  assert.equal(viralPlatformPublishLimit("视频号"), 3);
});

test("fallback cover titles are normalized and wrapped without losing content", () => {
  assert.deepEqual(wrapCoverTitle("  家庭保险   理赔避坑指南  ", 6), ["家庭保险 理", "赔避坑指南"]);
});

test("cover enrichment tasks are deduplicated and retry a controlled failure", () => {
  const task = buildViralCoverTask({ id: "content-id", source_url: "https://www.douyin.com/video/123", platform: "抖音", thumbnail_url: "https://img.example/cover.jpg" }, 2);
  assert.deepEqual(task, {
    taskType: "source.inspect",
    payload: { url: "https://www.douyin.com/video/123", userId: "local-agent", purpose: "viral_cover", viralContentId: "content-id", platform: "抖音", thumbnailUrl: "https://img.example/cover.jpg" },
    dedupeKey: "viral-cover:content-id",
    priority: 68,
    maxAttempts: 2,
  });
});
