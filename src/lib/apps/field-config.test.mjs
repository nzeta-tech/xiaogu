import assert from "node:assert/strict";
import test from "node:test";
import { hydrateCreationFieldConfig, serializeCreationFieldConfig } from "./field-config.ts";

test("advanced application field configuration survives database round-trip", () => {
  const field = {
    id: "mode", label: "方式", type: "radio", inheritedSourceValue: "rewrite",
    visibleWhen: [{ fieldId: "source", hasValue: true }], visibleWhenAny: [{ fieldId: "kind", equals: "text" }],
    revealAfter: ["source"], presentation: "data", step: 3, maxFiles: 4, maxLength: 6000, multiple: true, accept: "image/*",
  };
  assert.deepEqual(hydrateCreationFieldConfig(serializeCreationFieldConfig(field)), {
    accept: "image/*", multiple: true, maxLength: 6000, maxFiles: 4,
    visibleWhen: field.visibleWhen, visibleWhenAny: field.visibleWhenAny, revealAfter: ["source"],
    presentation: "data", step: 3, inheritedSourceValue: "rewrite",
  });
});

test("legacy database rows inherit newly declared registry constraints", () => {
  const fallback = { id: "mode", label: "方式", type: "radio", inheritedSourceValue: "rewrite", visibleWhen: [{ fieldId: "source", hasValue: true }] };
  const hydrated = hydrateCreationFieldConfig({ multiple: false }, fallback);
  assert.equal(hydrated.inheritedSourceValue, "rewrite");
  assert.deepEqual(hydrated.visibleWhen, fallback.visibleWhen);
});
