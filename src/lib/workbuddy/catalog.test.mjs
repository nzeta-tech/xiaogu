import assert from "node:assert/strict";
import test from "node:test";

import { workbuddyTemplates } from "./catalog.ts";

test("homepage recommendations include the video creation workflow", () => {
  assert.deepEqual(workbuddyTemplates.map((item) => item.title), ["视频创作", "内容获客", "客户跟进", "资料分析", "经营复盘", "深度研究"]);
  assert.deepEqual(workbuddyTemplates.map((item) => item.scenario), ["video", "content", "customer", "product", "team", "research"]);
});
