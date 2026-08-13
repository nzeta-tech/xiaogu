import test from "node:test";
import assert from "node:assert/strict";
import { readCreationDraft } from "./creation-draft-state.ts";

function storageWith(value) {
  let current = value;
  return {
    getItem: () => current,
    removeItem: () => { current = null; },
    value: () => current,
  };
}

test("a fresh creation clears historical form text", () => {
  const storage = storageWith(JSON.stringify({ source: "上次输入" }));
  assert.equal(readCreationDraft(storage, "creation-draft:write-copy", false), null);
  assert.equal(storage.value(), null);
});

test("an explicit restore entry keeps the unfinished draft", () => {
  const storage = storageWith(JSON.stringify({ source: "待继续编辑" }));
  assert.deepEqual(readCreationDraft(storage, "creation-draft:write-copy", true), { source: "待继续编辑" });
  assert.notEqual(storage.value(), null);
});

test("a malformed historical draft is discarded", () => {
  const storage = storageWith("not-json");
  assert.equal(readCreationDraft(storage, "creation-draft:write-copy", true), null);
  assert.equal(storage.value(), null);
});
