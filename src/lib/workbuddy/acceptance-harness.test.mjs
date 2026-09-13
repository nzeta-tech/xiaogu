import assert from "node:assert/strict";
import test from "node:test";
import { creationApps } from "../apps/catalog.ts";
import { WORKBUDDY_FUSION_CASES,REQUIRED_FUSION_TAGS } from "./acceptance-cases.ts";
import { evaluateAcceptance,summarizeAcceptance } from "./acceptance-harness.ts";
import { contractForCreationApp } from "./app-execution-contract.ts";
import { replayAcceptance } from "./acceptance-replay.ts";
import { buildConversationAppFields } from "./app-conversation.ts";

const output=(slotId,kind)=>({slotId,kind,artifactId:`artifact-${slotId}`,downloadUrl:["image","video","presentation"].includes(kind)?`/download/${slotId}`:undefined});

test("every visible creation app has an acceptance-ready output contract",()=>{
  assert.equal(creationApps.length,26);
  for(const app of creationApps){const contract=contractForCreationApp(app);assert.equal(contract.appSlug,app.slug);assert.ok(contract.defaultCount>=1);}
});

test("every application can build a chat-native handoff form without losing required fields",()=>{
  for(const app of creationApps){
    const fields=buildConversationAppFields(app,"真实上游素材：这是需要继续加工的正文与事实。");
    const ids=new Set(fields.map(field=>field.id));
    for(const field of app.fields.filter(item=>item.required))assert.ok(ids.has(field.id),`${app.slug} lost required field ${field.id}`);
    assert.equal(ids.size,fields.length,`${app.slug} contains duplicate form field ids`);
    for(const field of fields.filter(item=>item.required))assert.notEqual(field.initialValue,undefined,`${app.slug}.${field.id} has no deterministic initial state`);
  }
});

test("digital-human fusion is an explicit human-in-the-loop handoff",()=>{
  const app=creationApps.find(item=>item.slug==="digital-human-video");
  const contract=contractForCreationApp(app);
  assert.equal(contract.outputKind,"data");
  assert.equal(contract.retryStrategy,"interactive");
  const scenario=WORKBUDDY_FUSION_CASES.find(item=>item.id==="script-to-digital-human");
  assert.ok(scenario.tags.includes("human-in-loop"));
  assert.equal(scenario.expect.outputKind,"data");
});

test("fusion matrix covers every required risk dimension",()=>{
  const tags=new Set(WORKBUDDY_FUSION_CASES.flatMap(item=>item.tags));
  for(const tag of REQUIRED_FUSION_TAGS)assert.ok(tags.has(tag),`missing fusion tag ${tag}`);
  assert.ok(WORKBUDDY_FUSION_CASES.length>=18);
});

test("every declared application-fusion case has an executable passing trace",()=>{
  for(const scenario of WORKBUDDY_FUSION_CASES){
    const count=scenario.expect.invocationCount??1;
    const slots=scenario.expect.outputSlots??Array.from({length:scenario.expect.outputCount??0},(_,index)=>`${scenario.expect.outputKind??"text"}:${index+1}`);
    const outputs=slots.map(slot=>output(slot,scenario.expect.outputKind??"text"));
    const invocations=Array.from({length:count},(_,index)=>({
      capabilityId:scenario.expect.capabilityId,
      operation:scenario.expect.operation,
      idempotencyKey:`${scenario.id}-${index+1}`,
      pointsCost:index===0?scenario.expect.maxPoints??0:0,
      source:(scenario.expect.requiredSourceFragments??[]).join("\n")||"本轮用户真实素材",
      outputs:count===1?outputs:outputs.filter((_,outputIndex)=>outputIndex%count===index),
    }));
    const result=evaluateAcceptance(scenario,{route:{capabilityId:scenario.expect.capabilityId,operation:scenario.expect.operation},iterations:Math.min(2,scenario.expect.maxIterations??2),invocations,finalText:"成果已交付"});
    assert.equal(result.passed,true,`${scenario.id}: ${JSON.stringify(result.violations)}`);
  }
});

test("acceptance harness validates a complete two-script to two-cover trace",()=>{
  const scenario=WORKBUDDY_FUSION_CASES.find(item=>item.id==="scripts-to-video-covers");
  const result=evaluateAcceptance(scenario,{route:{capabilityId:"app.video-cover",operation:"transform"},iterations:2,invocations:[{capabilityId:"app.video-cover",operation:"transform",idempotencyKey:"run-step-1",pointsCost:5,source:"第一篇真实正文\n第二篇真实正文",outputs:[output("image:1","image"),output("image:2","image")]}],presentationText:"两张封面已生成"});
  assert.equal(result.passed,true,JSON.stringify(result.violations));
});

