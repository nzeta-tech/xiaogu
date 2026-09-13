import assert from "node:assert/strict";
import test from "node:test";
import { buildXiaohongshuAssetsFields, normalizeXiaohongshuAssetsParameters } from "./xiaohongshu-assets-contract.ts";

test("xiaohongshu asset form preserves the selected parent work", () => {
  const fields = buildXiaohongshuAssetsFields("create", "work-1");
  assert.equal(fields.find(field => field.id === "parent_work_id")?.initialValue, "work-1");
  assert.equal(fields.find(field => field.id === "visual_style")?.initialValue, "daily-sign");
  assert.equal(fields.find(field => field.id === "cover_type")?.initialValue, "xhs-bold-text");
  assert.ok(fields.find(field => field.id === "visual_style")?.options?.every(option => option.previewUrl));
  assert.ok(fields.find(field => field.id === "cover_type")?.options?.every(option => option.previewUrl));
});

test("xiaohongshu asset parameters are allow-listed and retain continuation", () => {
  const value = normalizeXiaohongshuAssetsParameters({ visual_style: "study", cover_type: "xhs-checklist", ratio: "9:16", parent_work_id: "work-1" });
  assert.deepEqual(value, { visual_style: "study", cover_type: "xhs-checklist", ratio: "3:4", parent_work_id: "work-1" });
});
