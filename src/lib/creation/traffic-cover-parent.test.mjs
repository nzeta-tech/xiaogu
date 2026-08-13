import test from "node:test";
import assert from "node:assert/strict";
import { isTrafficCoverParentWork } from "./traffic-cover-parent.ts";

test("normal traffic copy remains a valid video-cover parent", () => {
  assert.equal(isTrafficCoverParentWork({ platform: "traffic-copy" }), true);
});

test("link remix is a video-cover parent only when its target is traffic copy", () => {
  assert.equal(isTrafficCoverParentWork({ platform: "link-remix", app_run: { input_payload: { remix_target: "traffic-copy" } } }), true);
  assert.equal(isTrafficCoverParentWork({ platform: "link-remix", content_json: { remixTarget: "traffic-copy" } }), true);
  assert.equal(isTrafficCoverParentWork({ platform: "link-remix", app_run: { input_payload: { remix_target: "wechat-studio" } } }), false);
});

test("unrelated formal apps cannot receive a traffic cover", () => {
  assert.equal(isTrafficCoverParentWork({ platform: "wechat-studio" }), false);
  assert.equal(isTrafficCoverParentWork(null), false);
});
