import assert from "node:assert/strict";
import test from "node:test";
import {decomposeWorkbuddyMaterial} from "./material-envelope.ts";

test("separates inline source material from creation constraints",()=>{
  const result=decomposeWorkbuddyMaterial("润色这段真实口播：早春晴朗，家庭也该重新整理生活节奏。不要改变核心观点。");
  assert.equal(result.material,"早春晴朗，家庭也该重新整理生活节奏。");
  assert.match(result.instruction,/润色这段真实口播/);
  assert.match(result.instruction,/不要改变核心观点/);
  assert.doesNotMatch(result.formatted,/持续对话状态|能力 ID/);
});

test("does not split URLs or unstructured source text",()=>{
  assert.equal(decomposeWorkbuddyMaterial("读取 https://example.com/a:b").material,"读取 https://example.com/a:b");
  assert.equal(decomposeWorkbuddyMaterial("这是一段没有控制前缀的完整正文。").formatted,"这是一段没有控制前缀的完整正文。");
});
