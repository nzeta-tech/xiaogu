import assert from "node:assert/strict";
import test from "node:test";
import { isSupportedLinkRemixUrl } from "./link-remix-source.ts";

test("accepts Douyin and Video Channels work links", () => {
  assert.equal(isSupportedLinkRemixUrl("https://www.douyin.com/video/123"), true);
  assert.equal(isSupportedLinkRemixUrl("7.21 复制打开抖音 https://v.douyin.com/abc/"), true);
  assert.equal(isSupportedLinkRemixUrl("https://weixin.qq.com/sph/example"), true);
  assert.equal(isSupportedLinkRemixUrl("https://channels.weixin.qq.com/web/pages/feed"), true);
});

test("rejects WeChat articles, Xiaohongshu and unrelated URLs", () => {
  assert.equal(isSupportedLinkRemixUrl("https://mp.weixin.qq.com/s/example"), false);
  assert.equal(isSupportedLinkRemixUrl("https://www.xiaohongshu.com/explore/example"), false);
  assert.equal(isSupportedLinkRemixUrl("https://xhslink.com/example"), false);
  assert.equal(isSupportedLinkRemixUrl("https://example.com/video/123"), false);
});
