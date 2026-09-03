export type TrafficTopicCandidate = {
  id: string;
  title: string;
  angleType: string;
  audience: string;
  humanTension: string;
  coreQuestion: string;
  workingThesis: string;
  hookPromise: string;
  recommendationReason: string;
  coachContribution: string;
  coachFit: string[];
  recommendedCoachId: string;
  recommendedCoachLabel: string;
  assignedCoachId: string;
  assignedCoachLabel: string;
  riskBoundary: string;
  score: number;
  badge: string;
  audienceAssumption: string;
  expectationViolation: string;
  answerPayoff: string;
  topicSpecificity: string;
  centralCharacter: string;
  unresolvedQuestion: string;
  revealedByTitle: string;
  remainingQuestions: string[];
  curiosityDirection: "increased" | "maintained" | "ended" | "";
  editorialVerdict: string;
  professionalLens: string;
  professionalValue: string;
  professionalMechanism: string;
  professionalConnectionStrength: "strong" | "medium" | "weak" | "none";
  householdDecisionImpact: string;
  creatorPositioningConnection: string;
  creatorEvidence: string[];
  whyThisCreator: string;
  ipMemoryOutcome: string;
  clientSignal: string;
  creatorFit: "high" | "medium" | "low" | "none";
  selectionRole: "arena" | "positioning_wildcard";
};

export type TrafficTopicMaterialInsight = {
  editorialMemo: string;
  materialAnchors: string[];
  candidateQuestions: string[];
  uncertainties: string[];
  surfaceEvent: string;
  audienceDefaultBelief: string;
  expectationViolation: string;
  whyItHappens: string;
  answerPayoff: string;
  directlyAffectedGroups: string[];
  topicSpecificFacts: string[];
  forcedMigrationWarnings: string[];
  centralCharacters: string[];
  unusualDetails: string[];
  desires: string[];
  fears: string[];
  responsibilityPowerGap: string;
  solvedProblem: string;
  remainingProblem: string;
  possibleHumanTensions: string[];
};

export type TrafficTopicChallenge = {
  candidateId: string;
  verdict: "keep" | "rebuild" | "discard";
  critique: string;
  replacementDirection: string;
  hotspotFulfillment: string;
  professionalIncrement: string;
  forcedMigrationRisk: "high" | "medium" | "low" | "none";
  identityCredibility: string;
};

// Kept as an alias so existing callers and stored work data remain readable.
export type TrafficTopicNewsroomInsight = TrafficTopicMaterialInsight;

const text = (value: unknown, limit = 500) => typeof value === "string" ? value.trim().slice(0, limit) : "";
const list = (value: unknown, limit = 4) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean).slice(0, limit) : [];
const enumValue = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T => {
  const normalized = text(value, 30) as T;
  return allowed.includes(normalized) ? normalized : fallback;
};

export function buildTrafficTopicNewsroomInsightPrompt(input: { source: string; research: string }) {
  return [
    "你是资深内容编辑。输入可能是新闻、人物故事、客户案例、行业现象、个人经历或观点。此轮只理解素材，不写标题、不考虑获客、不让教练或账号定位介入。",
    "请写一份自然、连贯的编辑备忘。不要按固定的人性类型填表，也不要急着接受最先想到的解释；比较几种可能的理解，指出哪些只是表面答案，哪些地方仍值得继续追问。素材平淡时可以如实判断，不必强行制造深刻。",
    "编辑备忘应让下一位编辑明白：具体发生了什么、哪些细节真正改变理解、谁受到影响、什么问题尚未解决，以及哪些判断仍不确定。",
    `【用户素材】\n${input.source}`,
    input.research ? `【搜索素材】\n${input.research}` : "",
    "最后只把交接信息压缩为JSON，不要为了填字段补造内容：{editorialMemo:string,materialAnchors:string[],candidateQuestions:string[],uncertainties:string[]}。",
  ].filter(Boolean).join("\n\n");
}

