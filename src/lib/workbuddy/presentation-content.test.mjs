import assert from "node:assert/strict";
import test from "node:test";
import { splitAncillaryResearchSection } from "./presentation-content.ts";

test("research references are separated from the main answer", () => {
  const result = splitAncillaryResearchSection("结论在这里。\n\n**参考来源与核验状态**\n媒体A\nhttps://example.com");
  assert.equal(result.main, "结论在这里。");
  assert.equal(result.ancillary?.title, "参考来源与核验状态");
  assert.match(result.ancillary?.content ?? "", /example\.com/);
});

test("ordinary headings remain in the answer", () => {
  const content = "## 事件经过\n正文";
  assert.deepEqual(splitAncillaryResearchSection(content), { main: content });
});
