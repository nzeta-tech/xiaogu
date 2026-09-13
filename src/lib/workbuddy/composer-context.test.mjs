import assert from "node:assert/strict";
import test from "node:test";
import { selectedWorkbuddyCapabilityId,serializeWorkbuddyComposerContext } from "./composer-context.ts";

const items=[
  {id:"selected-skill",type:"file",label:"数字人视频",meta:"Skill",content:"用户已明确选择应用 Skill。能力 ID：app.digital-human-video。请优先调用。"},
  {id:"work-1",type:"work",label:"真实口播",meta:"口播",content:"早春晴朗，家庭重新整理生活节奏。"},
];

test("selected Skill travels as routing data and never leaks into application material",()=>{
  assert.equal(selectedWorkbuddyCapabilityId(items),"app.digital-human-video");
  const context=serializeWorkbuddyComposerContext(items,type=>type==="work"?"创作历史":"本地文件");
  assert.match(context,/真实口播/);
  assert.match(context,/早春晴朗/);
  assert.doesNotMatch(context,/能力 ID|数字人视频|selected-skill/);
});
