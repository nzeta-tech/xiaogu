import { test } from "node:test";
import assert from "node:assert/strict";
import { SPOKEN_VIDEO_PRICES, spokenVideoPrice } from "./spoken-video-modes.ts";

test("spoken-video editions keep their server-side completion prices", () => {
  assert.deepEqual(SPOKEN_VIDEO_PRICES, { basic: 30, smart: 50 });
  assert.equal(spokenVideoPrice("basic"), 30);
  assert.equal(spokenVideoPrice("smart"), 50);
});
