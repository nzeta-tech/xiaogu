import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSpokenPresenterRequest } from "./spoken-video-motion.mjs";

const payload = { title: "Presenter", script: "原始口播文案", voiceId: "existing-voice", aspectRatio: "9:16" };

test("photo request preserves narration and voice while constraining held objects and gesture cadence", () => {
  const request = buildSpokenPresenterRequest(payload, { type: "image" }, "uploaded-photo");
  assert.deepEqual(request.image, { type: "asset_id", asset_id: "uploaded-photo" });
  assert.equal(request.script, payload.script);
  assert.equal(request.voice_id, payload.voiceId);
  assert.equal(request.expressiveness, "low");
  assert.match(request.motion_prompt, /If a hand holds an object/);
  assert.match(request.motion_prompt, /Only an empty hand already visible/);
  assert.match(request.motion_prompt, /return to a relaxed resting pose, and pause/);
  assert.match(request.motion_prompt, /both hands are occupied/);
  assert.match(request.motion_prompt, /facial proportions/);
  assert.equal(request.engine, undefined);
});

test("existing avatar path omits unsupported photo-only motion settings", () => {
  const request = buildSpokenPresenterRequest(payload, { type: "avatar", avatarId: "existing-avatar" });
  assert.equal(request.avatar_id, "existing-avatar");
  assert.equal(request.motion_prompt, undefined);
  assert.equal(request.expressiveness, undefined);
  assert.equal(request.image, undefined);
  assert.equal(request.script, payload.script);
});

test("missing uploaded photo fails before creating a provider video request", () => {
  assert.throws(() => buildSpokenPresenterRequest(payload, { type: "image" }), /Invalid/);
});
