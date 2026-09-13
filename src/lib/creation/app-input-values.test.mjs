import assert from "node:assert/strict";
import test from "node:test";
import { getCreationAppBySlug } from "../apps/catalog.ts";
import { buildCreationAppConversationValues, createCreationAppInitialValues } from "./app-input-values.ts";

test("plaza and conversation entries share application defaults", () => {
  assert.deepEqual(createCreationAppInitialValues(getCreationAppBySlug("write-copy")).targets, ["video_script", "xiaohongshu", "wechat_article", "moments"]);
  assert.equal(createCreationAppInitialValues(getCreationAppBySlug("link-remix")).remix_target, "traffic-copy");
});

test("conversation source only fills material fields", () => {
  const values = buildCreationAppConversationValues(getCreationAppBySlug("xiaohongshu-studio"), "梅艳芳信托素材");
  assert.equal(values.topic, "梅艳芳信托素材");
  assert.equal(values.creation_mode, "");
  assert.equal(values.length_mode, "");
});