export function parseTrafficTopicNewsroomInsight(raw: string, source: string): TrafficTopicNewsroomInsight {
  try {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    const value = JSON.parse(fenced ?? raw.slice(start, end + 1)) as Record<string, unknown>;
    return {
      editorialMemo: text(value.editorialMemo, 2400),
      materialAnchors: list(value.materialAnchors, 12),
      candidateQuestions: list(value.candidateQuestions, 10),
      uncertainties: list(value.uncertainties, 8),
      surfaceEvent: text(value.surfaceEvent, 500) || source.slice(0, 500),
      audienceDefaultBelief: text(value.audienceDefaultBelief, 400),
      expectationViolation: text(value.expectationViolation, 500),
      whyItHappens: text(value.whyItHappens, 600),
      answerPayoff: text(value.answerPayoff, 500),
      directlyAffectedGroups: list(value.directlyAffectedGroups, 8),
      topicSpecificFacts: list(value.topicSpecificFacts, 10),
      forcedMigrationWarnings: list(value.forcedMigrationWarnings, 8),
      centralCharacters: list(value.centralCharacters, 8),
      unusualDetails: list(value.unusualDetails, 10),
      desires: list(value.desires, 8),
      fears: list(value.fears, 8),
      responsibilityPowerGap: text(value.responsibilityPowerGap, 500),
      solvedProblem: text(value.solvedProblem, 500),
      remainingProblem: text(value.remainingProblem, 600),
      possibleHumanTensions: list(value.possibleHumanTensions, 8),
    };
  } catch {
    return { editorialMemo:source.slice(0,1200),materialAnchors:[],candidateQuestions:[],uncertainties:[],surfaceEvent:source.slice(0,500),audienceDefaultBelief:"",expectationViolation:"",whyItHappens:"",answerPayoff:"",directlyAffectedGroups:[],topicSpecificFacts:[],forcedMigrationWarnings:[],centralCharacters:[],unusualDetails:[],desires:[],fears:[],responsibilityPowerGap:"",solvedProblem:"",remainingProblem:"",possibleHumanTensions:[] };
  }
}

export function buildTrafficTopicProposalPrompt(input: { source: string; research: string; insight?: TrafficTopicMaterialInsight }) {
  return [
    "你是独立选题提案者，不写正文、不评分，也不知道创作者选择了哪些教练。根据原始素材和编辑备忘提出12个真正不同的内容命题。",
    `【编辑备忘】\n${input.insight?.editorialMemo || JSON.stringify(input.insight ?? {})}`,
    "先思考，再形成标题。标题可以是问题、结果、故事入口或明确判断，不要求覆盖固定类型。不要为了显得深刻而套人性、焦虑、反常识或宏大趋势。",
    "让财经、理财、保险的专业角度真实进入候选竞争：至少提出3个具有专业解释力的候选，分别尝试从经济激励与资源配置、家庭资产负债与现金流、风险识别与风险转移中寻找切口。专业机制必须能回答素材里的真实问题，不能只把普通社会话题换成财经保险术语，也不能强行推销产品。",
    "每个候选只需交代它究竟想回答什么、当前判断是什么、面向谁、正文还可以展开什么。专业候选还要写清具体机制、对家庭决策的影响与连接强度；删除产品或咨询引导后仍不值得看完的，连接强度只能标weak或none。不要写推荐理由，不要替自己的候选辩护。",
    `【用户素材】\n${input.source}`,
    input.research ? `【公开研究参考】\n${input.research}` : "【公开研究】本轮没有补充材料，由教练依据用户素材自然判断。",
    "严格JSON，不要Markdown：{topics:[{id,title,audience,coreQuestion,unresolvedQuestion,workingThesis,topicSpecificity,remainingQuestions:string[],professionalLens:string,professionalMechanism:string,professionalValue:string,professionalConnectionStrength:'strong'|'medium'|'weak'|'none',householdDecisionImpact:string,score:0}]}。必须正好12项，score统一为0。",
  ].join("\n\n");
}

