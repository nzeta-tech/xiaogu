import test from "node:test";
import assert from "node:assert/strict";
import { resolveTrafficCoverSource } from "./traffic-cover-source.ts";

test("restores the selected creator batch for a traffic cover", () => {
  const work = {
    content: "完整父作品",
    content_json: {
      batches: [
        { id: "default", items: [{ body: "默认版本" }] },
        { id: "creator-2", items: [{ body: "分身版本" }] },
      ],
    },
  };
  assert.equal(resolveTrafficCoverSource(work, "creator-2"), "分身版本");
});

test("falls back to the first batch and then the persisted parent content", () => {
  assert.equal(resolveTrafficCoverSource({ content: "父作品", content_json: { batches: [{ id: "default", items: [{ body: "默认版本" }] }] } }, "missing"), "默认版本");
  assert.equal(resolveTrafficCoverSource({ content: "父作品", content_json: { batches: [] } }, "missing"), "父作品");
});
