// Live prompt replay using synthetic persona/cases. No database reads or writes.
// Run: node --env-file=.env --env-file-if-exists=.env.local --experimental-strip-types scripts/regression-topic-positioning.mjs
import assert from "node:assert/strict";
import { buildTrafficTopicFastDecisionPrompt, parseTrafficTopicArena } from "../src/lib/creation/traffic-topic-arena.ts";
import { guardPositioningTopic, positioningConstraints, selectTopicStories } from "../src/lib/creation/traffic-topic-positioning.ts";
import { buildDomainPrompt, inferDomainContext } from "../src/lib/domain/context.ts";
import { resolveConfiguredTextModel } from "../src/lib/agent/model-config.ts";

if (!process.env.MODEL_API_BASE || !process.env.MODEL_API_KEY) throw new Error("Missing local model configuration");
if (![undefined,"openai"].includes(process.env.MODEL_PROVIDER)) throw new Error("This replay requires the OpenAI-compatible configured provider");
const allFixtures = [
  ["fx","人民币升值，有留学付款计划的家庭该如何安排换汇预算？"],
  ["rates","欧美日加息，中国为什么不跟？解释不同经济体的通胀与需求差异。"],
  ["income","房子、红利ETF、长期国债、储蓄险，谁能持续带来被动收入？比较流动性与现金流。"],
  ["science","孙宇晨提出设立科学悬赏。暂不确定金额与细则，讨论奖金承诺的规则可信度，不编造事实。"],
  ["brand","客户明确咨询泰康养老社区，想讨论日常照护、医疗协作和居住需求怎样匹配，请保留泰康这个讨论对象，不重复现金流题。"],
];
const requested = process.argv.slice(2);
if (requested.some((name) => !allFixtures.some(([id]) => id === name))) throw new Error("Unknown replay fixture");
const fixtures = requested.length ? allFixtures.filter(([id]) => requested.includes(id)) : allFixtures;
const memories = [
  {id:"synthetic-1",category:"story",content:"客户想买泰康养老社区"},
  {id:"synthetic-2",category:"story",content:"客户想买泰康养老社区；曾帮助客户比较买房收租与现金流安排"},
];

async function run([name,source]) {
  const started=Date.now();
  const model=async(prompt,mode,timeoutSeconds)=>{
    const system=["你是内容编辑，严格返回JSON。",buildDomainPrompt(inferDomainContext(source)),mode==="topic-positioning"?"合成测试创作者定位：有育儿经历的家庭财务顾问，服务中产家庭，擅长现金流、家庭风险与长期规划，不催单。没有其他可用个人经历。":""].join("\n");
    const response=await fetch(`${process.env.MODEL_API_BASE.replace(/\/$/,"")}/chat/completions`,{
      method:"POST",headers:{"content-type":"application/json",authorization:`Bearer ${process.env.MODEL_API_KEY}`},
      body:JSON.stringify({model:resolveConfiguredTextModel(),messages:[{role:"system",content:system},{role:"user",content:prompt}],temperature:0.6,response_format:{type:"json_object"}}),
      signal:AbortSignal.timeout(timeoutSeconds*1000),
    });
    if(!response.ok)throw new Error(`Model HTTP ${response.status}`);
    const value=await response.json();
    const content=value.choices?.[0]?.message?.content;
    if(typeof content!=="string")throw new Error("Missing model text");
    return content;
  };
  try {
    const stories=await selectTopicStories(source,memories,model);
    const topics=parseTrafficTopicArena(await model(`${buildTrafficTopicFastDecisionPrompt({source,research:""})}\n\n${positioningConstraints(stories)}`,"topic-positioning",180),6);
    assert.equal(topics.length,6);
    const guarded=await guardPositioningTopic({source,topics,stories,model});
    const last=guarded.topics[5];
    if(name!=="brand") assert.doesNotMatch(JSON.stringify(last),/泰康/);
    else assert.match(last.title,/泰康/);
    console.log(JSON.stringify({fixture:name,status:guarded.status,title:last.title,coreQuestion:last.coreQuestion,workingThesis:last.workingThesis,selectedCases:stories.length,elapsedMs:Date.now()-started}));
  }catch(error){
    console.log(JSON.stringify({fixture:name,status:"failed",error:error instanceof Error?error.message:"Unknown failure",elapsedMs:Date.now()-started}));process.exitCode=1;
  }
}
// Two requests at most concurrently; this is a prompt-level replay, not HTTP or
// persistence acceptance. Outputs intentionally contain no real customer data.
for(let index=0;index<fixtures.length;index+=2)await Promise.all(fixtures.slice(index,index+2).map(run));
// Aborted upstream HTTP connections can keep this one-shot replay alive. All
// fixtures are finished; flush the report before releasing the process.
process.stdout.write("",()=>process.exit(process.exitCode ?? 0));
