import assert from "node:assert/strict";
import test from "node:test";
import {
  applyTrafficDeterministicAuditChecks,
  authorityForTrafficTask,
  buildTrafficCopyAuditPrompt,
  buildTrafficCopyCreativeBriefPrompt,
  buildTrafficCopyWritingPrompt,
  buildTrafficSourceBlueprintPrompt,
  compileTrafficPublicationContract,
  detectTrafficNarrativeIdentityLeaks,
  estimateTrafficSpeakingRate,
  fallbackTrafficCopyCreativeBrief,
  measureTrafficExpressionSimilarity,
  normalizeTrafficBriefForSource,
  parseTrafficCopyAudit,
  parseTrafficCopyCreativeBrief,
  parseTrafficSourceBlueprint,
  sanitizeTrafficNarrativeIdentity,
} from "./traffic-copy-architecture.ts";

test("source blueprint extracts semantic assets instead of preserving prose", () => {
  assert.match(buildTrafficSourceBlueprintPrompt("完整原稿"), /不创作、不润色、不复刻句子/);
  const blueprint = parseTrafficSourceBlueprint(JSON.stringify({
    taskMode:"source_adaptation", originalThesis:"流动性比账面财富重要", attentionReason:"有资产却没现金", entryMode:"问题", entryContent:"为什么有钱却拿不出现金",
    reasoningChain:[{id:"r1",content:"资产不等于现金",purpose:"定义问题"}], mustKeepEvidence:[{id:"s1",content:"家庭月支出",purpose:"量化压力",status:"source"}],
    contentAssets:[{id:"a1",kind:"thesis",meaning:"先管理现金流",function:"核心判断",importance:"required",sourceStatus:"source",mayReframe:true}],
    intendedMindShift:"从资产总额转向可支配现金", authorPosition:"先管现金流", tensionLevel:"strong", voiceTraits:["直接"], uncertainClaims:[],
  }), "原稿");
  assert.equal(blueprint.taskMode, "source_adaptation");
  assert.equal(blueprint.contentAssets[0].meaning, "先管理现金流");
  assert.equal(authorityForTrafficTask(blueprint.taskMode).positionOwner, "source");
});

test("structured hotspot envelope cannot be mistaken for a source transcript", () => {
  const source = "【正式回归｜F09】\nTab：财经\n标题：某款量产车下线\n已知事实：首台量产车下线。\n建议角度：讨论家庭决策";
  const blueprint = parseTrafficSourceBlueprint(JSON.stringify({ taskMode:"source_adaptation", originalThesis:"【正式回归｜F09】", authorPosition:"回归标记" }), source);
  assert.equal(blueprint.taskMode, "topic_creation");
  assert.equal(blueprint.originalThesis, "某款量产车下线");
});

test("coach independently re-plans expression and flexible duration", () => {
  const prompt = buildTrafficCopyCreativeBriefPrompt({ source:"人民币升值参考稿", creatorSkill:"先判断再解释" });
  assert.match(prompt, /只重新立题和编排，不写正文/);
  assert.match(prompt, /不得强制制造矛盾/);
  assert.match(prompt, /至少从受众场景、问题入口、论证顺序/);
  assert.match(prompt, /弹性区间/);
  assert.match(prompt, /durationRange/);
});

