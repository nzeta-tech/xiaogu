import assert from "node:assert/strict";
import test from "node:test";
import {auditRuntimeTasks} from "./runtime-audit.ts";

const task=(overrides={})=>({id:"t1",status:"completed",iteration:2,messages:[],invocations:[],...overrides});

test("runtime audit accepts a clean completed application trace",()=>{
  const result=auditRuntimeTasks([task({invocations:[{id:"i1",capabilityId:"app.video-cover",status:"completed",pointsCost:5,input:{values:{source:"第一篇真实正文，包含完整观点、论据和标题。".repeat(10)}},output:{contentJson:{images:[{url:"/1.png"}]}}}]})]);
  assert.equal(result.passed,true,JSON.stringify(result.issues));
});

test("runtime audit detects command-only material and successful work lost to loop exhaustion",()=>{
  const result=auditRuntimeTasks([task({status:"failed",iteration:9,errorMessage:"最大行动次数",invocations:[{id:"i1",capabilityId:"app.video-cover",status:"completed",pointsCost:5,input:{values:{source:"基于刚完成的两篇口播正文，分别生成视频封面"}},output:{contentJson:{images:[{url:"/1.png"}]}}}]})]);
  assert.deepEqual(new Set(result.issues.map(item=>item.code)),new Set(["loop_near_exhaustion","successful_work_lost","command_only_material"]));
});

test("runtime audit distinguishes estimated cost from verified failed-call billing",()=>{
  const invocation={capabilityId:"app.image-card",pointsCost:5,input:{values:{source:"真实素材"}},output:{content:"done"}};
  const result=auditRuntimeTasks([task({messages:[{role:"assistant",messageType:"delivery",content:"[应用参数:image-card]"}],invocations:[{...invocation,id:"i1",status:"failed"},{...invocation,id:"i2",status:"completed"}]})]);
  assert.ok(result.issues.some(item=>item.code==="duplicate_invocation"));
  assert.ok(result.issues.some(item=>item.code==="protocol_leak"));
  assert.ok(result.issues.some(item=>item.code==="failed_invocation_with_cost_estimate"&&item.severity==="warning"));
  assert.equal(result.issues.some(item=>item.code==="charged_failed_invocation"),false);
  const charged=auditRuntimeTasks([task({invocations:[{...invocation,id:"i3",status:"failed",usageCharged:5}]})]);
  assert.ok(charged.issues.some(item=>item.code==="charged_failed_invocation"&&item.severity==="error"));
});

test("runtime audit recognizes legacy nested contentJson batches as real output",()=>{
  const result=auditRuntimeTasks([task({invocations:[{id:"i1",capabilityId:"app.traffic-copy",status:"completed",pointsCost:5,input:{values:{source:"真实素材"}},output:{contentJson:{batches:[{items:[{body:"可交付的口播正文"}]}]}}}]})]);
  assert.equal(result.passed,true,JSON.stringify(result.issues));
});

test("runtime audit rejects billing on a cancelled Workbuddy invocation",()=>{
  const result=auditRuntimeTasks([{id:"cancelled",status:"cancelled",messages:[],invocations:[{id:"i-cancel",capabilityId:"app.video-script-polish",status:"cancelled",pointsCost:5,usageCharged:5,input:{source:"真实素材"},output:{}}]}]);
  assert.ok(result.issues.some(item=>item.code==="cancelled_but_charged"&&item.severity==="error"));
});