export function buildTrafficTopicReviewPrompt(input: { source: string; proposals: TrafficTopicCandidate[] }) {
  const blindProposals = input.proposals.map((topic) => ({
    id: topic.id,
    title: topic.title,
    audience: topic.audience,
    coreQuestion: topic.coreQuestion,
    workingThesis: topic.workingThesis,
    remainingQuestions: topic.remainingQuestions,
    professionalLens: topic.professionalLens,
    professionalValue: topic.professionalValue,
    professionalMechanism: topic.professionalMechanism,
    professionalConnectionStrength: topic.professionalConnectionStrength,
    householdDecisionImpact: topic.householdDecisionImpact,
  }));
  return [
    "你是独立的反方编辑，没有参与候选生成。你的任务不是套检查表，也不是优化所有题，而是凭专业判断找出浅薄、可猜、空泛、失真或无法兑现的候选。财经、理财、保险候选与其他候选同场竞争：专业机制确实带来新解释时加分，只是术语嫁接或借热点卖产品时淘汰。允许认为全部候选都不成立。",
    `【原始素材】\n${input.source}`,
    `【候选题｜已刻意移除提案者的理由、标签与自评】\n${JSON.stringify(blindProposals)}`,
    "对每题分别判断：是否兑现热点本身、专业知识带来了什么新增解释、是否存在行业硬转、创作者是否具备可信的讲述基础。此时看不到创作者数字分身，因此identityCredibility只判断题目需要什么身份依据，不得臆测创作者经历。需要重构时只提供新的方向，不必替它写完整终稿。不要打分，也不要排名。",
    "严格JSON，不要Markdown：{reviews:[{candidateId,verdict:'keep'|'rebuild'|'discard',critique,replacementDirection,hotspotFulfillment,professionalIncrement,forcedMigrationRisk:'high'|'medium'|'low'|'none',identityCredibility}]}。每个候选恰好一项。",
  ].join("\n\n");
}

export function parseTrafficTopicChallenges(raw: string): TrafficTopicChallenge[] {
  try {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    const value = JSON.parse(fenced ?? raw.slice(start, end + 1)) as { reviews?: unknown[] };
    return (Array.isArray(value.reviews) ? value.reviews : []).slice(0, 12).flatMap((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const review = item as Record<string, unknown>;
      const verdict = text(review.verdict, 20);
      if (!["keep","rebuild","discard"].includes(verdict)) return [];
      const forcedMigrationRisk = text(review.forcedMigrationRisk, 20);
      return [{ candidateId:text(review.candidateId,40),verdict:verdict as TrafficTopicChallenge["verdict"],critique:text(review.critique,800),replacementDirection:text(review.replacementDirection,600),hotspotFulfillment:text(review.hotspotFulfillment,500),professionalIncrement:text(review.professionalIncrement,500),forcedMigrationRisk:(['high','medium','low','none'].includes(forcedMigrationRisk)?forcedMigrationRisk:'none') as TrafficTopicChallenge['forcedMigrationRisk'],identityCredibility:text(review.identityCredibility,500) }];
    }).filter((item) => item.candidateId);
  } catch { return []; }
}

export function buildTrafficTopicDecisionPrompt(input: { source: string; insight: TrafficTopicMaterialInsight; proposals: TrafficTopicCandidate[]; challenges: TrafficTopicChallenge[]; coaches: Array<{ id: string; label: string; skill: string }> }) {
  return [
    "你是最终选题主编。请综合原始素材、编辑备忘、原始提案与独立反方意见，做自己的判断。你可以保留、重构、合并或全部推翻，不必服从任何固定题型或机械评分公式。",
    `【原始素材】\n${input.source}`,
    `【编辑备忘】\n${input.insight.editorialMemo || JSON.stringify(input.insight)}`,
    `【原始提案】\n${JSON.stringify(input.proposals)}`,
    `【独立反方意见】\n${JSON.stringify(input.challenges)}`,
    `【可选教练技巧参考】\n${input.coaches.map((coach)=>`### ${coach.label}（${coach.id}）\n${coach.skill || "默认公共创作参考"}`).join("\n\n")}`,
    "教练技巧只是灵感卡，可以使用、组合或完全不用；如果技巧与素材冲突，以你对素材的判断为准。教练不能改变事实，也不能为了展示专长把题目迁移到自己的行业。小谷教练保持当前默认能力，不做特殊强化。",
    "先选出5个核心命题明显不同的竞技场胜出题，并按发布优先级排序。财经、理财、保险专业角度必须与其他角度同场比较；能用专业机制产生新解释、建立专业信任或识别潜在客户的题应获得真实竞争力，生硬嫁接则淘汰。不要追求看似精确的高分：score只表达相对强弱，必须与排序一致。",
    "再生成第6个‘个人定位保送题’：它不参加前五题淘汰，必须直接依据系统提供的创作者长期人设画像以及数字分身中的identity、audience、expertise、story、boundary记忆，寻找这份素材与创作者个人定位最自然的连接。不得使用教练定位代替创作者定位；读取不到有效个人定位时，也要明确按当前账号展示信息生成，不得伪造经历或专长。第6题的badge固定为‘定位保送’，selectionRole固定为positioning_wildcard；前5题selectionRole固定为arena。",
    "最终必须输出5个竞技场胜出题+1个定位保送题，共6题。不要机械加权，但必须综合判断传播潜力、问题深度、专业解释价值、目标客户识别和创作者适配。说明第一名胜出的原因、专业题晋级或淘汰的原因，以及标题之后仍有什么答案。",
    "对第6题额外留下定位依据：creatorEvidence只能摘取系统实际提供的创作者身份、受众、专业、经历或边界，不得补写；whyThisCreator回答为什么这题由她讲更成立；ipMemoryOutcome回答发布后希望观众记住她的什么能力。前5题也可以填写定位连接，但不得为了适配而扭曲题眼。",
    "严格JSON，不要Markdown：{topics:[{id,title,angleType,audience,audienceAssumption,expectationViolation,answerPayoff,topicSpecificity,humanTension,centralCharacter,coreQuestion,unresolvedQuestion,workingThesis,hookPromise,recommendationReason,coachContribution,coachFit:string[],recommendedCoachId,recommendedCoachLabel,riskBoundary,revealedByTitle,remainingQuestions:string[],curiosityDirection:'increased'|'maintained'|'ended',editorialVerdict,professionalLens,professionalMechanism,professionalValue,professionalConnectionStrength:'strong'|'medium'|'weak'|'none',householdDecisionImpact,creatorPositioningConnection,creatorEvidence:string[],whyThisCreator,ipMemoryOutcome,clientSignal,creatorFit:'high'|'medium'|'low'|'none',selectionRole:'arena'|'positioning_wildcard',score:0到100,badge}]}。必须正好6项，定位保送题必须放在最后。",
  ].join("\n\n");
}