test("decision parser keeps asset selection, method tools and duration range", () => {
  const brief = parseTrafficCopyCreativeBrief(JSON.stringify({ worthCreating:true, topicRelation:"strong", audience:"家庭", attentionReason:"现金压力", entryMode:"顾虑", entryContent:"钱会不会不够用", workingThesis:"先解决流动性", preserveOriginalThesis:true, contentGaps:[{id:"g1",description:"受众没有意识到流动性风险",consequenceIfUnresolved:"仍只看资产总额"}], reasoningPlan:[{id:"p1",purpose:"解释压力",evidenceIds:["s1"]}], selectedAssetIds:["a1","a2"], mustKeepEvidenceIds:["s1"], selectedMethods:[{methodId:"顾虑钩子",purpose:"说出担忧",appliesTo:"开头",targetGap:"g1",uniqueContribution:"让受众代入尚未说出的现金顾虑",removalTest:"删除后受众无法理解问题与自己的关系",necessary:true},{methodId:"总结清单",purpose:"丰富结尾",appliesTo:"结尾",targetGap:"g1",uniqueContribution:"更丰富",removalTest:"删除也不影响判断",necessary:false}], stoppingRule:"解释完现金压力和行动后停止",structureBudget:{requiredUnits:3,allowedFunctions:["顾虑","机制","行动"]}, durationRange:{preferredSeconds:[180,240],preferredCharacters:[800,1100]}, durationBasis:{coreClaims:1,reasoningSteps:4,evidenceUnits:3,boundaryUnits:2}, durationRationale:"需要完整论证", expressionPlan:{newEntry:"家庭现金吃紧",newOrder:["场景","机制","行动"],changedDimensions:["入口","顺序"],avoidSourcePhrases:["原钩子"]}, endingMode:"行动提醒", endingRationale:"给出盘点动作", voicePlan:{tension:"strong",rhythm:"短长交替",stance:"直接"}, forbiddenMoves:["不承诺收益"] }));
  assert.equal(brief.primaryMethod, "顾虑钩子");
  assert.deepEqual(brief.selectedAssetIds, ["a1","a2"]);
  assert.deepEqual(brief.durationRange.preferredSeconds, [180,240]);
  assert.equal(brief.targetSeconds, 210);
  assert.equal(brief.selectedMethods.length, 1);
  assert.equal(brief.stoppingRule, "解释完现金压力和行动后停止");
  assert.equal(brief.structureBudget.requiredUnits, 3);
});

test("writer sees semantic assets but never receives the full source prose", () => {
  const source = "核心判断。这个完整原稿专属长句不应该进入写作器。";
  const blueprint = parseTrafficSourceBlueprint(JSON.stringify({ taskMode:"source_adaptation", originalThesis:"核心判断", contentAssets:[{id:"a1",kind:"thesis",meaning:"核心判断",function:"结论",importance:"required",sourceStatus:"source",mayReframe:true}] }), source);
  const prompt = buildTrafficCopyWritingPrompt({ source, blueprint, creatorSkill:"克制直接", brief:fallbackTrafficCopyCreativeBrief(source) });
  assert.match(prompt, /你看不到完整原稿/);
  assert.match(prompt, /【成稿契约】/);
  assert.doesNotMatch(prompt, /这个完整原稿专属长句/);
  assert.doesNotMatch(prompt, /sourceStatus/);
  assert.doesNotMatch(prompt, /【教练决策单】|【搜索与补充材料】/);
  assert.match(prompt, /durationRange由系统按本题信息量自动计算/);
  assert.match(prompt, /不得自我介绍、复述身份画像/);
});

test("publication contract exposes permissions without leaking internal provenance", () => {
  const source = "核心判断。";
  const blueprint = parseTrafficSourceBlueprint(JSON.stringify({ taskMode:"source_adaptation", originalThesis:"核心判断", authorPosition:"先保流动性", intendedMindShift:"从账面资产转向可用现金", contentAssets:[{id:"a1",kind:"thesis",meaning:"先保流动性",function:"结论",importance:"required",sourceStatus:"source",mayReframe:true}] }), source);
  const contract = compileTrafficPublicationContract(blueprint, fallbackTrafficCopyCreativeBrief(source));
  const serialized = JSON.stringify(contract);
  assert.equal(contract.narrativeIdentity, "creator-direct");
  assert.doesNotMatch(serialized, /sourceStatus|contentAssets|selectedAssetIds/);
  assert.match(serialized, /先保流动性/);
});

test("deterministic narrative identity guard blocks internal material narration", () => {
  const cleanAudit = parseTrafficCopyAudit(JSON.stringify({ status:"pass", issues:[], missingEvidenceIds:[], missingAssetIds:[], changedPosition:false, unsupportedGuarantee:false, semanticCoverage:1, expressionSimilarity:.1, copiedPhrases:[], orderTooSimilar:false, preserve:[] }));
  assert.deepEqual(detectTrafficNarrativeIdentityLeaks("根据香港金管局公布的数据，我们先看现金流。"), []);
  assert.ok(detectTrafficNarrativeIdentityLeaks("原稿提到，我们应该先看现金流。").length > 0);
  const guarded = applyTrafficDeterministicAuditChecks(cleanAudit, "材料显示，家庭应该先看现金流。");
  assert.equal(guarded.status, "revise");
  assert.equal(guarded.hardBlocking, true);
  assert.equal(guarded.issues.at(-1)?.type, "narrative_identity_leak");
});

