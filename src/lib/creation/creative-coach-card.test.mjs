import assert from "node:assert/strict";
import test from "node:test";
import {
  getNextVisibleCoachCount,
  getVisibleCoachCountForSelection,
  readCoachFeatureTags,
} from "./creative-coach-card.ts";

test("coach cards prefer differentiated feature tags over standard capabilities", () => {
  assert.deepEqual(readCoachFeatureTags({
    styleTags: ["复杂问题拆解", "家庭财富决策", "理性判断"],
    scenarios: ["IP定位", "内容创作", "获客增长"],
  }), ["复杂问题拆解", "家庭财富决策", "理性判断"]);
});

test("legacy cards fall back to scenarios and keep at most three unique tags", () => {
  assert.deepEqual(readCoachFeatureTags({ scenarios: ["跨境配置", "财富架构", "高净值家庭", "重复"] }), ["跨境配置", "财富架构", "高净值家庭"]);
  assert.deepEqual(readCoachFeatureTags({ styleTags: ["客户真问题", "客户真问题", "职业判断", "保险边界"] }), ["客户真问题", "职业判断", "保险边界"]);
});

test("coach selection expands exactly one three-card row at a time", () => {
  assert.equal(getNextVisibleCoachCount(3, 7), 6);
  assert.equal(getNextVisibleCoachCount(6, 7), 7);
  assert.equal(getNextVisibleCoachCount(7, 7), 7);
});

test("a restored selection expands enough rows to keep the selected coach visible", () => {
  const optionIds = ["m", "clear", "cross-border", "translator", "women", "family"];
  assert.equal(getVisibleCoachCountForSelection(3, ["default", "family"], optionIds), 9);
  assert.equal(getVisibleCoachCountForSelection(3, ["default", "clear"], optionIds), 3);
});
