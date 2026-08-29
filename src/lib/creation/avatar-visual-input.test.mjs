import assert from "node:assert/strict";
import test from "node:test";

import { creationNeedsAvatarPhoto } from "./avatar-visual-input.ts";

test("video cover requires a selected or uploaded portrait when person mode is enabled", () => {
  assert.equal(creationNeedsAvatarPhoto({ appSlug: "video-cover", values: { avatar_visual_mode: "yes" } }), true);
  assert.equal(creationNeedsAvatarPhoto({ appSlug: "video-cover", values: { avatar_visual_mode: "no" } }), false);
});

test("existing avatar-enabled image workflows retain their behavior", () => {
  assert.equal(creationNeedsAvatarPhoto({ appSlug: "image-card", values: { draw_portrait: "yes" } }), true);
  assert.equal(creationNeedsAvatarPhoto({ appSlug: "wechat-images", values: { avatar_visual_mode: "yes" } }), true);
  assert.equal(creationNeedsAvatarPhoto({ appSlug: "wechat-cover", values: { avatar_visual_mode: "yes" }, isXiaohongshuStudioAssetStep: true }), true);
});

test("linked image-card edits reuse the selected result as their visual reference", () => {
  assert.equal(creationNeedsAvatarPhoto({
    appSlug: "image-card",
    values: {
      creation_mode: "image_remix",
      draw_portrait: "yes",
      reference_image: "data:image/png;base64,linked-result",
      source_work_id: "work-1",
      source_image_id: "image-1",
    },
  }), false);

  assert.equal(creationNeedsAvatarPhoto({
    appSlug: "image-card",
    values: {
      creation_mode: "image_remix",
      draw_portrait: "yes",
      reference_image: "data:image/png;base64,ordinary-remix",
    },
  }), true);
});
