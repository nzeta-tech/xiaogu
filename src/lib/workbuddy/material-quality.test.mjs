import test from "node:test";
import assert from "node:assert/strict";
import { isOperationalOnlyMaterial, stripOperationalMaterial } from "./material-quality.ts";

test("delivery gate messages cannot become downstream app material", () => {
  const input = "已按 documentary 风格生成 1 张 3:4 图片。\n\n交付门禁：wechat-images 应交付 4 个 image 成果，当前只有 1 个，还缺 3 个。\n\n缺失输出槽位：image:2。";
  assert.equal(stripOperationalMaterial(input), "");
  assert.equal(isOperationalOnlyMaterial(input), true);
});
test("real article material survives operational filtering", () => {
  const input = "40年房贷不是把月供变小这么简单。它把一个家庭的现金流承诺拉长到了下一代。\n\n交付门禁：还缺 1 个。";
  assert.match(stripOperationalMaterial(input), /家庭的现金流/);
  assert.equal(isOperationalOnlyMaterial(input), false);
});
