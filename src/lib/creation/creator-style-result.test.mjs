import assert from "node:assert/strict";
import test from "node:test";
import { buildPersistedCreatorStyleText } from "./creator-style-result.ts";

test("multiple coach outputs retain visible version headings", () => {
  const result = buildPersistedCreatorStyleText([
    { id: "default", label: "小谷教练", content: "小谷正文" },
    { id: "mo", label: "Mo姐", content: "Mo姐正文" },
  ]);
  assert.match(result, /## 小谷教练版/);
  assert.match(result, /## Mo姐版/);
});

test("single coach output stays clean", () => {
  assert.equal(buildPersistedCreatorStyleText([{ id: "default", label: "小谷教练", content: "正文" }]), "正文");
});
