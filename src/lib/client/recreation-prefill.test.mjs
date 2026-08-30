import assert from "node:assert/strict";
import test from "node:test";
import { normalizeRecreationInputPayload } from "./recreation-prefill.ts";

test("restores persisted string and multiselect inputs", () => {
  assert.deepEqual(normalizeRecreationInputPayload({ source: "原始内容", style: ["illustration", "business"], ratio: "3:4" }), {
    source: "原始内容", style: ["illustration", "business"], ratio: "3:4",
  });
});

test("drops nested, numeric and malformed persisted values", () => {
  assert.deepEqual(normalizeRecreationInputPayload({ source: "内容", unsafe: { token: "x" }, count: 3, mixed: ["ok", 2] }), { source: "内容" });
});
