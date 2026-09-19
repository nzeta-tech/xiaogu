import { test } from "node:test";
import assert from "node:assert/strict";
import { reviewFrameTimes } from "./spoken-video-quality.mjs";

test("quality contact sheet samples every material section and the presenter", () => {
  const times=reviewFrameTimes([{text:"甲".repeat(40)},{text:"乙".repeat(40)},{text:"丙".repeat(40)}],60,.6);
  assert.equal(times.length,6);
  assert.ok(times.every(time=>time>0&&time<60));
  assert.ok(times.some(time=>time>10&&time<20));
  assert.ok(times.some(time=>time>30&&time<40));
  assert.ok(times.some(time=>time>50&&time<60));
  assert.ok(times.some(time=>time>4&&time<8));
  assert.ok(times.some(time=>time>24&&time<28));
  assert.ok(times.some(time=>time>44&&time<48));
});

test("semantic timeline quality sampling follows ordered beat midpoints", () => {
  const times=reviewFrameTimes([
    {text:"开场观点",intent:"anchor",layout:"presenter"},
    {text:"数据证据",intent:"evidence",layout:"presenter-pip"},
    {text:"生活场景",intent:"scene",layout:"fullscreen"},
  ],30,.6);
  assert.equal(times.length,3);
  assert.ok(times[0]<times[1]&&times[1]<times[2]);
  assert.ok(times.every(time=>time>0&&time<30));
});
