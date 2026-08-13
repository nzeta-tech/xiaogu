import assert from "node:assert/strict";
import test from "node:test";
import { isSupportedLinkRemixUrl, isWechatArticleUrl } from "./link-remix-source.ts";

test("accepts Douyin, Video Channels and WeChat article links", () => {
  assert.equal(isSupportedLinkRemixUrl("https://www.douyin.com/video/123"), true);
  assert.equal(isSupportedLinkRemixUrl("7.21 复制打开抖音 https://v.douyin.com/abc/"), true);
  assert.equal(isSupportedLinkRemixUrl("https://weixin.qq.com/sph/example"), true);
  assert.equal(isSupportedLinkRemixUrl("https://channels.weixin.qq.com/web/pages/feed"), true);
  assert.equal(isSupportedLinkRemixUrl("https://mp.weixin.qq.com/s/example"), true);
  assert.equal(isSupportedLinkRemixUrl("公众号分享 https://mp.weixin.qq.com/s?__biz=test&mid=1"), true);
  assert.equal(isWechatArticleUrl("https://mp.weixin.qq.com/s/example"), true);
});

test("rejects non-article WeChat pages, Xiaohongshu and unrelated URLs", () => {
  assert.equal(isSupportedLinkRemixUrl("https://mp.weixin.qq.com/"), false);
  assert.equal(isSupportedLinkRemixUrl("https://mp.weixin.qq.com/mp/profile_ext"), false);
  assert.equal(isWechatArticleUrl("http://mp.weixin.qq.com/s/example"), false);
  assert.equal(isSupportedLinkRemixUrl("https://www.xiaohongshu.com/explore/example"), false);
  assert.equal(isSupportedLinkRemixUrl("https://xhslink.com/example"), false);
  assert.equal(isSupportedLinkRemixUrl("https://example.com/video/123"), false);
});
