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

test("multi-topic output keeps drafts that still need review", () => {
  const result = buildPersistedCreatorStyleText([
    { id: "topic-1", label: "选题一 · 小谷教练", content: "第一篇完整草稿", reviewStatus: "needs_review", reviewIssues: ["结尾偏离主题"] },
    { id: "topic-2", label: "选题二 · 李璞IFA", content: "第二篇成稿", reviewStatus: "approved" },
  ]);
  assert.match(result, /选题一.+待复核/);
  assert.match(result, /第一篇完整草稿/);
  assert.match(result, /结尾偏离主题/);
  assert.match(result, /第二篇成稿/);
});
