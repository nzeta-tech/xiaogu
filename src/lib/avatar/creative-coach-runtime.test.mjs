import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCreativeCoachSkillRoutePrompt,
  parseCreativeCoachSkillRoute,
  relaxCoachSkill,
  renderCreativeCoachSkillIndex,
  renderProgressivelyLoadedCreativeCoachSkills,
} from "./creative-coach-runtime.ts";

const runtime = {
  id: "v1", label: "Mo姐 · V7", ipPositioningPrompt: "", contentCreationPrompt: "", growthPrompt: "",
  skillModules: {
    persona: { identity:"判断型财富教练",voiceTraits:["直接"] },
    skillHierarchy: [
      { id:"wealth-decision",name:"财富决策",level:"strategy",description:"重建判断标准",solves:["错误决策标准"],childSkillIds:["cashflow-scene"] },
      { id:"cashflow-scene",name:"现金流场景",level:"functional",parentSkillId:"wealth-decision",description:"把资产转为使用场景",solves:["风险抽象"] },
    ],
    discoveredMethods: [
      { key:"wealth-decision",name:"财富决策",level:"strategy",summary:"重建判断标准",steps:["判断目标"] },
      { key:"cashflow-scene",name:"现金流场景",level:"functional",summary:"把资产转为使用场景",steps:["选择真实场景"],notFor:["纯播报"] },
    ],
  },
};

test("progressive skill routing exposes a light index before full cards", () => {
  const index = renderCreativeCoachSkillIndex(runtime);
  assert.match(index, /cashflow-scene/);
  assert.doesNotMatch(index, /选择真实场景/);
  const prompt = buildCreativeCoachSkillRoutePrompt(runtime, { communicationGoal:"纠正只看资产总额" });
  assert.match(prompt, /全量轻量Skill目录/);
  assert.match(prompt, /最多6个/);
});

test("traffic coach rendering removes restrictive training language but keeps creative guidance", () => {
  const relaxed = relaxCoachSkill("从家庭冲突切入，先给鲜明判断。不得补造事实。语言要有张力。信息不足时明确风险边界。用反问推进。");
  assert.match(relaxed, /从家庭冲突切入/);
  assert.match(relaxed, /语言要有张力/);
  assert.match(relaxed, /用反问推进/);
  assert.doesNotMatch(relaxed, /不得|信息不足|风险边界/);
});

test("route parser rejects unknown ids and full cards load only after selection", () => {
  const route = parseCreativeCoachSkillRoute(JSON.stringify({ strategySkillIds:["wealth-decision","unknown"],candidateMethodIds:["cashflow-scene","unknown"],rationale:"解决流动性缺口" }), runtime);
  assert.deepEqual(route.strategySkillIds, ["wealth-decision"]);
  assert.deepEqual(route.candidateMethodIds, ["cashflow-scene"]);
  const loaded = renderProgressivelyLoadedCreativeCoachSkills(runtime, route);
  assert.match(loaded, /选择真实场景/);
  assert.doesNotMatch(loaded, /unknown/);
});
