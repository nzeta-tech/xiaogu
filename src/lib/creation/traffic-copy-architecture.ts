export type TrafficTaskMode = "source_adaptation" | "topic_creation" | "mixed_creation";

export type TrafficAuthority = {
  factAuthority: "material-and-coach";
  contentAuthority: "source" | "user" | "coach";
  positionOwner: "source" | "user" | "coach";
  voiceOwner: "coach";
};

export type SourceBlueprintEvidence = {
  id: string;
  content: string;
  purpose: string;
  status: "source" | "needs_verification";
};

export type TrafficContentAsset = {
  id: string;
  kind: "thesis" | "reasoning" | "evidence" | "case" | "boundary" | "audience_shift";
  meaning: string;
  function: string;
  importance: "required" | "supporting" | "optional";
  sourceStatus: "source" | "needs_verification";
  mayReframe: boolean;
};

export type TrafficSourceBlueprint = {
  taskMode: TrafficTaskMode;
  originalThesis: string;
  userPositions: string[];
  attentionReason: string;
  entryMode: "问题" | "场景" | "顾虑" | "反差" | "新信息" | "比较" | "案例" | "实操" | "情绪" | "观点";
  entryContent: string;
  reasoningChain: Array<{ id: string; content: string; purpose: string }>;
  mustKeepEvidence: SourceBlueprintEvidence[];
  contentAssets: TrafficContentAsset[];
  intendedMindShift: string;
  authorPosition: string;
  tensionLevel: "low" | "medium" | "strong";
  voiceTraits: string[];
  uncertainClaims: string[];
  standaloneContext: {
    mode: "none" | "public_named" | "anonymized";
    requiredSubjects: string[];
    anonymousRoles: string[];
    eventSummary: string;
    eventAnchors: string[];
    openingSentenceWindow: number;
  };
  taskProfile: {
    communicationGoal: string;
    materialShape: string[];
    requiredDepth: "light" | "medium" | "deep";
    evidenceLoad: "low" | "medium" | "high";
    audienceState: string;
    decisionComplexity: "low" | "medium" | "high";
  };
};

export type SelectedCoachMethod = {
  methodId: string;
  purpose: string;
  appliesTo: string;
  targetGap: string;
  uniqueContribution: string;
  removalTest: string;
  necessary: boolean;
};
export type TrafficDurationRange = {
  preferredSeconds: [number, number];
  preferredCharacters: [number, number];
};

export type TrafficCopyCreativeBrief = {
  // Compatibility fields retained for readers of V6/V7 result_json.
  content: string;
  worthCreating: boolean;
  topicRelation: "strong" | "weak" | "none";
  wealthMigration: boolean;
  audience: string;
  coreClaim: string;
  primaryMethod: string;
  secondaryMethod: string | null;
  structure: string[];
  endingMode: "观点停留" | "行动提醒" | "资料承接" | "不承接";
  forbiddenMoves: string[];
  voice: { openingMode: string; reasoningTone: string; sentenceRhythm: string; endingTone: string; avoid: string[] };
  targetSeconds: number;
  targetCharacters: number;

  attentionReason: string;
  entryMode: TrafficSourceBlueprint["entryMode"];
  entryContent: string;
  workingThesis: string;
  preserveOriginalThesis: boolean;
  reasoningPlan: Array<{ id: string; purpose: string; evidenceIds: string[] }>;
  selectedAssetIds: string[];
  mustKeepEvidenceIds: string[];
  selectedMethods: SelectedCoachMethod[];
  durationRange: TrafficDurationRange;
  durationBasis: { coreClaims: number; reasoningSteps: number; evidenceUnits: number; boundaryUnits: number };
  durationRationale: string;
  endingRationale: string;
  voicePlan: { tension: string; rhythm: string; stance: string };
  expressionPlan: {
    newEntry: string;
    newOrder: string[];
    changedDimensions: string[];
    avoidSourcePhrases: string[];
  };
  contentGaps: Array<{ id: string; description: string; consequenceIfUnresolved: string }>;
  stoppingRule: string;
  structureBudget: { requiredUnits: number; allowedFunctions: string[] };
};

export type TrafficCopyAudit = {
  status: "pass" | "revise" | "human_review";
  issues: Array<{ severity: "blocking" | "warning"; type: string; location: string; reason: string; allowedFix: string }>;
  missingEvidenceIds: string[];
  missingAssetIds: string[];
  changedPosition: boolean;
  unsupportedGuarantee: boolean;
  semanticCoverage: number;
  expressionSimilarity: number;
  copiedPhrases: string[];
  orderTooSimilar: boolean;
  preserve: string[];
  hardBlocking: boolean;
  reductionNeeded: boolean;
  redundantMethodIds: string[];
  repeatedFunctions: string[];
  excessStructureUnits: string[];
  reductionPlan: string[];
  topicFulfillment: { score: number; coreQuestion: number; humanTension: number; titlePromise: number; thesis: number; audience: number; mechanism: number };
};

export type TrafficPublicationContract = {
  narrativeIdentity: "creator-direct";
  position: string;
  intendedMindShift: string;
  standaloneContext: TrafficSourceBlueprint["standaloneContext"];
  requiredUnits: Array<{ meaning: string; function: string }>;
  optionalUnits: Array<{ meaning: string; function: string }>;
  allowedClaims: Array<{ statement: string; purpose: string; expressionMode: "direct" | "attributed" | "conditional" | "blocked"; namedAttribution: string | null }>;
  methodDirectives: Array<{ method: string; targetGap: string; uniqueContribution: string }>;
  expressionPlan: TrafficCopyCreativeBrief["expressionPlan"];
  voicePlan: TrafficCopyCreativeBrief["voicePlan"];
  stoppingRule: string;
  structureBudget: TrafficCopyCreativeBrief["structureBudget"];
  forbiddenMoves: string[];
};

type PromptInput = {
  source: string;
  creatorSkill?: string;
  coachSkill?: string;
  context?: string[];
  promptHint?: string;
  blueprint?: TrafficSourceBlueprint;
  authority?: TrafficAuthority;
};

const entryModes = ["问题", "场景", "顾虑", "反差", "新信息", "比较", "案例", "实操", "情绪", "观点"] as const;
const assetKinds = ["thesis", "reasoning", "evidence", "case", "boundary", "audience_shift"] as const;
const cleanText = (value: unknown, limit = 300) => typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, limit) : "";
const stringList = (value: unknown, limit = 6) => Array.isArray(value)
  ? value.filter((item): item is string => typeof item === "string").map((item) => cleanText(item, 240)).filter(Boolean).slice(0, limit)
  : [];
