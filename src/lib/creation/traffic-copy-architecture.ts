export type TrafficTaskMode = "source_adaptation" | "topic_creation" | "mixed_creation";

export type TrafficAuthority = {
  factAuthority: "source-and-verified-search";
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
};

export type TrafficPublicationContract = {
  narrativeIdentity: "creator-direct";
  position: string;
  intendedMindShift: string;
  standaloneContext: TrafficSourceBlueprint["standaloneContext"];
  requiredUnits: Array<{ meaning: string; function: string }>;
  optionalUnits: Array<{ meaning: string; function: string }>;
  allowedClaims: Array<{ statement: string; purpose: string; expressionMode: "direct" | "conditional-or-omit"; namedAttribution: string | null }>;
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
  return {
    factAuthority: "source-and-verified-search",
    contentAuthority: mode === "topic_creation" ? "coach" : mode === "mixed_creation" ? "user" : "source",
    positionOwner: mode === "topic_creation" ? "coach" : mode === "mixed_creation" ? "user" : "source",
    voiceOwner: "coach",
  };
}

export function buildTrafficSourceBlueprintPrompt(source: string, researchDecision = "") {
  return [
    "你是内容资产提取器，只理解语义，不创作、不润色、不复刻句子。判断输入主要是原稿、主题材料，还是事实加用户立场；该判断只用于内部权威分配。",
    "把原稿拆成思想与信息资产，而不是保存原句和原段落：核心判断、必要推理、关键证据、案例功能、条件边界、希望受众发生的认知变化。自动转写错字和断句只按语义理解。",
    "contentAssets 每项只写可迁移的语义，不摘抄长句；required 表示删除后核心判断不成立，supporting 表示可替换为等价证据，optional 表示可舍弃。mayReframe 表示可改变呈现角度或顺序，但不得反转原立场。",
    "原稿中的数字、案例和产品机制先标为source；只有明显属于时效预测、外部排名或无法从原稿确认的断言才标needs_verification。不得因为需要改写就删除具体信息。",
    "如果输入是新闻、人物事件或具体案例，事件核心主体名称和最小事件背景属于required资产：必须提取主体是谁、发生了什么以及当前事实边界，不能只保留抽象道理。同时填写standaloneContext。公开事件用public_named，并只把理解事件不可缺少的公开主体放入requiredSubjects；隐私案例用anonymized，并用anonymousRoles保存可公开的角色关系；普通观点用none。eventAnchors填写2至6个表达最小事件背景所必需、允许原样出现的短关键词，不放同义替换困难的完整句子。openingSentenceWindow默认3，允许首句悬念，但必须在窗口内落地主体和事件。",
    "识别受众真正等待回答的核心问题。尤其是‘为什么、为何、怎么会、为什么这样安排’类题目，必须把针对该人物、事件或决策的具体因果答案列为required reasoning资产；不能把一般工具作用或泛化启发冒充个案答案。证据只能支持归因表达时保留原因及来源边界；完全无法确认私人动机时，也要把‘可确认的安排目的’与‘不可确认的内心动机’列成必要边界。",
    "同时识别当前内容任务画像。按沟通目标、材料形态、必要深度、证据负荷、受众当前认知和决策复杂度判断；不得用账号名或素材库名代替任务类型。",
    researchDecision ? "这是宽泛选题经过研究后的编辑决议。其‘创作方向、核心矛盾、主题锚点’拥有本轮立题权：必须把它们转成required的thesis/reasoning/evidence资产。可以抽象升华，但不得用家庭责任、风险意识、保障规划或现金流等上位概念替换具体事件、机制或矛盾。证据不足只限制具体断言，不得删除整个议题。" : "",
    "严格JSON：{taskMode:'source_adaptation'|'topic_creation'|'mixed_creation',originalThesis:string,userPositions:string[],attentionReason:string,entryMode:string,entryContent:string,reasoningChain:[{id,content,purpose}],mustKeepEvidence:[{id,content,purpose,status:'source'|'needs_verification'}],contentAssets:[{id,kind:'thesis'|'reasoning'|'evidence'|'case'|'boundary'|'audience_shift',meaning,function,importance:'required'|'supporting'|'optional',sourceStatus:'source'|'needs_verification',mayReframe:boolean}],intendedMindShift:string,authorPosition:string,tensionLevel:'low'|'medium'|'strong',voiceTraits:string[],uncertainClaims:string[],standaloneContext:{mode:'none'|'public_named'|'anonymized',requiredSubjects:string[],anonymousRoles:string[],eventSummary:string,eventAnchors:string[],openingSentenceWindow:number},taskProfile:{communicationGoal:string,materialShape:string[],requiredDepth:'light'|'medium'|'deep',evidenceLoad:'low'|'medium'|'high',audienceState:string,decisionComplexity:'low'|'medium'|'high'}}。数量由内容复杂度决定，不能为了简短漏掉必要资产。",
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
    const contentAssets = objectList(value.contentAssets).map((item, index): TrafficContentAsset => ({
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
      mustKeepEvidence: objectList(value.mustKeepEvidence).map((item, index): SourceBlueprintEvidence => ({ id: cleanText(item.id, 40) || `s${index + 1}`, content: cleanText(item.content, 1000), purpose: cleanText(item.purpose, 400), status: item.status === "needs_verification" ? "needs_verification" : "source" })).filter((item) => item.content).slice(0, 24),
      contentAssets,
      intendedMindShift: cleanText(value.intendedMindShift, 800),
      authorPosition: taskMode === "topic_creation" ? "" : cleanText(value.authorPosition, 1000) || originalThesis,
      tensionLevel: ["low", "medium", "strong"].includes(String(value.tensionLevel)) ? value.tensionLevel as TrafficSourceBlueprint["tensionLevel"] : "medium",
      voiceTraits: stringList(value.voiceTraits, 12),
      uncertainClaims: stringList(value.uncertainClaims, 16),
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
    "你是所选创作教练，只重新立题和编排，不写正文。内容资产规定思想所有权，不规定原句、原钩子或原顺序。",
    "你的任务不是缩写原稿，也不是套方法卡。选择本次真正需要的资产，重新决定受众入口、论证顺序和结尾；required资产原则上必须覆盖，但可以换角度、换顺序、换案例讲法。supporting资产可用等价证据替换。",
    "先根据taskProfile和内容资产列出真正未解决的contentGaps。若受众核心问题是‘为什么某人这样做/为什么事件这样发展’，contentGaps、workingThesis和reasoningPlan必须明确回答该个案因果；仅解释一般机制、泛化意义或普通家庭启发，视为未解决。可归因报道事实应保留来源边界后使用，不得仅因不能无条件直述就整段删除。方法是局部工具，可选0个或多个；每个候选方法必须绑定一个gap，并写清uniqueContribution和removalTest。删除方法后若核心判断、必要因果、关键顾虑、证据解释或认知变化都不受损，则necessary=false，绝对不能交给写作器。不得用‘更丰富、更专业、更有吸引力’证明必要性。",
    "只保留最小充分方法集。多个方法解决同一gap时只留贡献最直接的一项；原稿资产本身已完成该功能时不得再选方法。不得强制制造矛盾，不得把鲜明判断改成通用风险清单。",
    "必须设计独立表达：默认不用原稿钩子、不沿用完整段落顺序、不复制专属句子。至少从受众场景、问题入口、论证顺序、案例呈现、结尾落点中自然改变两项，但不能为了不同而牺牲语义。",
    "当taskMode=topic_creation且原始输入只是人物名、热点名或宽泛找角度请求时，搜索编辑说明中的‘创作方向’和已选素材就是本轮立题依据。workingThesis必须点明该具体议题，正文不得绕开它退回通用家庭责任、保障意识或现金流教育。没有足够搜索依据时应明确内容缺口，而不是假装完成一个泛化选题。",
    "时长不先定单点。根据实际选择的核心判断、推理、证据和边界给出弹性区间；复杂内容可以自然达到3—6分钟。区间用于控制重复，不得用于删除必要资产。",
    `【任务权威】\n${JSON.stringify(authority)}`,
    `【内容资产包】\n${JSON.stringify(blueprint)}`,
    input.context?.length ? `【搜索与补充材料】\n${input.context.join("\n")}` : "",
    input.promptHint ? `【应用目标】\n${input.promptHint}` : "",
    input.creatorSkill ? `【教练能力与方法目录】\n${input.creatorSkill}` : "【默认教练】使用基础创作判断。",
    input.coachSkill ? `【定位与增长边界】\n${input.coachSkill}` : "",
    "严格JSON：{worthCreating,topicRelation:'strong'|'weak'|'none',wealthMigration,audience,attentionReason,entryMode,entryContent,workingThesis,preserveOriginalThesis,contentGaps:[{id,description,consequenceIfUnresolved}],reasoningPlan:[{id,purpose,evidenceIds}],selectedAssetIds:string[],mustKeepEvidenceIds:string[],selectedMethods:[{methodId,purpose,appliesTo,targetGap,uniqueContribution,removalTest,necessary:boolean}],stoppingRule:string,structureBudget:{requiredUnits:number,allowedFunctions:string[]},durationRange:{preferredSeconds:[min,max],preferredCharacters:[min,max]},durationBasis:{coreClaims,reasoningSteps,evidenceUnits,boundaryUnits},durationRationale,endingMode:'观点停留'|'行动提醒'|'资料承接'|'不承接',endingRationale,voicePlan:{tension,rhythm,stance},expressionPlan:{newEntry,newOrder:string[],changedDimensions:string[],avoidSourcePhrases:string[]},forbiddenMoves:string[]}。",
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
    const contentGaps = objectList(value.contentGaps).map((item, index) => ({ id: cleanText(item.id, 40) || `g${index + 1}`, description: cleanText(item.description, 500), consequenceIfUnresolved: cleanText(item.consequenceIfUnresolved, 500) })).filter((item) => item.description).slice(0, 12);
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
      forbiddenMoves: stringList(value.forbiddenMoves, 16),
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
      mustKeepEvidenceIds: stringList(value.mustKeepEvidenceIds, 24),
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
        avoidSourcePhrases: stringList(expressionPlan.avoidSourcePhrases, 12),
      },
      contentGaps,
      stoppingRule: cleanText(value.stoppingRule, 600) || "核心判断、必要推理、证据和边界完成后停止",
      structureBudget: { requiredUnits: Math.max(1, Math.round(Number(structureBudgetValue.requiredUnits) || reasoningPlan.length || 1)), allowedFunctions: stringList(structureBudgetValue.allowedFunctions, 20) },
    };
  } catch {
    return fallbackTrafficCopyCreativeBrief(raw);
  }
}

export function normalizeTrafficBriefForSource(brief: TrafficCopyCreativeBrief, source: string, allowedMethodIds?: Iterable<string>) {
  const sourceCharacters = Array.from(source.replace(/\s/g, "")).length;
  // Automatic length is derived from the material actually worth carrying,
  // not from a fixed 60/180-second mode and not from an unconstrained model guess.
  const maximumCharacters = Math.min(1800, Math.max(900, Math.round(sourceCharacters * 1.35)));
  const minimumCharacters = Math.min(maximumCharacters, Math.max(520, Math.round(maximumCharacters * 0.68)));
  const speakingRate = brief.durationBasis.reasoningSteps >= 4 || brief.durationBasis.evidenceUnits >= 4 ? 225 : 250;
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
      preferredSeconds: [Math.round(minimumCharacters / speakingRate * 60), Math.round(maximumCharacters / speakingRate * 60)] as [number, number],
    },
    targetCharacters: Math.round((minimumCharacters + maximumCharacters) / 2),
    targetSeconds: Math.round((minimumCharacters + maximumCharacters) / 2 / speakingRate * 60),
    durationRationale: `根据原始信息量自动确定 ${minimumCharacters}-${maximumCharacters} 字；完整覆盖后停止，不按预设时长档位扩写。`,
  };
}

