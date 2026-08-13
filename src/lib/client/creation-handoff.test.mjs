import test from "node:test";
import assert from "node:assert/strict";
import { consumeCreationHandoff, saveCreationHandoff } from "./creation-handoff.ts";

function memoryStorage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
}

test("creation handoff keeps long content out of the URL and consumes it once", () => {
  const storage = memoryStorage();
  const prompt = "长正文".repeat(10_000);
  saveCreationHandoff(storage, "video-cover", { prompt, source_style_label: "默认的我" });
  assert.deepEqual(consumeCreationHandoff(storage, "video-cover"), { prompt, source_style_label: "默认的我" });
  assert.deepEqual(consumeCreationHandoff(storage, "video-cover"), {});
});

test("malformed handoff state is discarded", () => {
  const storage = memoryStorage();
  storage.setItem("creation-handoff:write-copy", "invalid");
  assert.deepEqual(consumeCreationHandoff(storage, "write-copy"), {});
});