// Compatibility for older imports; new code should use proposal + independent review.
export const buildTrafficTopicArenaPrompt = buildTrafficTopicProposalPrompt;

export function parseTrafficTopicArena(raw: string, limit = 5): TrafficTopicCandidate[] {
  try {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    const value = JSON.parse(fenced ?? raw.slice(start, end + 1)) as { topics?: unknown[] };
    const topics = Array.isArray(value.topics) ? value.topics : [];
    return topics.slice(0, limit).map((item, index) => {
      const topic = item && typeof item === "object" && !Array.isArray(item) ? item as Record<string, unknown> : {};
      return {
        id: `topic-${index + 1}`,
        title: text(topic.title, 100),
        angleType: text(topic.angleType, 40),
        audience: text(topic.audience, 180),
        humanTension: text(topic.humanTension, 300),
        coreQuestion: text(topic.coreQuestion, 300),
        workingThesis: text(topic.workingThesis, 500),
        hookPromise: text(topic.hookPromise, 300),
        recommendationReason: text(topic.recommendationReason, 600),
        coachContribution: text(topic.coachContribution, 500),
        coachFit: list(topic.coachFit),
        recommendedCoachId: text(topic.recommendedCoachId, 80) || "default",
        recommendedCoachLabel: text(topic.recommendedCoachLabel, 80) || "小谷教练",
        assignedCoachId: text(topic.assignedCoachId, 80) || text(topic.recommendedCoachId, 80) || "default",
        assignedCoachLabel: text(topic.assignedCoachLabel, 80) || text(topic.recommendedCoachLabel, 80) || "小谷教练",
        riskBoundary: "",
        score: Math.max(0, Math.min(100, Math.round(Number(topic.score) || 0))),
        badge: text(topic.badge, 20) || (limit === 6 && index === 5 ? "定位保送" : ["流量最高", "人性最强", "教练适配", "精准获客", "挑战者"][index] || "竞技场候选"),
        audienceAssumption: text(topic.audienceAssumption, 300),
        expectationViolation: text(topic.expectationViolation, 300),
        answerPayoff: text(topic.answerPayoff, 400),
        topicSpecificity: text(topic.topicSpecificity, 300),
        centralCharacter: text(topic.centralCharacter, 240),
        unresolvedQuestion: text(topic.unresolvedQuestion, 400) || text(topic.coreQuestion, 300),
        revealedByTitle: text(topic.revealedByTitle, 400),
        remainingQuestions: list(topic.remainingQuestions, 6),
        curiosityDirection: ["increased","maintained","ended"].includes(text(topic.curiosityDirection, 20)) ? text(topic.curiosityDirection, 20) as TrafficTopicCandidate["curiosityDirection"] : "",
        editorialVerdict: text(topic.editorialVerdict, 800),
        professionalLens: text(topic.professionalLens, 120),
        professionalValue: text(topic.professionalValue, 500),
        professionalMechanism: text(topic.professionalMechanism, 600),
        professionalConnectionStrength: enumValue(topic.professionalConnectionStrength, ["strong","medium","weak","none"], "none"),
        householdDecisionImpact: text(topic.householdDecisionImpact, 500),
        creatorPositioningConnection: text(topic.creatorPositioningConnection, 500),
        creatorEvidence: list(topic.creatorEvidence, 6),
        whyThisCreator: text(topic.whyThisCreator, 600),
        ipMemoryOutcome: text(topic.ipMemoryOutcome, 500),
        clientSignal: text(topic.clientSignal, 400),
        creatorFit: enumValue(topic.creatorFit, ["high","medium","low","none"], "none"),
        selectionRole: (text(topic.selectionRole, 40) === "positioning_wildcard" || (limit === 6 && index === 5) ? "positioning_wildcard" : "arena") as TrafficTopicCandidate["selectionRole"],
      };
    }).filter((topic) => topic.title && topic.coreQuestion && topic.workingThesis)
      .sort((left, right) => left.selectionRole === right.selectionRole ? right.score - left.score : left.selectionRole === "positioning_wildcard" ? 1 : -1)
      .map((topic, index) => ({ ...topic, id:`topic-${index + 1}` }));
  } catch {
    return [];
  }
}

