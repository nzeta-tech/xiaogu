import test from "node:test";
import assert from "node:assert/strict";
import { buildPersistedCreatorStyleText } from "./creator-style-result.ts";

test("persists creator-style bodies without streaming status notices", () => {
  const persisted = buildPersistedCreatorStyleText([
    { id: "default", label: "默认的我", content: "  第一篇口播  " },
    { id: "custom-v2", label: "谷老师 · V2", content: "第二篇口播\n" },
  ]);

  assert.equal(persisted, "第一篇口播\n\n第二篇口播");
  assert.equal(persisted.includes("正在生成"), false);
});

test("drops empty creator-style bodies from persisted text", () => {
  assert.equal(buildPersistedCreatorStyleText([
    { id: "default", label: "默认的我", content: "" },
    { id: "custom-v1", label: "花花姐 · V1", content: "有效正文" },
  ]), "有效正文");
});