export function fallbackTrafficCopyCreativeBrief(source: string): TrafficCopyCreativeBrief {
  const focus = sourceFocus(source);
  return {
    content: focus, worthCreating: true, topicRelation: "weak", wealthMigration: false, audience: "与本题直接相关的人", coreClaim: focus,
    primaryMethod: "", secondaryMethod: null, structure: ["解释输入核心"], endingMode: "观点停留", forbiddenMoves: ["不新增事实", "不强制CTA"],
    voice: { openingMode: "观点", reasoningTone: "克制直接", sentenceRhythm: "自然口语", endingTone: "停在判断", avoid: [] },
    targetSeconds: 105, targetCharacters: 500, attentionReason: focus, entryMode: "观点", entryContent: focus, workingThesis: focus,
    preserveOriginalThesis: true, reasoningPlan: [{ id: "p1", purpose: "解释输入核心", evidenceIds: [] }], selectedAssetIds: ["a-thesis"], mustKeepEvidenceIds: [], selectedMethods: [],
    durationRange: { preferredSeconds: [75, 135], preferredCharacters: [320, 680] }, durationBasis: { coreClaims: 1, reasoningSteps: 1, evidenceUnits: 0, boundaryUnits: 0 },
    durationRationale: "根据一个核心判断形成弹性区间", endingRationale: "停在核心判断", voicePlan: { tension: "medium", rhythm: "自然推进", stance: "明确克制" },
    expressionPlan: { newEntry: "重新选择自然入口", newOrder: ["解释输入核心"], changedDimensions: ["问题入口", "表达顺序"], avoidSourcePhrases: [] },
    contentGaps: [], stoppingRule: "核心判断解释完成后停止", structureBudget: { requiredUnits: 1, allowedFunctions: ["解释核心判断"] },
  };
}

