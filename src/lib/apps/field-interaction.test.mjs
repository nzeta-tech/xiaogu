import assert from "node:assert/strict";
import test from "node:test";
import { isCreationFieldVisible, pruneHiddenCreationValues, visibleCreationFields } from "./field-interaction.ts";

const fields = [
  { id: "mode", label: "方式", type: "radio", required: true, step: 1 },
  { id: "text", label: "文字", type: "textarea", required: true, step: 2, visibleWhen: [{ fieldId: "mode", equals: "text" }] },
  { id: "images", label: "原图", type: "file", required: true, step: 2, maxFiles: 3, visibleWhen: [{ fieldId: "mode", equals: "remix" }] },
  { id: "parser_payload", label: "解析数据", type: "text", presentation: "data" },
];

test("progressive fields reveal only the active required step", () => {
  assert.deepEqual(visibleCreationFields(fields, {}).map((field) => field.id), ["mode"]);
  assert.deepEqual(visibleCreationFields(fields, { mode: "text" }).map((field) => field.id), ["mode", "text"]);
  assert.deepEqual(visibleCreationFields(fields, { mode: "remix" }).map((field) => field.id), ["mode", "images"]);
});

test("data and inactive branch fields never appear or leak into submitted values", () => {
  const values = { mode: "text", text: "正文", images: ["old-image"], parser_payload: "trusted" };
  assert.equal(isCreationFieldVisible(fields[3], values), false);
  assert.deepEqual(pruneHiddenCreationValues(fields, values), { mode: "text", text: "正文", parser_payload: "trusted" });
});