const objectList = (value: unknown) => Array.isArray(value)
  ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
  : [];
const numericRange = (value: unknown, fallback: [number, number], min: number, max: number): [number, number] => {
  const values = Array.isArray(value) ? value.map(Number).filter(Number.isFinite) : [];
  const low = Math.max(min, Math.min(max, Math.round(values[0] ?? fallback[0])));
  const high = Math.max(low, Math.min(max, Math.round(values[1] ?? fallback[1])));
  return [low, high];
};

const isStructuredTopicInput = (source: string) => /(?:^|\n)Tab[：:]\s*[^\n]+/.test(source)
  && /(?:^|\n)标题[：:]\s*[^\n]+/.test(source)
  && /(?:^|\n)(?:已知事实|摘要)[：:]/.test(source);
const sourceFocus = (source: string) => source.match(/(?:^|\n)标题[：:]\s*([^\n]+)/)?.[1]?.trim()
  || source.match(/(?:^|\n)原作品标题[：:]\s*([^\n]+)/)?.[1]?.trim()
  || source.match(/(?:^|\n)已知事实[：:]\s*([^\n]+)/)?.[1]?.trim()
  || source.split(/[。！？\n]/).map((item) => item.trim()).find((item) => item && !/^【.*】$/.test(item))
  || "输入主题";

export function authorityForTrafficTask(mode: TrafficTaskMode): TrafficAuthority {
  void mode;
  return {
    factAuthority: "material-and-coach",
    contentAuthority: "coach",
    positionOwner: "coach",
    voiceOwner: "coach",
  };
}

function mergeUniqueByMeaning<T extends { id: string }>(first: T[], second: T[], meaning: (item: T) => string, limit: number) {
  const output: T[] = [];
  const seen = new Set<string>();
  for (const item of [...first, ...second]) {
    const key = meaning(item).replace(/\s+/g, "").toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(output.some((candidate) => candidate.id === item.id) ? { ...item, id: `${item.id}-${output.length + 1}` } : item);
    if (output.length >= limit) break;
  }
  return output;
}

/** Research may enrich a blueprint, but it must never erase source/user-owned required assets. */
export function mergeTrafficSourceBlueprint(base: TrafficSourceBlueprint, researched: TrafficSourceBlueprint): TrafficSourceBlueprint {
  const standalone = base.standaloneContext.mode !== "none" || researched.standaloneContext.mode === "none"
    ? {
        ...researched.standaloneContext,
        mode: base.standaloneContext.mode,
        requiredSubjects: [...new Set([...base.standaloneContext.requiredSubjects, ...researched.standaloneContext.requiredSubjects])].slice(0, 8),
        anonymousRoles: [...new Set([...base.standaloneContext.anonymousRoles, ...researched.standaloneContext.anonymousRoles])].slice(0, 8),
        eventSummary: [base.standaloneContext.eventSummary, researched.standaloneContext.eventSummary].filter(Boolean).join("；").slice(0, 600),
        eventAnchors: [...new Set([...base.standaloneContext.eventAnchors, ...researched.standaloneContext.eventAnchors])].slice(0, 6),
        openingSentenceWindow: Math.max(base.standaloneContext.openingSentenceWindow, researched.standaloneContext.openingSentenceWindow),
      }
    : researched.standaloneContext;
  return {
    ...researched,
    taskMode: base.taskMode === "topic_creation" ? researched.taskMode : base.taskMode,
    originalThesis: base.originalThesis || researched.originalThesis,
    userPositions: [...new Set([...base.userPositions, ...researched.userPositions])].slice(0, 10),
    authorPosition: base.authorPosition || researched.authorPosition,
    reasoningChain: mergeUniqueByMeaning(base.reasoningChain, researched.reasoningChain, (item) => item.content, 16),
    mustKeepEvidence: mergeUniqueByMeaning(base.mustKeepEvidence, researched.mustKeepEvidence, (item) => item.content, 24),
    contentAssets: mergeUniqueByMeaning(base.contentAssets, researched.contentAssets, (item) => item.meaning, 30),
    uncertainClaims: [...new Set([...base.uncertainClaims, ...researched.uncertainClaims])].slice(0, 16),
    standaloneContext: standalone,
  };
}

export function buildTrafficSourceBlueprintPrompt(source: string, researchDecision = "") {
  return [
    "你是内容资产提取器，只理解语义，不创作、不润色、不复刻句子。判断输入主要是原稿、主题材料，还是事实加用户立场；该判断只用于内部权威分配。",
    "把原稿拆成思想与信息资产，而不是保存原句和原段落：核心判断、推理、事件节点、人物关系、争议、案例功能和希望受众发生的认知变化。自动转写错字和断句只按语义理解。",
    "contentAssets只记录可能激发创作的判断、故事、事实、冲突和洞察；importance只是内容价值参考，不是正文必须逐项覆盖的清单。mayReframe表示教练可以自由改变呈现角度或顺序。",
    "新闻、人物事件或案例要提取真正有传播价值的人物、事件、关系、反差和争议，供教练选择使用。standaloneContext只提供背景参考，不规定必须在第几句出现。",
    "识别受众真正等待回答的核心问题。尤其是‘为什么’类题目，要提供素材能够激发的因果、人性和决策解释，不强制使用固定的归因句式或边界声明。",
    "同时识别当前内容任务画像。按沟通目标、材料形态、必要深度、证据负荷、受众当前认知和决策复杂度判断；不得用账号名或素材库名代替任务类型。",
    researchDecision ? "研究后的编辑材料是创作参考。提取其中最有价值的事件、矛盾、人物关系和观点，让教练自行决定保留、重组、放大或舍弃。" : "",
    "不要生成核验意见、风险边界、禁止表达、待确认事项或免责声明。严格JSON：{taskMode:'source_adaptation'|'topic_creation'|'mixed_creation',originalThesis:string,userPositions:string[],attentionReason:string,entryMode:string,entryContent:string,reasoningChain:[{id,content,purpose}],contentAssets:[{id,kind:'thesis'|'reasoning'|'evidence'|'case'|'audience_shift',meaning,function,importance:'required'|'supporting'|'optional',mayReframe:boolean}],intendedMindShift:string,authorPosition:string,tensionLevel:'low'|'medium'|'strong',voiceTraits:string[],standaloneContext:{mode:'none'|'public_named'|'anonymized',requiredSubjects:string[],anonymousRoles:string[],eventSummary:string,eventAnchors:string[],openingSentenceWindow:number},taskProfile:{communicationGoal:string,materialShape:string[],requiredDepth:'light'|'medium'|'deep',evidenceLoad:'low'|'medium'|'high',audienceState:string,decisionComplexity:'low'|'medium'|'high'}}。",
    "【输入素材】",
    source,
    researchDecision ? `【研究后的选题决议】\n${researchDecision}` : "",
  ].join("\n\n");
}