test("acceptance harness catches the production material-loss regression",()=>{
  const scenario=WORKBUDDY_FUSION_CASES.find(item=>item.id==="scripts-to-video-covers");
  const result=evaluateAcceptance(scenario,{route:{capabilityId:"app.video-cover",operation:"transform"},iterations:2,invocations:[{capabilityId:"app.video-cover",idempotencyKey:"one",pointsCost:5,source:"基于刚完成的两篇口播正文，分别生成封面",outputs:[output("image:1","image"),output("image:2","image")]}],presentationText:"完成"});
  assert.equal(result.passed,false);
  assert.ok(result.violations.some(item=>item.code==="source_missing"));
});

test("acceptance harness rejects protocol leakage, duplicate calls and missing downloads",()=>{
  const scenario={id:"guard",title:"guard",tags:[],expect:{capabilityId:"app.image-card",operation:"transform",invocationCount:1,maxPoints:5,outputSlots:["image:1"],outputKind:"image",outputCount:1,requireDownloads:true}};
  const result=evaluateAcceptance(scenario,{route:{capabilityId:"app.image-card",operation:"transform"},iterations:2,invocations:[{capabilityId:"app.image-card",idempotencyKey:"same",pointsCost:5,outputs:[{slotId:"image:1",kind:"image",artifactId:"a"}]},{capabilityId:"app.image-card",idempotencyKey:"same",pointsCost:5}],finalText:"[应用参数:image-card]"});
  assert.equal(result.passed,false);
  assert.deepEqual(new Set(result.violations.map(item=>item.code)),new Set(["invocation_count","points_budget","duplicate_idempotency_key","download_missing","protocol_leak"]));
  assert.equal(summarizeAcceptance([result]).failed,1);
});

test("runtime replay accepts a complete research to creation chain",async()=>{
  const scenario=WORKBUDDY_FUSION_CASES.find(item=>item.id==="research-to-traffic-copy");
  const replay=await replayAcceptance({
    testCase:scenario,
    actions:[{type:"tool_call",capabilityId:"app.traffic-copy",instruction:"生成口播",reason:"研究完成"},{type:"final",content:"可直接录制的口播正文",reason:"应用完成"}],
    toolResults:[{capabilityId:"app.traffic-copy",source:"《早春晴朗》\n已核验事实：8月26日开播",pointsCost:5,outputs:[output("text:1","text")]}],
  });
  assert.equal(replay.runtime.status,"completed");
  assert.equal(replay.acceptance.passed,true,JSON.stringify(replay.acceptance.violations));
});

test("runtime replay exposes partial multi-output delivery instead of hiding it",async()=>{
  const scenario=WORKBUDDY_FUSION_CASES.find(item=>item.id==="scripts-to-video-covers");
  const replay=await replayAcceptance({
    testCase:scenario,
    actions:[{type:"tool_call",capabilityId:"app.video-cover",instruction:"分别生成",reason:"制作封面"},{type:"final",content:"已完成",reason:"完成"}],
    toolResults:[{capabilityId:"app.video-cover",source:"第一篇真实正文\n第二篇真实正文",pointsCost:5,outputs:[output("image:1","image")]}],
  });
  assert.equal(replay.acceptance.passed,false);
  assert.ok(replay.acceptance.violations.some(item=>item.code==="output_count"));
  assert.ok(replay.acceptance.violations.some(item=>item.code==="output_slot_missing"));
});

test("runtime replay circuit-breaks identical stop-gate deficits",async()=>{
  const scenario={id:"stop-gate",title:"stop gate",tags:["fault"],expect:{capabilityId:null,maxIterations:4,invocationCount:0}};
  const replay=await replayAcceptance({testCase:scenario,actions:[{type:"final",content:"半成品",reason:"完成"},{type:"final",content:"仍是半成品",reason:"重试"}],toolResults:[],deliveryChecks:[{outcome:"continue",reason:"image:2 缺失"},{outcome:"continue",reason:"image:2 缺失"}]});
  assert.equal(replay.runtime.status,"failed");
  assert.equal(replay.runtime.iterations,2);
  assert.match(replay.runtime.errorSummary,/停止重复执行/);
});