export function compileTrafficPublicationContract(blueprint: TrafficSourceBlueprint, brief: TrafficCopyCreativeBrief): TrafficPublicationContract {
  const selected = new Set([...brief.selectedAssetIds, ...brief.mustKeepEvidenceIds]);
  const units = blueprint.contentAssets.filter((item) => item.importance === "required" || selected.has(item.id));
  return {
    narrativeIdentity: "creator-direct",
    position: blueprint.authorPosition || brief.workingThesis,
    intendedMindShift: blueprint.intendedMindShift,
    standaloneContext: blueprint.standaloneContext,
    requiredUnits: units.filter((item) => item.importance === "required").map((item) => ({ meaning:item.meaning,function:item.function })),
    optionalUnits: units.filter((item) => item.importance !== "required").map((item) => ({ meaning:item.meaning,function:item.function })),
    allowedClaims: blueprint.mustKeepEvidence.filter((item) => !selected.size || selected.has(item.id)).map((item) => ({ statement:item.content,purpose:item.purpose,expressionMode:item.status === "source" ? "direct" : "conditional-or-omit",namedAttribution:null })),
    methodDirectives: brief.selectedMethods.map((item) => ({ method:item.methodId,targetGap:item.targetGap,uniqueContribution:item.uniqueContribution })),
    expressionPlan: brief.expressionPlan,
    voicePlan: brief.voicePlan,
    stoppingRule: brief.stoppingRule,
    structureBudget: brief.structureBudget,
    forbiddenMoves: brief.forbiddenMoves,
  };
}

