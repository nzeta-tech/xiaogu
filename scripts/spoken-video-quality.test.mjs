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
