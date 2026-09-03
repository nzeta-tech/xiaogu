import assert from "node:assert/strict";
import test from "node:test";
import { applyPortfolioDuration, buildTrafficPortfolioPlanPrompt, parseTrafficPortfolioPlan, portfolioUnitContext } from "./traffic-copy-portfolio.ts";
import { fallbackTrafficCopyCreativeBrief } from "./traffic-copy-architecture.ts";

const topic=(id,title,role="arena")=>({id,title,selectionRole:role,answerPayoff:`${title}的答案`,coreQuestion:`${title}的问题`});

test("portfolio planner gives every selected topic an exclusive assignment",()=>{
  const topics=[topic("topic-1","规则纠偏"),topic("topic-2","签约清单"),topic("topic-6","三娃压力测试","positioning_wildcard")];
  const prompt=buildTrafficPortfolioPlanPrompt(topics);
  assert.match(prompt,/避免每篇都从头复述同一套热点背景/);
  const plan=parseTrafficPortfolioPlan(JSON.stringify({strategy:"三篇分工",overlapWarnings:["前两题容易重复"],units:[
    {topicId:"topic-1",contentRole:"traffic",uniqueValue:"只拆公式",exclusiveFocus:"解释75岁口径",avoidRepeating:["城市清单"],recommendedFormat:"60秒口播",targetSeconds:[45,75]},
    {topicId:"topic-2",contentRole:"conversion",uniqueValue:"只给问题",exclusiveFocus:"签约核验",avoidRepeating:["重新解释公式"],recommendedFormat:"清单口播",targetSeconds:[60,100]},
    {topicId:"topic-6",contentRole:"positioning",uniqueValue:"只做压力测试",exclusiveFocus:"单收入现金流",avoidRepeating:["城市落地"],recommendedFormat:"深度口播",targetSeconds:[90,150]},
  ]}),topics);
  assert.equal(plan.units.length,3);
  assert.match(portfolioUnitContext(plan,"topic-2"),/避免与同批次其他篇重复：重新解释公式/);
  assert.deepEqual(applyPortfolioDuration(fallbackTrafficCopyCreativeBrief("主题"),plan.units[0]).durationRange.preferredSeconds,[45,75]);
});

test("portfolio duration is bounded without using evidence-pack length",()=>{
  const topics=[topic("topic-1","深度题")];
  const plan=parseTrafficPortfolioPlan(JSON.stringify({units:[{topicId:"topic-1",targetSeconds:[300,900]}]}),topics);
  assert.deepEqual(plan.units[0].targetSeconds,[180,240]);
});