export function parseTrafficSourceBlueprint(raw: string, source: string): TrafficSourceBlueprint {
  try {
    const value = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as Record<string, unknown>;
    const modelMode = ["source_adaptation", "topic_creation", "mixed_creation"].includes(String(value.taskMode))
      ? value.taskMode as TrafficTaskMode
      : source.length > 500 ? "source_adaptation" : "topic_creation";
    const taskMode = isStructuredTopicInput(source) ? "topic_creation" : modelMode;
    const focus = sourceFocus(source);
    const contentAssets = objectList(value.contentAssets).filter((item) => item.kind !== "boundary").map((item, index): TrafficContentAsset => ({
      id: cleanText(item.id, 40) || `a${index + 1}`,
      kind: assetKinds.includes(item.kind as typeof assetKinds[number]) ? item.kind as TrafficContentAsset["kind"] : "reasoning",
      meaning: cleanText(item.meaning, 1200),
      function: cleanText(item.function, 500),
      importance: ["required", "supporting", "optional"].includes(String(item.importance)) ? item.importance as TrafficContentAsset["importance"] : "supporting",
      sourceStatus: item.sourceStatus === "needs_verification" ? "needs_verification" : "source",
      mayReframe: item.mayReframe !== false,
    })).filter((item) => item.meaning).slice(0, 30);
    const originalThesis = taskMode === "topic_creation" && isStructuredTopicInput(source) ? focus : cleanText(value.originalThesis, 1200) || focus;
    if (!contentAssets.some((item) => item.kind === "thesis")) {
      contentAssets.unshift({ id: "a-thesis", kind: "thesis", meaning: originalThesis, function: "保持核心判断", importance: "required", sourceStatus: "source", mayReframe: true });
    }
    return {
      taskMode,
      originalThesis,
      userPositions: taskMode === "topic_creation" ? [] : stringList(value.userPositions, 10),
      attentionReason: cleanText(value.attentionReason, 600) || focus,
      entryMode: entryModes.includes(value.entryMode as typeof entryModes[number]) ? value.entryMode as TrafficSourceBlueprint["entryMode"] : "观点",
      entryContent: cleanText(value.entryContent, 700) || focus,
      reasoningChain: objectList(value.reasoningChain).map((item, index) => ({ id: cleanText(item.id, 40) || `r${index + 1}`, content: cleanText(item.content, 1000), purpose: cleanText(item.purpose, 400) })).filter((item) => item.content).slice(0, 16),
      mustKeepEvidence: [],
      contentAssets,
      intendedMindShift: cleanText(value.intendedMindShift, 800),
      authorPosition: taskMode === "topic_creation" ? "" : cleanText(value.authorPosition, 1000) || originalThesis,
      tensionLevel: ["low", "medium", "strong"].includes(String(value.tensionLevel)) ? value.tensionLevel as TrafficSourceBlueprint["tensionLevel"] : "medium",
      voiceTraits: stringList(value.voiceTraits, 12),
      uncertainClaims: [],
      standaloneContext: parseStandaloneContext(value.standaloneContext),
      taskProfile: parseTaskProfile(value.taskProfile),
    };
  } catch {
    return fallbackTrafficSourceBlueprint(source);
  }
}

export function fallbackTrafficSourceBlueprint(source: string): TrafficSourceBlueprint {
  const focus = sourceFocus(source);
  const structured = isStructuredTopicInput(source);
  return {
    taskMode: structured || source.length <= 500 ? "topic_creation" : "source_adaptation",
    originalThesis: focus,
    userPositions: [],
    attentionReason: focus,
    entryMode: "观点",
    entryContent: focus,
    reasoningChain: [{ id: "r1", content: focus, purpose: "保持输入核心" }],
    mustKeepEvidence: [],
    contentAssets: [{ id: "a-thesis", kind: "thesis", meaning: focus, function: "保持核心判断", importance: "required", sourceStatus: "source", mayReframe: true }],
    intendedMindShift: "理解输入的核心判断",
    authorPosition: structured ? "" : focus,
    tensionLevel: "medium",
    voiceTraits: [],
    uncertainClaims: [],
    standaloneContext: { mode: "none", requiredSubjects: [], anonymousRoles: [], eventSummary: "", eventAnchors: [], openingSentenceWindow: 3 },
    taskProfile: { communicationGoal: "解释输入核心", materialShape: ["观点"], requiredDepth: "medium", evidenceLoad: "low", audienceState: "需要理解核心判断", decisionComplexity: "low" },
  };
}

function parseStandaloneContext(value: unknown): TrafficSourceBlueprint["standaloneContext"] {
  const context = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const mode = ["public_named", "anonymized"].includes(String(context.mode)) ? context.mode as "public_named" | "anonymized" : "none";
  return {
    mode,
    requiredSubjects: mode === "public_named" ? stringList(context.requiredSubjects, 8) : [],
    anonymousRoles: mode === "anonymized" ? stringList(context.anonymousRoles, 8) : [],
    eventSummary: cleanText(context.eventSummary, 600),
    eventAnchors: stringList(context.eventAnchors, 6),
    openingSentenceWindow: Math.max(2, Math.min(5, Math.round(Number(context.openingSentenceWindow) || 3))),
  };
}

function parseTaskProfile(value: unknown): TrafficSourceBlueprint["taskProfile"] {
  const profile = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const depth = ["light", "medium", "deep"].includes(String(profile.requiredDepth)) ? profile.requiredDepth as TrafficSourceBlueprint["taskProfile"]["requiredDepth"] : "medium";
  const load = ["low", "medium", "high"].includes(String(profile.evidenceLoad)) ? profile.evidenceLoad as TrafficSourceBlueprint["taskProfile"]["evidenceLoad"] : "medium";
  const complexity = ["low", "medium", "high"].includes(String(profile.decisionComplexity)) ? profile.decisionComplexity as TrafficSourceBlueprint["taskProfile"]["decisionComplexity"] : "medium";
  return { communicationGoal: cleanText(profile.communicationGoal, 300), materialShape: stringList(profile.materialShape, 8), requiredDepth: depth, evidenceLoad: load, audienceState: cleanText(profile.audienceState, 400), decisionComplexity: complexity };
}

