import assert from "node:assert/strict";
import test from "node:test";
import { normalizeImageCardStyles, toggleImageCardStyle } from "./image-card-styles.ts";

test("keeps one to three unique image-card styles in user order", () => {
  assert.deepEqual(normalizeImageCardStyles(["illustration", "business", "illustration", "zen"]), ["illustration", "business", "zen"]);
  assert.deepEqual(normalizeImageCardStyles("illustration"), ["illustration"]);
});

test("blocks a fourth style and permits deselection", () => {
  const full = ["illustration", "business", "zen"];
  assert.deepEqual(toggleImageCardStyle(full, "magazine"), { styles: full, limitReached: true });
  assert.deepEqual(toggleImageCardStyle(full, "business"), { styles: ["illustration", "zen"], limitReached: false });
});
