import assert from "node:assert/strict";
import test from "node:test";
import { buildTrafficTopicDecisionPrompt, buildTrafficTopicNewsroomInsightPrompt, buildTrafficTopicProposalPrompt, buildTrafficTopicReviewPrompt, parseSelectedTrafficTopics, parseTrafficTopicArena, parseTrafficTopicChallenges, parseTrafficTopicNewsroomInsight, trafficTopicGenerationContext } from "./traffic-topic-arena.ts";

const topic = (index) => ({
  title:`选题${index}`,angleType:"反常识",audience:"家庭决策者",humanTension:"爱与控制",coreQuestion:`问题${index}`,
  workingThesis:`判断${index}`,hookPromise:`承诺${index}`,recommendationReason:"有具体冲突且可以兑现",coachContribution:"教练改变了问题入口",
  coachFit:["小谷教练"],riskBoundary:"不替真实人物补写动机",score:90-index,badge:"流量候选",
  recommendedCoachId:"default",recommendedCoachLabel:"小谷教练",
});

test("parses exactly five arena candidates", () => {
  const parsed = parseTrafficTopicArena(JSON.stringify({ topics:Array.from({length:5},(_,index)=>topic(index+1)) }));
  assert.equal(parsed.length,5);
  assert.deepEqual(parsed.map((item)=>item.id),["topic-1","topic-2","topic-3","topic-4","topic-5"]);
});

test("writes a free editorial memo before coaches enter", () => {
  const prompt = buildTrafficTopicNewsroomInsightPrompt({ source:"多地小学老师转教初中", research:"小学富余而初中缺教师" });
  assert.match(prompt,/不写标题、不考虑获客、不让教练或账号定位介入/);
  assert.match(prompt,/新闻、人物故事、客户案例、行业现象、个人经历或观点/);
  assert.match(prompt,/不要按固定的人性类型填表/);
  const insight = parseTrafficTopicNewsroomInsight(JSON.stringify({ editorialMemo:"人口错峰只是表面答案，仍需观察跨学段胜任力。",materialAnchors:["跨学段转岗"],candidateQuestions:["教学经验能否迁移"],uncertainties:["各地方式不同"] }),"输入");
  assert.match(insight.editorialMemo,/表面答案/);
});

test("proposal is coach-free and blind review cannot see self-justification", () => {
  const insight=parseTrafficTopicNewsroomInsight("","素材");
  const proposal = buildTrafficTopicProposalPrompt({ source:"多地小学老师转教初中",research:"",insight });
  assert.match(proposal,/必须正好12项/);
  assert.match(proposal,/财经、理财、保险的专业角度真实进入候选竞争/);
  assert.match(proposal,/不知道创作者选择了哪些教练/);
  assert.doesNotMatch(proposal,/所选教练/);
  const review=buildTrafficTopicReviewPrompt({source:"素材",proposals:[topic(1)]});
  assert.match(review,/已刻意移除提案者的理由、标签与自评/);
  assert.doesNotMatch(review,/有具体冲突且可以兑现/);
  assert.doesNotMatch(review,/90分/);
  assert.match(review,/专业机制确实带来新解释时加分/);
});

test("final decision treats coach skills as optional references",()=>{
  const insight=parseTrafficTopicNewsroomInsight(JSON.stringify({editorialMemo:"自由判断"}),"素材");
  const raw=JSON.stringify({reviews:[{candidateId:"topic-1",verdict:"rebuild",critique:"答案太浅",replacementDirection:"继续追问"}]});
  const challenges=parseTrafficTopicChallenges(raw);
  assert.equal(challenges[0].verdict,"rebuild");
  assert.equal(challenges[0].forcedMigrationRisk,"none");
  const decision=buildTrafficTopicDecisionPrompt({source:"素材",insight,proposals:[topic(1)],challenges,coaches:[{id:"default",label:"小谷教练",skill:""}]});
  assert.match(decision,/教练技巧只是灵感卡，可以使用、组合或完全不用/);
  assert.match(decision,/不必服从任何固定题型或机械评分公式/);
  assert.match(decision,/个人定位保送题/);
  assert.match(decision,/数字分身中的identity、audience、expertise、story、boundary/);
});

test("returns five arena finalists plus one positioning wildcard",()=>{
  const topics=Array.from({length:6},(_,index)=>({
    ...topic(index+1),
    selectionRole:index===5?"positioning_wildcard":"arena",
    badge:index===5?"定位保送":"竞技场候选",
    professionalLens:index<3?["财经","理财","保险"][index]:"",
    professionalMechanism:index<3?"解释资源、现金流或风险如何重新分配":"",
    professionalValue:index<3?"用专业机制解释真实问题":"",
    professionalConnectionStrength:index<3?"strong":"none",
    householdDecisionImpact:index<3?"帮助家庭调整现实决策":"",
    creatorPositioningConnection:index===5?"连接创作者的家庭资产定位":"",
    creatorEvidence:index===5?["三娃妈妈","家庭资产决策"]:[],
    whyThisCreator:index===5?"具有真实家庭责任和专业判断视角":"",
    ipMemoryOutcome:index===5?"记住她能解释家庭资产决策":"",
    clientSignal:index===5?"正在为家庭长期资金做选择的人":"",
    creatorFit:index===5?"high":"none",
  }));
  const parsed=parseTrafficTopicArena(JSON.stringify({topics}),6);
  assert.equal(parsed.length,6);
  assert.equal(parsed[5].selectionRole,"positioning_wildcard");
  assert.equal(parsed[5].badge,"定位保送");
  assert.equal(parsed[5].whyThisCreator,"具有真实家庭责任和专业判断视角");
  assert.deepEqual(parsed.slice(0,3).map((item)=>item.professionalLens),["财经","理财","保险"]);
});

test("parser can retain twelve proposals before selecting five finalists",()=>{
  assert.equal(parseTrafficTopicArena(JSON.stringify({topics:Array.from({length:12},(_,index)=>topic(index+1))}),12).length,12);
});

test("keeps up to three selected topics as distinct generation units", () => {
  const selected = parseSelectedTrafficTopics(Array.from({length:4},(_,index)=>JSON.stringify(topic(index+1))));
  assert.equal(selected.length,3);
  assert.deepEqual(selected.map((item)=>item.id),["topic-1","topic-2","topic-3"]);
  assert.match(trafficTopicGenerationContext(selected[0]),/不得换题/);
  assert.match(trafficTopicGenerationContext(selected[0]),/爱与控制/);
});

test("passes professional and creator-positioning decisions into writing",()=>{
  const selected=parseSelectedTrafficTopics([JSON.stringify({...topic(1),professionalLens:"家庭理财",professionalMechanism:"匹配资金期限与家庭现金流",professionalValue:"把新闻转成可执行决策",professionalConnectionStrength:"strong",householdDecisionImpact:"重新检查长期锁定资金",creatorPositioningConnection:"三娃家庭资产视角",creatorEvidence:["三娃妈妈"],whyThisCreator:"有真实家庭现金流压力",ipMemoryOutcome:"建立理性家庭资产决策者认知",clientSignal:"有长期教育支出压力的家庭",creatorFit:"high"})]);
  const context=trafficTopicGenerationContext(selected[0]);
  assert.match(context,/需要讲清的专业机制：匹配资金期限与家庭现金流/);
  assert.match(context,/可使用的真实数字分身依据：三娃妈妈/);
  assert.match(context,/希望沉淀的IP认知：建立理性家庭资产决策者认知/);
});