export function buildTrafficCopyCreativeBriefPrompt(input: PromptInput) {
  const blueprint = input.blueprint ?? fallbackTrafficSourceBlueprint(input.source);
  const authority = input.authority ?? authorityForTrafficTask(blueprint.taskMode);
  return [
    "你就是所选创作教练。基于用户素材、搜索参考和你的Skill，自由决定这篇口播真正值得讲什么、对谁讲、从哪里切入、怎样推进以及停在哪里。",
    "内容资产、任务画像和候选方法都只是灵感材料，不是检查清单。你可以选择、组合、改写或舍弃，也可以形成素材中隐含但没有直接写出的判断。",
    "优先追求人性洞察、传播欲、鲜明判断和自然口语。不要主动生成免责声明、核验说明、风险清单或四平八稳的正反两面，除非这正是你认为最有力量的表达。",
    "根据内容需要自然决定篇幅、结构和节奏，不受固定开头、段落顺序、CTA、时长或停止规则限制。",
    `【任务权威】\n${JSON.stringify(authority)}`,
    `【内容资产包】\n${JSON.stringify(blueprint)}`,
    input.context?.length ? `【搜索与补充材料】\n${input.context.join("\n")}` : "",
    input.promptHint ? `【应用目标】\n${input.promptHint}` : "",
    input.creatorSkill ? `【教练能力与方法目录】\n${input.creatorSkill}` : "【默认教练】使用基础创作判断。",
    input.coachSkill ? `【定位与增长边界】\n${input.coachSkill}` : "",
    "不要生成内容缺口、核验意见、停止规则、禁止表达或应回避的原句。严格JSON：{worthCreating,topicRelation:'strong'|'weak'|'none',wealthMigration,audience,attentionReason,entryMode,entryContent,workingThesis,preserveOriginalThesis,reasoningPlan:[{id,purpose,evidenceIds}],selectedAssetIds:string[],selectedMethods:[{methodId,purpose,appliesTo,targetGap,uniqueContribution,removalTest,necessary:boolean}],durationRange:{preferredSeconds:[min,max],preferredCharacters:[min,max]},durationBasis:{coreClaims,reasoningSteps,evidenceUnits,boundaryUnits},durationRationale,endingMode:'观点停留'|'行动提醒'|'资料承接'|'不承接',endingRationale,voicePlan:{tension,rhythm,stance},expressionPlan:{newEntry,newOrder:string[],changedDimensions:string[]}}。",
  ].filter(Boolean).join("\n\n");
}

export function parseTrafficCopyCreativeBrief(raw: string): TrafficCopyCreativeBrief {
  try {
    const value = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as Record<string, unknown>;
    const voicePlan = value.voicePlan && typeof value.voicePlan === "object" && !Array.isArray(value.voicePlan) ? value.voicePlan as Record<string, unknown> : {};
    const expressionPlan = value.expressionPlan && typeof value.expressionPlan === "object" && !Array.isArray(value.expressionPlan) ? value.expressionPlan as Record<string, unknown> : {};
    const durationRangeValue = value.durationRange && typeof value.durationRange === "object" && !Array.isArray(value.durationRange) ? value.durationRange as Record<string, unknown> : {};
    const durationBasisValue = value.durationBasis && typeof value.durationBasis === "object" && !Array.isArray(value.durationBasis) ? value.durationBasis as Record<string, unknown> : {};
    const preferredSeconds = numericRange(durationRangeValue.preferredSeconds, [75, 150], 30, 600);
    const preferredCharacters = numericRange(durationRangeValue.preferredCharacters, [300, 700], 120, 3000);
    const reasoningPlan = objectList(value.reasoningPlan).map((item, index) => ({ id: cleanText(item.id, 40) || `p${index + 1}`, purpose: cleanText(item.purpose, 600), evidenceIds: stringList(item.evidenceIds, 24) })).filter((item) => item.purpose).slice(0, 20);
    const selectedMethods = objectList(value.selectedMethods).map((item) => ({ methodId: cleanText(item.methodId, 120), purpose: cleanText(item.purpose, 400), appliesTo: cleanText(item.appliesTo, 160), targetGap: cleanText(item.targetGap, 120), uniqueContribution: cleanText(item.uniqueContribution, 500), removalTest: cleanText(item.removalTest, 500), necessary: item.necessary === true })).filter((item) => item.methodId && item.necessary && item.targetGap && item.uniqueContribution && item.removalTest).slice(0, 8);
    const contentGaps: TrafficCopyCreativeBrief["contentGaps"] = [];
    const structureBudgetValue = value.structureBudget && typeof value.structureBudget === "object" && !Array.isArray(value.structureBudget) ? value.structureBudget as Record<string, unknown> : {};
    const workingThesis = cleanText(value.workingThesis, 1000) || cleanText(value.coreClaim, 1000) || "围绕内容资产形成具体判断";
    const relation = ["strong", "weak", "none"].includes(String(value.topicRelation)) ? value.topicRelation as TrafficCopyCreativeBrief["topicRelation"] : "weak";
    const endings = ["观点停留", "行动提醒", "资料承接", "不承接"];
    const endingMode = endings.includes(String(value.endingMode)) ? value.endingMode as TrafficCopyCreativeBrief["endingMode"] : "观点停留";
    const targetSeconds = Math.round((preferredSeconds[0] + preferredSeconds[1]) / 2);
    const targetCharacters = Math.round((preferredCharacters[0] + preferredCharacters[1]) / 2);
    return {
      content: workingThesis,
      worthCreating: value.worthCreating !== false,
      topicRelation: relation,
      wealthMigration: value.wealthMigration === true,
      audience: cleanText(value.audience, 400),
      coreClaim: workingThesis,
      primaryMethod: selectedMethods[0]?.methodId ?? "",
      secondaryMethod: selectedMethods[1]?.methodId ?? null,
      structure: reasoningPlan.map((item) => item.purpose),
      endingMode,
      forbiddenMoves: [],
      voice: { openingMode: cleanText(value.entryMode), reasoningTone: cleanText(voicePlan.stance), sentenceRhythm: cleanText(voicePlan.rhythm), endingTone: cleanText(value.endingRationale), avoid: [] },
      targetSeconds,
      targetCharacters,
      attentionReason: cleanText(value.attentionReason, 600),
      entryMode: entryModes.includes(value.entryMode as typeof entryModes[number]) ? value.entryMode as TrafficSourceBlueprint["entryMode"] : "观点",
      entryContent: cleanText(value.entryContent, 800),
      workingThesis,
      preserveOriginalThesis: value.preserveOriginalThesis !== false,
      reasoningPlan,
      selectedAssetIds: stringList(value.selectedAssetIds, 30),
      mustKeepEvidenceIds: [],
      selectedMethods,
      durationRange: { preferredSeconds, preferredCharacters },
      durationBasis: {
        coreClaims: Math.max(1, Math.round(Number(durationBasisValue.coreClaims) || 1)),
        reasoningSteps: Math.max(0, Math.round(Number(durationBasisValue.reasoningSteps) || reasoningPlan.length)),
        evidenceUnits: Math.max(0, Math.round(Number(durationBasisValue.evidenceUnits) || 0)),
        boundaryUnits: Math.max(0, Math.round(Number(durationBasisValue.boundaryUnits) || 0)),
      },
      durationRationale: cleanText(value.durationRationale, 700),
      endingRationale: cleanText(value.endingRationale, 500),
      voicePlan: { tension: cleanText(voicePlan.tension), rhythm: cleanText(voicePlan.rhythm), stance: cleanText(voicePlan.stance) },
      expressionPlan: {
        newEntry: cleanText(expressionPlan.newEntry, 600),
        newOrder: stringList(expressionPlan.newOrder, 16),
        changedDimensions: stringList(expressionPlan.changedDimensions, 8),
        avoidSourcePhrases: [],
      },
      contentGaps,
      stoppingRule: "",
      structureBudget: { requiredUnits: Math.max(1, Math.round(Number(structureBudgetValue.requiredUnits) || reasoningPlan.length || 1)), allowedFunctions: stringList(structureBudgetValue.allowedFunctions, 20) },
    };
  } catch {
    return fallbackTrafficCopyCreativeBrief(raw);
  }
}

