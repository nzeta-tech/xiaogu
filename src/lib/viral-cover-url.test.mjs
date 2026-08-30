import test from "node:test";
import assert from "node:assert/strict";
import { buildViralCoverUrl } from "./viral-cover-url.ts";

test("viral cover URLs change when persisted image content changes", () => {
  const contentId = "content-id";
  assert.equal(buildViralCoverUrl(contentId, "aaaaaaaaaaaaaaaa1111"), "/api/viral-covers/content-id?v=aaaaaaaaaaaaaaaa");
  assert.equal(buildViralCoverUrl(contentId, "bbbbbbbbbbbbbbbb2222"), "/api/viral-covers/content-id?v=bbbbbbbbbbbbbbbb");
});

test("viral cover URLs remain usable for legacy rows without a hash", () => {
  assert.equal(buildViralCoverUrl("content-id", null), "/api/viral-covers/content-id");
});
