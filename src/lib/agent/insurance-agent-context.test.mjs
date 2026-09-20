import assert from "node:assert/strict";
import test from "node:test";
import { selectAvatarMemoriesForContext, topicPositioningPersona } from "./creator-context.ts";

const memories = [
  { id:"1",category:"expression" },
  { id:"2",category:"identity" },
  { id:"3",category:"audience" },
  { id:"4",category:"expertise" },
  { id:"5",category:"story" },
  { id:"6",category:"boundary" },
  { id:"7",category:"temporary" },
];

test("none context sends no creator memories to independent editorial calls",()=>{
  assert.deepEqual(selectAvatarMemoriesForContext(memories,"none"),[]);
});

test("positioning context excludes expression and temporary writing memories",()=>{
  assert.deepEqual(selectAvatarMemoriesForContext(memories,"positioning").map((item)=>item.category),["identity","audience","expertise","story","boundary"]);
});

test("writing and full contexts preserve the available creator memory set",()=>{
  assert.equal(selectAvatarMemoriesForContext(memories,"writing").length,memories.length);
  assert.equal(selectAvatarMemoriesForContext(memories,"full").length,memories.length);
});

test("topic positioning keeps durable roles and expertise but gates all stories separately",()=>{
  assert.deepEqual(selectAvatarMemoriesForContext(memories,"topic-positioning").map((item)=>item.category),["identity","audience","expertise","boundary"]);
});

test("topic persona does not inherit a case embedded in the old positioning summary",()=>{
  const identity={core_identity:["家庭财务顾问"],life_roles:["三宝妈"],personal_story_anchor:"客户想买泰康养老社区",positioning_hint:"泰康养老社区案例"};
  assert.equal(topicPositioningPersona(identity),"家庭财务顾问 · 三宝妈");
});