test("deterministic identity sanitizer removes only internal container narration", () => {
  assert.equal(sanitizeTrafficNarrativeIdentity("原稿所述，这个家庭先看现金流。"), "这个家庭先看现金流。");
  assert.equal(sanitizeTrafficNarrativeIdentity("素材中的示例说明了问题。"), "这个示例说明了问题。");
  assert.equal(sanitizeTrafficNarrativeIdentity("根据香港金管局公布的数据，我们先看现金流。"), "根据香港金管局公布的数据，我们先看现金流。");
});

test("automatic duration and routed method boundary are deterministic", () => {
  const parsed = parseTrafficCopyCreativeBrief(JSON.stringify({ selectedMethods:[{methodId:"allowed",purpose:"x",targetGap:"g1",uniqueContribution:"only",removalTest:"breaks",necessary:true},{methodId:"invented",purpose:"x",targetGap:"g2",uniqueContribution:"only",removalTest:"breaks",necessary:true}], durationRange:{preferredSeconds:[300,600],preferredCharacters:[2400,3000]} }));
  const normalized = normalizeTrafficBriefForSource(parsed, "资".repeat(400), ["allowed"]);
  assert.deepEqual(normalized.selectedMethods.map((item) => item.methodId), ["allowed"]);
  assert.deepEqual(normalized.durationRange.preferredCharacters, [612,900]);
  assert.equal(normalized.primaryMethod, "allowed");
});

test("identity and automatic length guards request one minimal revision", () => {
  const cleanAudit = parseTrafficCopyAudit(JSON.stringify({ status:"pass",issues:[],semanticCoverage:1,expressionSimilarity:.1 }));
  const brief = normalizeTrafficBriefForSource(fallbackTrafficCopyCreativeBrief("资".repeat(400)), "资".repeat(400));
  const guarded = applyTrafficDeterministicAuditChecks(cleanAudit, `但猫姐一定要把后半句说清楚：${"解释".repeat(600)}`, { brief, creatorName:"Mo姐" });
  assert.equal(guarded.status, "revise");
  assert.equal(guarded.hardBlocking, true);
  assert.ok(guarded.issues.some((item) => item.type === "creator_identity_conflict"));
  assert.ok(guarded.issues.some((item) => item.type === "automatic_length_overrun"));
  assert.ok(guarded.reductionPlan.length > 0);
});

test("missing publication-contract evidence is deterministically blocking", () => {
  const audit = parseTrafficCopyAudit(JSON.stringify({ status:"pass",issues:[],missingEvidenceIds:["e-required","e-other"],missingAssetIds:["a-required"],semanticCoverage:.8,expressionSimilarity:.1 }));
  const brief = { ...fallbackTrafficCopyCreativeBrief("主题"),mustKeepEvidenceIds:["e-required"] };
  const blueprint = parseTrafficSourceBlueprint(JSON.stringify({ contentAssets:[{id:"a-required",kind:"evidence",meaning:"关键数字",function:"证明",importance:"required",sourceStatus:"source",mayReframe:true}] }),"主题");
  const guarded = applyTrafficDeterministicAuditChecks(audit,"直接表达观点。",{brief,blueprint});
  assert.equal(guarded.status,"revise");
  assert.equal(guarded.hardBlocking,true);
  assert.ok(guarded.issues.some((item)=>item.type==="required_semantic_omission"));
});

test("public event context is blocked when named subjects disappear from the opening", () => {
  const cleanAudit = parseTrafficCopyAudit(JSON.stringify({ status:"pass",issues:[],semanticCoverage:1,expressionSimilarity:.1 }));
  const blueprint = parseTrafficSourceBlueprint(JSON.stringify({
    originalThesis:"事件带来的财产风险启示",
    standaloneContext:{ mode:"public_named",requiredSubjects:["景甜","孙宇晨"],eventSummary:"双方围绕三千余万元争议进入司法程序",eventAnchors:["三千余万元","财产保全"],openingSentenceWindow:3 },
  }),"景甜与孙宇晨因三千余万元争议涉及财产保全。".repeat(20));
  const guarded = applyTrafficDeterministicAuditChecks(cleanAudit,"一方提出了申请。另一方提出管辖权异议。这件事真正提醒我们要管理风险。",{blueprint});
  assert.equal(guarded.status,"revise");
  assert.ok(guarded.issues.some((item)=>item.type==="subject_context_missing"));
});