export function normalizeTrafficBriefForSource(brief: TrafficCopyCreativeBrief, source: string, allowedMethodIds?: Iterable<string>) {
  void source;
  // Research and topic metadata can be much longer than the publishable idea.
  // Preserve the editor's content-form judgment while keeping a spoken-video
  // brief from expanding merely because the shared evidence pack is large.
  const speakingRate = brief.durationBasis.reasoningSteps >= 4 || brief.durationBasis.evidenceUnits >= 4 ? 225 : 250;
  const minimumSeconds = Math.max(45, Math.min(180, brief.durationRange.preferredSeconds[0]));
  const maximumSeconds = Math.max(minimumSeconds, Math.min(240, brief.durationRange.preferredSeconds[1]));
  const minimumCharacters = Math.round(minimumSeconds * speakingRate / 60);
  const maximumCharacters = Math.round(maximumSeconds * speakingRate / 60);
  const allowed = allowedMethodIds ? new Set(allowedMethodIds) : null;
  const selectedMethods = allowed
    ? brief.selectedMethods.filter((item) => allowed.has(item.methodId))
    : brief.selectedMethods;
  return {
    ...brief,
    selectedMethods,
    primaryMethod: selectedMethods[0]?.methodId ?? "",
    secondaryMethod: selectedMethods[1]?.methodId ?? null,
    durationRange: {
      preferredCharacters: [minimumCharacters, maximumCharacters] as [number, number],
      preferredSeconds: [minimumSeconds, maximumSeconds] as [number, number],
    },
    targetCharacters: Math.round((minimumCharacters + maximumCharacters) / 2),
    targetSeconds: Math.round((minimumCharacters + maximumCharacters) / 2 / speakingRate * 60),
    durationRationale: `根据内容任务确定 ${minimumSeconds}-${maximumSeconds} 秒（约 ${minimumCharacters}-${maximumCharacters} 字）；搜索材料不自动扩大篇幅，完成核心问题后停止。`,
  };
}

export function fallbackTrafficCopyCreativeBrief(source: string): TrafficCopyCreativeBrief {
  const focus = sourceFocus(source);
  return {
    content: focus, worthCreating: true, topicRelation: "weak", wealthMigration: false, audience: "与本题直接相关的人", coreClaim: focus,
    primaryMethod: "", secondaryMethod: null, structure: ["解释输入核心"], endingMode: "观点停留", forbiddenMoves: [],
    voice: { openingMode: "观点", reasoningTone: "克制直接", sentenceRhythm: "自然口语", endingTone: "停在判断", avoid: [] },
    targetSeconds: 105, targetCharacters: 500, attentionReason: focus, entryMode: "观点", entryContent: focus, workingThesis: focus,
    preserveOriginalThesis: true, reasoningPlan: [{ id: "p1", purpose: "解释输入核心", evidenceIds: [] }], selectedAssetIds: ["a-thesis"], mustKeepEvidenceIds: [], selectedMethods: [],
    durationRange: { preferredSeconds: [75, 135], preferredCharacters: [320, 680] }, durationBasis: { coreClaims: 1, reasoningSteps: 1, evidenceUnits: 0, boundaryUnits: 0 },
    durationRationale: "根据一个核心判断形成弹性区间", endingRationale: "停在核心判断", voicePlan: { tension: "medium", rhythm: "自然推进", stance: "明确克制" },
    expressionPlan: { newEntry: "重新选择自然入口", newOrder: ["解释输入核心"], changedDimensions: ["问题入口", "表达顺序"], avoidSourcePhrases: [] },
    contentGaps: [], stoppingRule: "", structureBudget: { requiredUnits: 0, allowedFunctions: [] },
  };
}

export function compileTrafficPublicationContract(blueprint: TrafficSourceBlueprint, brief: TrafficCopyCreativeBrief): TrafficPublicationContract {
  const selected = new Set([...brief.selectedAssetIds, ...brief.mustKeepEvidenceIds]);
  const units = blueprint.contentAssets.filter((item) => item.importance === "required" || selected.has(item.id));
  return {
    narrativeIdentity: "creator-direct",
    position: blueprint.authorPosition || brief.workingThesis,
    intendedMindShift: blueprint.intendedMindShift,
    standaloneContext: { mode:"none",requiredSubjects:[],anonymousRoles:[],eventSummary:blueprint.standaloneContext.eventSummary,eventAnchors:[],openingSentenceWindow:5 },
    requiredUnits: [],
    optionalUnits: units.map((item) => ({ meaning:item.meaning,function:item.function })),
    allowedClaims: blueprint.mustKeepEvidence.map((item) => ({ statement:item.content,purpose:item.purpose,expressionMode:"direct" as const,namedAttribution:null })),
    methodDirectives: brief.selectedMethods.map((item) => ({ method:item.methodId,targetGap:item.targetGap,uniqueContribution:item.uniqueContribution })),
    expressionPlan: brief.expressionPlan,
    voicePlan: brief.voicePlan,
    stoppingRule: "",
    structureBudget: { requiredUnits:0,allowedFunctions:[] },
    forbiddenMoves: [],
  };
}

