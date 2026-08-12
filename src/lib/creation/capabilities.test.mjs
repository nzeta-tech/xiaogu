import assert from "node:assert/strict";
import test from "node:test";

import { normalizeRemixCapability, remixCapabilityLabel, remixCapabilityOptions } from "./capabilities.ts";

test("exposes each reusable remix creation capability once", () => {
  assert.deepEqual(remixCapabilityOptions.map((item) => item.value), [
    "traffic-copy",
    "wechat-studio",
    "xiaohongshu-studio",
    "moments",
  ]);
  assert.equal(new Set(remixCapabilityOptions.map((item) => item.value)).size, remixCapabilityOptions.length);
});

test("normalizes invalid targets to the stable WeChat default", () => {
  assert.equal(normalizeRemixCapability("traffic-copy"), "traffic-copy");
  assert.equal(normalizeRemixCapability("unknown"), "wechat-studio");
  assert.equal(remixCapabilityLabel("xiaohongshu-studio"), "小红书笔记");
});