test("a suspense first sentence passes when the public event lands inside the opening window", () => {
  const cleanAudit = parseTrafficCopyAudit(JSON.stringify({ status:"pass",issues:[],semanticCoverage:1,expressionSimilarity:.1 }));
  const blueprint = parseTrafficSourceBlueprint(JSON.stringify({
    standaloneContext:{ mode:"public_named",requiredSubjects:["景甜","孙宇晨"],eventSummary:"财产争议",eventAnchors:["财产保全"],openingSentenceWindow:3 },
  }),"景甜与孙宇晨的财产保全争议。".repeat(20));
  const guarded = applyTrafficDeterministicAuditChecks(cleanAudit,"一场争议，为什么值得普通家庭关注？景甜与孙宇晨涉及的财产保全问题，恰好说明了风险隔离的重要性。",{blueprint});
  assert.ok(!guarded.issues.some((item)=>item.type==="subject_context_missing"));
});

test("anonymized cases require role relationships instead of real names", () => {
  const cleanAudit = parseTrafficCopyAudit(JSON.stringify({ status:"pass",issues:[],semanticCoverage:1,expressionSimilarity:.1 }));
  const blueprint = parseTrafficSourceBlueprint(JSON.stringify({
    standaloneContext:{ mode:"anonymized",anonymousRoles:["投保人","受益人"],eventSummary:"保单受益安排产生分歧",eventAnchors:["保单"],openingSentenceWindow:3 },
  }),"匿名客户案例中的投保人与受益人对保单安排产生分歧。".repeat(20));
  const guarded = applyTrafficDeterministicAuditChecks(cleanAudit,"这是一个匿名案例。投保人与受益人对保单安排产生了分歧。我们只讨论其中的规划问题。",{blueprint});
  assert.ok(!guarded.issues.some((item)=>item.type==="subject_context_missing"));
});

test("dual audit detects hard omissions and expression overlap without punishing warnings", () => {
  const blocking = parseTrafficCopyAudit(JSON.stringify({ status:"revise", issues:[{severity:"blocking",type:"semantic_omission",location:"第二段",reason:"缺少a2",allowedFix:"补回机制"}], missingEvidenceIds:[], missingAssetIds:["a2"], changedPosition:false, unsupportedGuarantee:false, semanticCoverage:.7, expressionSimilarity:.1, copiedPhrases:[], orderTooSimilar:false, preserve:["a1"] }));
  assert.equal(blocking.status, "revise");
  const warning = parseTrafficCopyAudit(JSON.stringify({ status:"revise", issues:[{severity:"warning",type:"length",location:"全文",reason:"略长",allowedFix:"可压缩"}], missingEvidenceIds:[], missingAssetIds:[], changedPosition:false, unsupportedGuarantee:false, semanticCoverage:1, expressionSimilarity:.1, copiedPhrases:[], orderTooSimilar:false, preserve:[] }));
  assert.equal(warning.status, "pass");
  const reduction = parseTrafficCopyAudit(JSON.stringify({ status:"revise", issues:[{severity:"warning",type:"method_overlap",location:"结尾",reason:"重复解决g1",allowedFix:"删除重复总结"}], missingEvidenceIds:[], missingAssetIds:[], changedPosition:false, unsupportedGuarantee:false, semanticCoverage:1, expressionSimilarity:.1, copiedPhrases:[], orderTooSimilar:false, preserve:["核心判断"], reductionNeeded:true, redundantMethodIds:["总结清单"], repeatedFunctions:["重复解释现金风险"], excessStructureUnits:["结尾清单"], reductionPlan:["删除结尾重复清单"] }));
  assert.equal(reduction.status, "revise");
  assert.equal(reduction.hardBlocking, false);
  const prompt = buildTrafficCopyAuditPrompt({ source:"原稿原稿原稿", draft:"新表达", blueprint:parseTrafficSourceBlueprint("{}","主题"), authority:authorityForTrafficTask("topic_creation"), brief:fallbackTrafficCopyCreativeBrief("主题"), context:[] });
  assert.match(prompt, /双向检查器/);
  assert.match(prompt, /最多一次最小修订/);
});

test("deterministic overlap and speaking rate support post-write measurement", () => {
  const same = measureTrafficExpressionSimilarity("这是一个非常独特而且连续的原始表达方式", "这是一个非常独特而且连续的原始表达方式");
  const different = measureTrafficExpressionSimilarity("这是一个非常独特而且连续的原始表达方式", "家庭先看现金流，再决定配置顺序");
  assert.ok(same.overlapRatio > different.overlapRatio);
  assert.equal(estimateTrafficSpeakingRate({characters:800,reasoningSteps:5,evidenceUnits:4}),225);
});