export function buildTrafficCopyWritingPrompt(input: PromptInput & { brief: TrafficCopyCreativeBrief }) {
  const blueprint = input.blueprint ?? fallbackTrafficSourceBlueprint(input.source);
  const contract = compileTrafficPublicationContract(blueprint, input.brief);
  return [
    "你是所选教练的口播写作者。充分吸收教练决策、用户素材和搜索参考，然后像一个有经验、有个性、有判断的真实创作者一样自由表达。",
    "事实、报道、争议、推测、人物动机和专业机制都可以成为表达材料；根据语境自行选择直接判断、讲故事、设问、推演、归因或情绪表达，不需要主动解释核验过程。",
    "开头、结构、篇幅、节奏、称谓、案例组织、观点强度和结尾全部由教练声纹与本题内容决定。允许大胆判断、合理推演和有争议的观点，不写成研究报告或合规说明。",
    `【成稿契约】\n${JSON.stringify(contract)}`,
    input.context?.length ? `【搜索与创作素材】\n${input.context.join("\n\n")}` : "",
    input.creatorSkill ? `【教练写作声纹与获准方法】\n${input.creatorSkill}` : "【写作方式】使用基础创作方式。",
    "只输出完整可录制的口播正文，不输出标题、JSON、分析或说明。",
  ].filter(Boolean).join("\n\n");
}

function normalizedChars(value: string) {
  return Array.from(value.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, ""));
}

export function measureTrafficExpressionSimilarity(source: string, draft: string) {
  const sourceChars = normalizedChars(source);
  const draftChars = normalizedChars(draft);
  const size = 8;
  const sourceShingles = new Set<string>();
  for (let index = 0; index <= sourceChars.length - size; index += 1) sourceShingles.add(sourceChars.slice(index, index + size).join(""));
  const draftShingles: string[] = [];
  for (let index = 0; index <= draftChars.length - size; index += 1) draftShingles.push(draftChars.slice(index, index + size).join(""));
  const matched = draftShingles.filter((item) => sourceShingles.has(item));
  const ratio = matched.length / Math.max(1, draftShingles.length);
  const copiedPhrases = [...new Set(matched)].slice(0, 10);
  return { shingleSize: size, overlapRatio: Number(ratio.toFixed(4)), copiedPhrases };
}

const narrativeIdentityPatterns = [
  /原稿(?:中)?(?:提到|认为|表示|说明|强调)/g,
  /(?:来源)?材料(?:中)?(?:提到|显示|认为|表示|说明)/g,
  /根据(?:上述)?输入/g,
  /上述素材/g,
  /内容资产/g,
  /这份转写/g,
  /提示词|提示中/g,
];

export function detectTrafficNarrativeIdentityLeaks(draft: string) {
  return [...new Set(narrativeIdentityPatterns.flatMap((pattern) => draft.match(pattern) ?? []))];
}

