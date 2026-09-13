import assert from "node:assert/strict";
import test from "node:test";
import { resolveConfiguredTextModel, XIAOGU_TEXT_MODEL } from "./model-config.ts";

test("uses gpt-5.6-terra as the unconfigured default", () => {
  const previous = process.env.MODEL_NAME;
  delete process.env.MODEL_NAME;
  try { assert.equal(resolveConfiguredTextModel(), "gpt-5.6-terra"); assert.equal(XIAOGU_TEXT_MODEL, "gpt-5.6-terra"); }
  finally { if (previous === undefined) delete process.env.MODEL_NAME; else process.env.MODEL_NAME = previous; }
});

test("preserves an explicit supported model override", () => {
  const previous = process.env.MODEL_NAME;
  process.env.MODEL_NAME = "custom-production-model";
  try { assert.equal(resolveConfiguredTextModel(), "custom-production-model"); }
  finally { if (previous === undefined) delete process.env.MODEL_NAME; else process.env.MODEL_NAME = previous; }
});

test("migrates the previous production model to terra", () => {
  process.env.MODEL_NAME = "gpt-5.6-sol";
  assert.equal(resolveConfiguredTextModel(), "gpt-5.6-terra");
  delete process.env.MODEL_NAME;
});
