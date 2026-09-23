import assert from "node:assert/strict";
import test from "node:test";
import { guardPositioningTopic, positioningConstraints, selectTopicStories, storyFragments } from "./traffic-topic-positioning.ts";
import { parseTrafficTopicArena } from "./traffic-topic-arena.ts";

// Regression: a duplicated customer case became the default sixth topic across
// unrelated source rounds. Synthetic fixtures only; no customer records.
const memories = [
  {id:"one",category:"story",content:"客户想买泰康养老社区"},
  {id:"two",category:"story",content:"客户想买泰康养老社区；曾帮助客户比较买房收租与现金流方案"},
  {id:"three",category:"expertise",content:"家庭现金流规划"},
];
const topics = () => parseTrafficTopicArena(JSON.stringify({topics:Array.from({length:6},(_,i)=>({title:`素材方向${i+1}`,coreQuestion:`本轮问题${i+1}`,workingThesis:`独立判断${i+1}`}))}),6);
const pass = JSON.stringify({sourceRelated:true,grounded:true,brandAllowed:true,distinct:true,reasons:[]});
const fail = JSON.stringify({sourceRelated:false,grounded:true,brandAllowed:false,distinct:false,reasons:["旧案例品牌不属于当前素材，且核心问题重复"]});

test("duplicate case fragments count once even inside a mixed memory",()=>{
  assert.deepEqual(storyFragments(memories).map(x=>x.content),["客户想买泰康养老社区","曾帮助客户比较买房收租与现金流方案"]);
});

test("selection only admits exact, known source excerpts and removes nested duplicates",async()=>{
  const selected=await selectTopicStories("养老社区",memories,async()=>JSON.stringify({selections:[{id:"case-1",excerpt:"客户想买泰康养老社区"},{id:"case-1",excerpt:"想买泰康养老社区"}]}));
  assert.deepEqual(selected,["客户想买泰康养老社区"]);
  assert.deepEqual(await selectTopicStories("汇率",memories,async()=>JSON.stringify({selections:[{id:"fake",excerpt:"编造客户经历"},{id:"case-1",excerpt:"客户已经入住泰康养老社区"}]})),[]);
});

test("unrelated materials can omit cases; explicit brand source can retain its actual case",async()=>{
  for(const source of ["人民币升值对家庭币种配置的影响","欧美日加息，中国为什么不跟","被动收入与资产流动性","孙宇晨设立科学悬赏"]){
    assert.deepEqual(await selectTopicStories(source,memories,async(prompt,mode)=>{
      assert.equal(mode,"none");assert.ok(prompt.includes(source));
      assert.match(prompt,/不能仅因都涉及钱/);
      return '{"selections":[]}';
    }),[]);
  }
  assert.deepEqual(await selectTopicStories("讨论泰康养老社区是否适合家庭",memories,async()=>'{"selections":[{"id":"case-1","excerpt":"客户想买泰康养老社区"}]}'),["客户想买泰康养老社区"]);
});

test("selector errors or invalid JSON never restore unrestricted stories",async()=>{
  for(const model of [async()=>{throw new Error("timeout")},async()=>"not json",async()=>"null"]){
    assert.deepEqual(await selectTopicStories("汇率",memories,model),[]);
  }
});

test("positioning prioritizes source and expertise without mandatory stories or cross-round novelty",()=>{
  const prompt=positioningConstraints([]);
  assert.match(prompt,/不要求引用个人案例或出现品牌/);
  assert.match(prompt,/允许重复生成同一主题/);
  assert.doesNotMatch(prompt,/最近10轮|近期选题|只用于避重/);
});

test("repeated requests may return the same suitable sixth topic without a continuation instruction",async()=>{
  const original=topics();
  let calls=0;
  for(let round=0;round<2;round++){
    const result=await guardPositioningTopic({source:"家庭现金流",topics:original,stories:[],model:async(prompt)=>{
      calls++;assert.doesNotMatch(prompt,/最近10轮|近期选题|明确要求继续深挖/);return pass;
    }});
    assert.equal(result.status,"passed");assert.equal(result.topics[5],original[5]);
  }
  assert.equal(calls,2);
});

test("passed candidate is preserved without regeneration",async()=>{
  const original=topics();let calls=0;
  const result=await guardPositioningTopic({source:"汇率",topics:original,stories:[],model:async(prompt,mode)=>{
    calls++;assert.equal(mode,"topic-positioning");assert.ok(prompt.includes(original[0].coreQuestion));return pass;
  }});
  assert.equal(calls,1);assert.equal(result.status,"passed");assert.equal(result.topics,original);
});

test("failed sixth is replaced and re-reviewed while first five stay identical",async()=>{
  const original=topics();const responses=[fail,JSON.stringify({topics:[{title:"人民币升值后，家庭换汇预算如何分层？",coreQuestion:"留学刚需与投资换汇如何区别",workingThesis:"按用途和付款时间安排币种"}]}),pass];
  const result=await guardPositioningTopic({source:"人民币升值",topics:original,stories:[],model:async()=>responses.shift()});
  assert.equal(result.status,"regenerated");assert.equal(responses.length,0);
  for(let i=0;i<5;i++)assert.equal(result.topics[i],original[i]);
  assert.equal(result.topics[5].id,"topic-6");assert.equal(result.topics[5].selectionRole,"positioning_wildcard");
  assert.match(result.topics[5].title,/换汇预算/);
});

test("same brand remains allowed on a related source when review passes",async()=>{
  const original=topics();original[5].title="泰康养老社区的服务需求如何评估？";
  const result=await guardPositioningTopic({source:"泰康养老社区服务",topics:original,stories:["客户想买泰康养老社区"],model:async()=>pass});
  assert.match(result.topics[5].title,/泰康/);
});

test("persistent invalid/repeated sixth fails explicitly after one bounded retry",async()=>{
  let calls=0;
  await assert.rejects(()=>guardPositioningTopic({source:"汇率",topics:topics(),stories:[],model:async()=>{
    calls++;return calls===2?JSON.stringify({topics:[{title:"改标题仍讲养老社区",coreQuestion:"买社区会不会占用未来生活费",workingThesis:"先看长期生活费够不够，再买社区"}]}):fail;
  }}),/未通过素材相关性或本轮题目区分检查/);
  assert.equal(calls,3);
});

test("sixth topic still cannot duplicate a first-five topic within the same batch",async()=>{
  const original=topics();Object.assign(original[5],original[0],{title:"换一个全新标题"});let calls=0;
  const result=await guardPositioningTopic({source:"汇率",topics:original,stories:[],model:async(prompt)=>{
    calls++;
    if(calls===1){assert.match(prompt,/和本轮前5题相同/);return JSON.stringify({topics:[{title:"换汇预算",coreQuestion:"留学缴费如何分批换汇",workingThesis:"依付款日期分层"}]});}
    return pass;
  }});
  assert.equal(calls,2);assert.equal(result.status,"regenerated");
});

test("missing review fields and outages fail closed, never become a selectable placeholder",async()=>{
  for(const response of ['{}','{"sourceRelated":true,"grounded":true,"brandAllowed":true}',"not json"]){
    await assert.rejects(()=>guardPositioningTopic({source:"汇率",topics:topics(),stories:[],model:async()=>response}),/未通过/);
  }
  await assert.rejects(()=>guardPositioningTopic({source:"汇率",topics:topics(),stories:[],model:async()=>{throw new Error("timeout")}}),/未通过/);
});