export function sanitizeTrafficNarrativeIdentity(draft: string) {
  return draft
    .replace(/素材中的示例/g, "这个示例")
    .replace(/原稿设定下/g, "在这个假设下")
    .replace(/原来的逻辑/g, "这里的逻辑")
    .replace(/(?:根据)?(?:这份|上述)?原稿(?:中)?(?:所述|提到|认为|表示|说明|强调)?[，,:：]?/g, "")
    .replace(/(?:根据)?(?:这份|上述|来源)?材料(?:中)?(?:所述|提到|显示|认为|表示|说明)?[，,:：]?/g, "")
    .replace(/根据(?:上述)?输入[，,:：]?/g, "")
    .replace(/上述素材/g, "这些信息")
    .replace(/这份转写/g, "这些信息")
    .replace(/内容资产/g, "关键信息")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function applyTrafficDeterministicAuditChecks(audit: TrafficCopyAudit, draft: string, options?: { brief?: TrafficCopyCreativeBrief; blueprint?: TrafficSourceBlueprint; creatorName?: string; enforceTopicFulfillment?: boolean }) {
  const leaks = detectTrafficNarrativeIdentityLeaks(draft);
  const issues = [...audit.issues];
  if (leaks.length) issues.push({ severity:"blocking" as const,type:"narrative_identity_leak",location:leaks.join("、"),reason:"正文泄漏了内部素材或任务容器身份，创作者没有以本人身份直接表达。",allowedFix:"仅删除来源容器和元叙述，直接表达其中的观点或事实；真实外部机构出处仍可保留。" });
  const creatorName = options?.creatorName?.trim();
  if (creatorName) {
    const selfReferences = [...draft.matchAll(/([\p{Script=Han}A-Za-z]{1,8}姐)(?:一定|想|要|来|再)?(?:提醒|告诉|跟你|建议|说清楚)/gu)].map((match) => match[1]);
    if (creatorName.replace(/教练$/u, "") === "Mo姐") selfReferences.push(...["猫姐","某姐","茉姐","默姐"].filter((value) => draft.includes(value)));
    const conflicts = [...new Set(selfReferences.filter((value) => value !== creatorName.replace(/教练$/u, "")))];
    if (conflicts.length) issues.push({ severity:"blocking",type:"creator_identity_conflict",location:conflicts.join("、"),reason:`正文使用了与所选创作者“${creatorName}”冲突的自称，可能来自转写错字。`,allowedFix:`只把冲突自称校正为“${creatorName.replace(/教练$/u, "")}”，不得改动其他内容。` });
  }
  let reductionNeeded = audit.reductionNeeded;
  let reductionPlan = [...audit.reductionPlan];
  const maximumCharacters = options?.brief?.durationRange.preferredCharacters[1];
  const minimumCharacters = options?.brief?.durationRange.preferredCharacters[0];
  const actualCharacters = Array.from(draft.replace(/\s/g, "")).length;
  if (minimumCharacters && actualCharacters < Math.round(minimumCharacters * 0.85)) {
    issues.push({ severity:"warning",type:"automatic_length_underrun",location:`全文${actualCharacters}字`,reason:`低于参考区间${minimumCharacters}字，但字数本身不能证明事实或推理缺失。`,allowedFix:"仅在确有required资产、核心机制或必要推理缺失时补充；不得为达到字数而添加重复观点或空泛口号。" });
  }
  if (maximumCharacters && actualCharacters > Math.round(maximumCharacters * 1.1)) {
    reductionNeeded = true;
    reductionPlan = [...reductionPlan, `在不删除required资产、必要证据和边界的前提下，将重复解释和同功能段落压缩到${maximumCharacters}字左右。`];
    issues.push({ severity:"warning",type:"automatic_length_overrun",location:`全文${actualCharacters}字`,reason:`超过自动信息量上限${maximumCharacters}字，存在结构扩张。`,allowedFix:"仅合并重复解释和同功能段落，不删除必要论据。" });
  }
  const mustKeepIds = new Set(options?.brief?.mustKeepEvidenceIds ?? []);
  const missingRequiredEvidence = audit.missingEvidenceIds.filter((id) => mustKeepIds.has(id));
  const requiredAssetIds = new Set(options?.blueprint?.contentAssets.filter((item) => item.importance === "required").map((item) => item.id) ?? []);
  const missingRequiredAssets = audit.missingAssetIds.filter((id) => requiredAssetIds.has(id));
  if (missingRequiredEvidence.length || missingRequiredAssets.length) {
    issues.push({ severity:"blocking",type:"required_semantic_omission",location:[...missingRequiredEvidence,...missingRequiredAssets].join("、"),reason:"确定性发布契约中的 required 论据或资产未被覆盖。",allowedFix:"只补回列出的 required 语义及其必要解释；可以换句子和顺序，不得扩写其他内容。" });
  }
  if (options?.enforceTopicFulfillment && audit.topicFulfillment.score < 80) {
    issues.push({ severity:"blocking",type:"topic_fulfillment_below_gate",location:"全文",reason:`选题兑现得分${audit.topicFulfillment.score}，低于80分发布门槛。`,allowedFix:"只补强核心问题、人性矛盾、标题承诺、目标人群或必要专业机制中得分不足的部分，不得另选主题或重写无关段落。" });
  }
  const standalone = options?.blueprint?.standaloneContext;
  if (standalone && standalone.mode !== "none") {
    const opening = draft.split(/(?<=[。！？!?])|\n+/u).map((item) => item.trim()).filter(Boolean).slice(0, standalone.openingSentenceWindow).join("");
    const normalizedOpening = opening.replace(/\s+/g, "").toLowerCase();
    const requiredIdentities = standalone.mode === "public_named" ? standalone.requiredSubjects : standalone.anonymousRoles;
    const missingIdentities = requiredIdentities.filter((item) => !normalizedOpening.includes(item.replace(/\s+/g, "").toLowerCase()));
    const includesEventUnit = (item: string) => {
      const normalized = item.replace(/\s+/g, "").toLowerCase();
      if (normalizedOpening.includes(normalized)) return true;
      const date = normalized.match(/(?:\d{4}年)?(\d{1,2})月(\d{1,2})日/);
      if (date && normalizedOpening.includes(`${date[1]}月${date[2]}日`)) return true;
      const synonymGroups = [["去世","离世","逝世","身故"],["再次受到关注","重回讨论","再次引发关注","重新成为热点"]];
      return synonymGroups.some((group) => group.some((word) => normalized.includes(word)) && group.some((word) => normalizedOpening.includes(word)));
    };
    const missingEventAnchors = standalone.eventAnchors.filter((item) => !includesEventUnit(item));
    if (missingIdentities.length || missingEventAnchors.length) {
      issues.push({
        severity:"blocking",
        type:"subject_context_missing",
        location:`开头前${standalone.openingSentenceWindow}句`,
        reason:[missingIdentities.length ? `缺少必要${standalone.mode === "public_named" ? "主体" : "匿名角色"}：${missingIdentities.join("、")}` : "",missingEventAnchors.length ? `缺少必要事件单元：${missingEventAnchors.join("、")}` : ""].filter(Boolean).join("；"),
        allowedFix:`允许保留首句悬念；只在前${standalone.openingSentenceWindow}句内补入${standalone.mode === "public_named" ? "已公开主体" : "匿名角色关系"}和最小事件背景，不得新增事实或未经证实的定性。`,
      });
    }
  }
  const dedupedIssues = issues.filter((item, index) => issues.findIndex((candidate) => candidate.type === item.type) === index);
  const hardBlocking = audit.hardBlocking || dedupedIssues.some((item) => item.severity === "blocking");
  return { ...audit, status:hardBlocking || reductionNeeded ? "revise" : audit.status, hardBlocking, issues:dedupedIssues, reductionNeeded, reductionPlan:[...new Set(reductionPlan)] };
}

export function buildTrafficCopyAuditPrompt(input: { source: string; draft: string; blueprint: TrafficSourceBlueprint; authority: TrafficAuthority; brief: TrafficCopyCreativeBrief; context: string[] }) {
  const deterministicSimilarity = measureTrafficExpressionSimilarity(input.source, input.draft);
  return [
    "你是独立成稿编辑，不负责把文案改得更安全、更中性或更像模板。尊重教练的观点、语气、冲突和叙事选择，只判断这是不是一条聚焦、值得发布、能独立录制的口播。",
    "只检查六件事：一是否兑现所选标题与核心问题；二是否聚焦一个命题而写成热点百科；三专业机制是否真正增加解释、有没有生硬转保险或产品；四是否体现为什么适合这位创作者讲；五是否存在重复背景、重复结论、清单膨胀或明显超过教练自己选择的自然时长；六是否违反本批次分工、重复了明确要求留给其他篇的内容。",
    "只有这些问题实际破坏内容时才标blocking并要求revise：核心问题未回答、标题承诺落空、整篇退回通用套话、专业硬转、关键创作者定位被虚构、严重重复导致口播低效、与同批次另一篇实质相同。一般措辞偏好、合理推演、鲜明判断、篇幅略有浮动只记warning或不记录。",
    "需要修改时给最小reductionPlan或局部allowedFix，不得要求重写成四平八稳的正反分析，不得主动增加免责声明、风险清单和核验过程。每篇最多一次局部修改。",
    "选题兑现分用于解释判断，不机械决定发布：核心问题25、人性矛盾20、标题承诺20、核心判断15、目标人群10、专业机制10。",
    `【确定性字符重叠参考】${JSON.stringify(deterministicSimilarity)}`,
    `【权威】${JSON.stringify(input.authority)}`,
    `【完整原稿，仅供检查】${input.source}`,
    `【内容资产】${JSON.stringify(input.blueprint)}`,
    `【教练决策】${JSON.stringify(input.brief)}`,
    input.context.join("\n"),
    `【待检查正文】\n${input.draft}`,
    "严格JSON：{status:'pass'|'revise'|'human_review',issues:[{severity:'blocking'|'warning',type,location,reason,allowedFix}],missingEvidenceIds:string[],missingAssetIds:string[],changedPosition:boolean,unsupportedGuarantee:boolean,semanticCoverage:0到1,expressionSimilarity:0到1,copiedPhrases:string[],orderTooSimilar:boolean,preserve:string[],reductionNeeded:boolean,redundantMethodIds:string[],repeatedFunctions:string[],excessStructureUnits:string[],reductionPlan:string[],topicFulfillment:{score:0到100,coreQuestion:0到25,humanTension:0到20,titlePromise:0到20,thesis:0到15,audience:0到10,mechanism:0到10}}。",
  ].join("\n\n");
}

export function parseTrafficCopyAudit(raw: string): TrafficCopyAudit {
  try {
    const value = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as Record<string, unknown>;
    const issues = objectList(value.issues).map((item) => ({
      severity: item.severity === "blocking" ? "blocking" as const : "warning" as const,
      type: cleanText(item.type, 120), location: cleanText(item.location, 200), reason: cleanText(item.reason, 600), allowedFix: cleanText(item.allowedFix, 600),
    })).slice(0, 16);
    const missingEvidenceIds = stringList(value.missingEvidenceIds, 24);
    const missingAssetIds = stringList(value.missingAssetIds, 30);
    const changedPosition = value.changedPosition === true;
    const unsupportedGuarantee = value.unsupportedGuarantee === true;
    const orderTooSimilar = value.orderTooSimilar === true;
    const expressionSimilarity = Math.min(1, Math.max(0, Number(value.expressionSimilarity) || 0));
    const semanticCoverage = Math.min(1, Math.max(0, Number(value.semanticCoverage) || 0));
    const fulfillmentValue = value.topicFulfillment && typeof value.topicFulfillment === "object" && !Array.isArray(value.topicFulfillment) ? value.topicFulfillment as Record<string, unknown> : {};
    const bounded = (key:string,max:number) => Math.max(0,Math.min(max,Number(fulfillmentValue[key]) || 0));
    const dimensions = { coreQuestion:bounded("coreQuestion",25),humanTension:bounded("humanTension",20),titlePromise:bounded("titlePromise",20),thesis:bounded("thesis",15),audience:bounded("audience",10),mechanism:bounded("mechanism",10) };
    const calculatedFulfillment = Object.values(dimensions).reduce((sum,item)=>sum+item,0);
    const topicFulfillment = { score:Math.max(0,Math.min(100,Number(fulfillmentValue.score) || calculatedFulfillment)),...dimensions };
    // The checker may list optional/supporting omissions for diagnostics. IDs
    // alone are not a publication veto: the corresponding issue must explain
    // why the omission is blocking. This keeps machine status consistent with
    // the explicit severity policy in the audit prompt.
    const hardBlocking = issues.some((item) => item.severity === "blocking") || changedPosition || unsupportedGuarantee || orderTooSimilar || expressionSimilarity >= 0.55;
    const reductionPlan = stringList(value.reductionPlan, 16);
    const reductionNeeded = value.reductionNeeded === true && reductionPlan.length > 0;
    const requested = ["pass", "revise", "human_review"].includes(String(value.status)) ? value.status as TrafficCopyAudit["status"] : "human_review";
    return {
      status: hardBlocking ? requested === "pass" ? "revise" : requested : reductionNeeded ? "revise" : "pass",
      issues, missingEvidenceIds, missingAssetIds, changedPosition, unsupportedGuarantee, semanticCoverage, expressionSimilarity,
      copiedPhrases: stringList(value.copiedPhrases, 12), orderTooSimilar, preserve: stringList(value.preserve, 16),
      hardBlocking, reductionNeeded, redundantMethodIds: stringList(value.redundantMethodIds, 12), repeatedFunctions: stringList(value.repeatedFunctions, 16), excessStructureUnits: stringList(value.excessStructureUnits, 16), reductionPlan, topicFulfillment,
    };
  } catch {
    return { status: "human_review", issues: [{ severity: "blocking", type: "audit_parse", location: "全文", reason: "检查结果无法解析", allowedFix: "保留草稿并转人工确认" }], missingEvidenceIds: [], missingAssetIds: [], changedPosition: false, unsupportedGuarantee: false, semanticCoverage: 0, expressionSimilarity: 0, copiedPhrases: [], orderTooSimilar: false, preserve: [], hardBlocking: true, reductionNeeded: false, redundantMethodIds: [], repeatedFunctions: [], excessStructureUnits: [], reductionPlan: [], topicFulfillment:{score:0,coreQuestion:0,humanTension:0,titlePromise:0,thesis:0,audience:0,mechanism:0} };
  }
}

export function buildTrafficCopyRevisionPrompt(input: { source: string; draft: string; blueprint: TrafficSourceBlueprint; authority: TrafficAuthority; brief: TrafficCopyCreativeBrief; audit: TrafficCopyAudit; context: string[]; creatorSkill?: string }) {
  return [
    "你是受控局部修复器。只修列出的问题或执行reductionPlan，不重新选题、不重写全文、不降低正常冲突、不改变作者/用户立场、不删除其他正确资产。",
    `【减负计划】${JSON.stringify(input.audit.reductionPlan)}`,
    "语义遗漏只补对应资产；无支持新增事实优先删除，只有allowedFix给出受支持替代表述时才局部替换；表达过近只改对应钩子、句子或顺序。身份元叙述只删除容器词并直接表达观点。不得以重写全文同时解决两个问题。",
    `【必须保留】${JSON.stringify(input.audit.preserve)}`,
    `【问题与允许修复】${JSON.stringify(input.audit.issues)}`,
    `【缺失资产】${JSON.stringify(input.audit.missingAssetIds)}`,
    `【成稿契约】${JSON.stringify(compileTrafficPublicationContract(input.blueprint, input.brief))}`,
    input.creatorSkill ? `【教练声纹】${input.creatorSkill}` : "",
    input.context.join("\n"),
    `【V1正文】${input.draft}`,
    "只输出修订后的完整口播正文。",
  ].filter(Boolean).join("\n\n");
}

export function estimateTrafficSpeakingRate(input: { characters: number; reasoningSteps: number; evidenceUnits: number; tension?: string }) {
  const complex = input.reasoningSteps >= 4 || input.evidenceUnits >= 4;
  if (complex) return 225;
  if (input.tension === "strong" && input.characters <= 600) return 280;
  return 250;
}
