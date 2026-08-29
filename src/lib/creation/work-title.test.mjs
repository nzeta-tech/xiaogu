import assert from "node:assert/strict";
import test from "node:test";
import { buildWorkTitle } from "./work-title.ts";

const buildTrafficTitle = (result, source = "景甜与孙宇晨事件") => buildWorkTitle({
  appName: "口播文案（流量型）",
  appSlug: "traffic-copy",
  values: { source },
  result,
});

test("traffic title skips internal coach and version headings", () => {
  assert.equal(buildTrafficTitle("## 小谷教练版\n\n景甜这次争议，真正值得家庭注意的不是输赢。"), "口播文案（流量型）｜景甜这次争议，真正值得家庭注意的不是输赢。");
  assert.equal(buildTrafficTitle("## Mo姐教练 · V8版\n\n资产很多，不代表随时有钱可用。"), "口播文案（流量型）｜资产很多，不代表随时有钱可用。");
});

test("traffic title does not expose a multi-coach version label", () => {
  assert.equal(buildTrafficTitle("默认的我版\n\n先把人物和事件说清楚，再谈家庭资产。"), "口播文案（流量型）｜先把人物和事件说清楚，再谈家庭资产。");
});

test("traffic title falls back to source when result has headings only", () => {
  assert.equal(buildTrafficTitle("# Mo姐教练版\n\n## 标题建议", "家庭现金流规划"), "口播文案（流量型）｜家庭现金流规划");
});

test("traffic title keeps one app prefix even when source repeats it", () => {
  assert.equal(buildTrafficTitle("", "口播文案（流量型）｜家庭现金流规划"), "口播文案（流量型）｜家庭现金流规划");
});