export function buildTrafficCopyWritingPrompt(input: PromptInput & { brief: TrafficCopyCreativeBrief }) {
  const blueprint = input.blueprint ?? fallbackTrafficSourceBlueprint(input.source);
  const contract = compileTrafficPublicationContract(blueprint, input.brief);
  return [
    "你是口播写作者，不是第二个教练。只执行内容资产、权威和教练决策；不得重新选择立场，也不得把具体内容自动改成通用风险教育。",
    "你正在替创作者本人生成可直接录制的口播。以创作者本人身份直接表达，不得在正文提及原稿、材料、输入、素材、内容资产、转写、提示词、任务或内部核验流程。作者观点直接说；研究上下文标为‘可安全使用’的事实可直接表达，标为‘可归因表达’的事实必须自然保留‘据公开报道/据庭审报道/公开资料显示’等来源边界以及人物的‘担心、认为、希望’，不得升级成作者无条件定论。契约中的conditional-or-omit只能条件化表达或省略，不能退回‘材料提到’。",
    "如果本题核心问题是‘为什么’，正文必须在前半段给出针对该人物、事件或决策的具体因果链，再解释一般机制和普通人的启发。不得只说工具有什么作用、安排有什么意义，让观众自己猜个案为什么这样做。若私人内心动机无法确认，要明确说‘能确认的是……；不能确认的是……’，但仍回答公开安排所体现的直接目的。",
    "你看不到完整原稿和权限账本，这是有意的：保留思想和证据功能，但必须独立完成句子、钩子、段落顺序和案例讲法。不得虚构创作者经历，不得照抄专属句子。",
    "durationRange由系统按本题信息量自动计算，不是手动时长档位。先完整覆盖required资产、必要推理和边界，再遵守stoppingRule；正文应落在preferredCharacters区间内。低于下限通常意味着具体议题、机制解释或必要推理尚未完成；高于上限则应压缩重复。每个段落必须新增推理、证据、顾虑、边界或认知推进；不得展示未入选方法，不得重复完成同一contentGap。",
    "Persona、创作者身份、服务对象和内容定位只用于控制立场与声纹，不是可写进正文的素材。不得自我介绍、复述身份画像或说‘作为某类创作者/顾问’；直接进入本题观点。",
    "如果成稿契约的standaloneContext不是none，必须在指定的openingSentenceWindow内让观众知道核心主体或匿名角色关系以及最小事件背景。允许第一句制造悬念，不要求机械地把所有名字塞进第一句；不得通篇只写‘这件事、这起争议、一方、另一方’而让受众不知道在讲谁。点名只用于识别已公开事件，不得借点名作未经证实的定性。",
    `【成稿契约】\n${JSON.stringify(contract)}`,
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

export function applyTrafficDeterministicAuditChecks(audit: TrafficCopyAudit, draft: string, options?: { brief?: TrafficCopyCreativeBrief; blueprint?: TrafficSourceBlueprint; creatorName?: string }) {
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
    issues.push({ severity:"blocking",type:"automatic_length_underrun",location:`全文${actualCharacters}字`,reason:`低于本题信息量下限${minimumCharacters}字，通常表示具体议题、机制解释或必要推理没有展开完整。`,allowedFix:`只补足required资产、核心机制和缺失推理，使正文达到至少${minimumCharacters}字；不得用重复观点或空泛口号凑字数。` });
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
  const standalone = options?.blueprint?.standaloneContext;
  if (standalone && standalone.mode !== "none") {
    const opening = draft.split(/(?<=[。！？!?])|\n+/u).map((item) => item.trim()).filter(Boolean).slice(0, standalone.openingSentenceWindow).join("");
    const normalizedOpening = opening.replace(/\s+/g, "").toLowerCase();
    const requiredIdentities = standalone.mode === "public_named" ? standalone.requiredSubjects : standalone.anonymousRoles;
    const missingIdentities = requiredIdentities.filter((item) => !normalizedOpening.includes(item.replace(/\s+/g, "").toLowerCase()));
    const hasEventAnchor = standalone.eventAnchors.length === 0 || standalone.eventAnchors.some((item) => normalizedOpening.includes(item.replace(/\s+/g, "").toLowerCase()));
    if (missingIdentities.length || !hasEventAnchor) {
      issues.push({
        severity:"blocking",
        type:"subject_context_missing",
        location:`开头前${standalone.openingSentenceWindow}句`,
        reason:[missingIdentities.length ? `缺少必要${standalone.mode === "public_named" ? "主体" : "匿名角色"}：${missingIdentities.join("、")}` : "",!hasEventAnchor ? "没有交代可识别的最小事件背景" : ""].filter(Boolean).join("；"),
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
    "你是双向检查器，不负责润色，也不能把鲜明观点改成中性模板。必须同时检查：A语义是否遗漏或越权；B表达是否过度接近原稿；C研究选定的具体事件、机制和核心矛盾是否被保留并解释。若正文只是提到主题名，随后退回可套用于任何热点的家庭责任、风险意识、保障规划或现金流教育，必须以generic_topic_fallback阻断。若题目核心好奇是‘为什么某人这样做/为何这样安排’，正文只解释一般工具机制、没有给出该个案的具体因果链，必须以core_question_unanswered阻断；可归因事实已经提供却因过度保守被全部省略，也属于该问题。",
    "语义侧只硬阻断：required资产遗漏、核心立场改变、事实无支持、未授权财富迁移/CTA、无条件收益保证、结构残缺。needs_verification未写入不算遗漏。",
    "减负侧检查但不得改观点：逐段标注功能；若多个方法解决同一gap、段落没有新增推理/证据/顾虑/边界/认知推进、或超出structureBudget的单元没有必要语义资产，则reductionNeeded=true。长不等于过载，围绕同一主题但功能不同不算重复。必须给出可直接删除或合并的最小reductionPlan。",
    "表达侧检查：是否复用原钩子、连续专属句、基本相同的完整段落顺序。共同术语、产品名、数字和不可替代事实不算抄袭。只有明显复制表达实现时blocking。",
    "身份侧硬检查：正文必须是创作者本人直接口播。出现‘原稿提到、材料显示、根据输入、上述素材、内容资产、这份转写、提示词’等内部容器叙述时，标记narrative_identity_leak并只做局部改写。真实外部机构名称不属于泄漏。",
    "主题自洽硬检查：若原稿是新闻、人物事件或具体案例，正文开头必须让脱离对话上下文的观众知道核心主体是谁、发生了什么；若仅用‘这起争议、一方、另一方’代替公开事件主体，标记subject_context_missing为blocking。只补足已核验的主体名称和最小背景，不得新增定性。",
    "目标长度只是参考。低于区间不等于遗漏，高于区间不等于冗余；必须结合资产覆盖判断。仅warning必须pass。只有blocking才能revise或human_review，且最多一次最小修订。",
    `【确定性字符重叠参考】${JSON.stringify(deterministicSimilarity)}`,
    `【权威】${JSON.stringify(input.authority)}`,
    `【完整原稿，仅供检查】${input.source}`,
    `【内容资产】${JSON.stringify(input.blueprint)}`,
    `【教练决策】${JSON.stringify(input.brief)}`,
    input.context.join("\n"),
    `【待检查正文】\n${input.draft}`,
    "严格JSON：{status:'pass'|'revise'|'human_review',issues:[{severity:'blocking'|'warning',type,location,reason,allowedFix}],missingEvidenceIds:string[],missingAssetIds:string[],changedPosition:boolean,unsupportedGuarantee:boolean,semanticCoverage:0到1,expressionSimilarity:0到1,copiedPhrases:string[],orderTooSimilar:boolean,preserve:string[],reductionNeeded:boolean,redundantMethodIds:string[],repeatedFunctions:string[],excessStructureUnits:string[],reductionPlan:string[]}。",
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
      hardBlocking, reductionNeeded, redundantMethodIds: stringList(value.redundantMethodIds, 12), repeatedFunctions: stringList(value.repeatedFunctions, 16), excessStructureUnits: stringList(value.excessStructureUnits, 16), reductionPlan,
    };
  } catch {
    return { status: "human_review", issues: [{ severity: "blocking", type: "audit_parse", location: "全文", reason: "检查结果无法解析", allowedFix: "保留草稿并转人工确认" }], missingEvidenceIds: [], missingAssetIds: [], changedPosition: false, unsupportedGuarantee: false, semanticCoverage: 0, expressionSimilarity: 0, copiedPhrases: [], orderTooSimilar: false, preserve: [], hardBlocking: true, reductionNeeded: false, redundantMethodIds: [], repeatedFunctions: [], excessStructureUnits: [], reductionPlan: [] };
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
