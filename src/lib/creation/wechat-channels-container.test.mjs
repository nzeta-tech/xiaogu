import assert from "node:assert/strict";
import test from "node:test";
import { parseResolvedWechatChannelsMedia } from "./wechat-channels-container.ts";

test("accepts a signed finder media URL with a numeric decrypt key", () => {
  const result = parseResolvedWechatChannelsMedia({
    data: {
      resolved: [{
        url: "https://finder.video.qq.com/example/stodownload?token=temporary",
        key: "123456789",
        title: "作品标题",
        authorName: "作者",
        coverUrl: "https://finder.video.qq.com/example/cover.jpg",
      }],
    },
  });

  assert.equal(result?.decryptKey, "123456789");
  assert.equal(result?.author, "作者");
});

test("rejects media URLs outside the finder CDN allowlist", () => {
  const result = parseResolvedWechatChannelsMedia({
    data: { resolved: [{ url: "https://example.com/video.mp4", key: "123" }] },
  });

  assert.equal(result, null);
});

test("rejects non-numeric decrypt keys", () => {
  const result = parseResolvedWechatChannelsMedia({
    data: { resolved: [{ url: "https://finder.video.qq.com/video", key: "not-a-key" }] },
  });

  assert.equal(result, null);
});