export function serializeTrafficTopicForGeneration(topic: TrafficTopicCandidate) {
  return JSON.stringify(topic);
}

export function parseSelectedTrafficTopics(value: unknown): TrafficTopicCandidate[] {
  if (!Array.isArray(value)) return [];
  const topics = value.slice(0, 3).flatMap((item) => {
    if (typeof item !== "string") return [];
    try { return [JSON.parse(item)]; } catch { return []; }
  });
  return parseTrafficTopicArena(JSON.stringify({ topics }));
}

export function trafficTopicGenerationContext(topic: TrafficTopicCandidate) {
  return [
    "【用户已在选题竞技场确认的选题｜不得换题】",
    `标题：${topic.title}`,
    `目标人群：${topic.audience}`,
    `人性矛盾：${topic.humanTension}`,
    `观众原有认知：${topic.audienceAssumption}`,
    `现实反差：${topic.expectationViolation}`,
    `看完获得的答案：${topic.answerPayoff}`,
    `必须回答：${topic.coreQuestion}`,
    topic.unresolvedQuestion ? `尚未解决的问题：${topic.unresolvedQuestion}` : "",
    `核心判断：${topic.workingThesis}`,
    `开头承诺：${topic.hookPromise}`,
    `推荐依据：${topic.recommendationReason}`,
    `教练参与：${topic.coachContribution}`,
    topic.professionalLens ? `专业角度：${topic.professionalLens}` : "",
    topic.professionalMechanism ? `需要讲清的专业机制：${topic.professionalMechanism}` : "",
    topic.professionalValue ? `专业解释带来的新增价值：${topic.professionalValue}` : "",
    topic.householdDecisionImpact ? `对家庭现实决策的影响：${topic.householdDecisionImpact}` : "",
    topic.creatorPositioningConnection ? `与创作者个人定位的连接：${topic.creatorPositioningConnection}` : "",
    topic.creatorEvidence.length ? `可使用的真实数字分身依据：${topic.creatorEvidence.join("；")}` : "",
    topic.whyThisCreator ? `为什么由这位创作者讲：${topic.whyThisCreator}` : "",
    topic.ipMemoryOutcome ? `希望沉淀的IP认知：${topic.ipMemoryOutcome}` : "",
    topic.clientSignal ? `可能认出自己的目标客户：${topic.clientSignal}` : "",
    topic.remainingQuestions.length ? `标题之后仍要兑现：${topic.remainingQuestions.join("；")}` : "",
    `本题确认教练：${topic.assignedCoachLabel || topic.recommendedCoachLabel}`,
    topic.riskBoundary ? `补充参考：${topic.riskBoundary}` : "",
    "围绕这个选题发挥，允许教练根据素材重新组织观点、开头、案例、节奏和结尾。",
  ].join("\n");
}
