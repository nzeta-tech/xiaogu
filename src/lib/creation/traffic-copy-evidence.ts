export type TrafficEvidenceSource = {
  id?: string;
  title: string;
  url: string;
  publishedAt?: string;
  snippet: string;
  provider: "volcengine" | "tavily" | "exa";
  authorityTier: "official" | "major_media" | "professional" | "other";
  authorityScore: number;
  publisherKey?: string;
  independentSourceCount?: number;
  relevanceScore?: number;
  materialReason?: string;
  purpose?: "fact_check" | "explanation" | "enrichment" | "comparison" | "background";
  confidence?: "high" | "medium" | "low";
  usage?: "verified_fact" | "attributed_view" | "context_only" | "needs_verification";
  supportsClaimIds?: string[];
};

export type TrafficEvidenceClaim = {
  id: string;
  claim: string;
  query: string;
  status: "supported" | "partially_supported" | "potential_conflict" | "unresolved";
  inputNumbers: string[];
  evidenceNumbers: string[];
  conflictNote: string;
  sources: TrafficEvidenceSource[];
};

export type TrafficEvidencePack = {
  version: 2;
  generatedAt: string;
  searchPlan: TrafficEvidenceSearchPlan;
  claims: TrafficEvidenceClaim[];
  topicMaterials: TrafficEvidenceSource[];
  providersUsed: string[];
  researchStatus: "skipped" | "success" | "empty" | "partial" | "failed";
  unresolvedCount: number;
  potentialConflictCount: number;
};

export type TrafficMaterialBrief = {
  keepFromSource: string[];
  corrections: string[];
  selectedMaterialIndexes: number[];
  creativeDirection: string;
  centralTension: string;
  requiredTopicAnchors: string[];
  safeFacts: string[];
  attributedFacts: string[];
  doNotClaim: string[];
  contentType: "hot_event" | "person_story" | "case" | "timeline" | "mechanism" | "opinion" | "general";
  requiredContentUnits: string[];
  currentEventTrigger: { subject: string; event: string; occurredAt: string; whyNow: string; consequence: string } | null;
};

type EvidenceSearchResult = {
  title?: string;
  url?: string;
  content?: string;
  published_date?: string;
  provider?: "volcengine" | "tavily" | "exa";
};

export type TrafficEvidenceSearchPlan = {
  necessary: boolean;
  reason: string;
  budget: number;
  calls: Array<{
    id: string;
    purpose: "topic_evidence" | "claim_verification";
    query: string;
    targetClaimIds: string[];
    factNeed?: string;
    materialNeed?: string;
  }>;
};

type FastResearchLikeResult = {
  trace: { queries: Array<{ query: string; purpose: string }> };
  queryResults: Array<{ query: string; purpose: string; results: Array<{ title: string; url: string; content: string; publishedDate?: string; provider: "volcengine" }> }>;
};

type EvidenceSearch = (query: string) => Promise<EvidenceSearchResult[]>;

export async function buildTrafficEvidencePackFromFastResearch(source: string, research: FastResearchLikeResult) {
  const researchSource = source.split(/\n+/).map((line) => line.trim()).filter((line) => line
    && !/^【.*(?:回归|测试).*】$/u.test(line)
    && !/^(?:请|不要|不得|只使用|只基于|要求|风险提示[：:])/u.test(line))
    .map((line) => line.replace(/^(?:请)?(?:围绕|根据|基于)/u, "").replace(/(?:生成|创作|写|改写)(?:一篇|一版|一个)?(?:流量)?口播(?:文案)?[。！!]?$/u, "").trim())
    .filter(Boolean).join("\n");
  const claims = extractTrafficClaims(researchSource);
  const calls: TrafficEvidenceSearchPlan["calls"] = research.trace.queries.map((item, index) => ({
    id: `fast-search-${index + 1}`,
    purpose: "topic_evidence",
    query: item.query,
    targetClaimIds: relevantClaimIds(item.query, claims),
    factNeed: item.purpose,
    materialNeed: item.purpose,
  }));
  const plan: TrafficEvidenceSearchPlan = {
    necessary: calls.length > 0,
    reason: calls.length ? "Fast Research 生成最小共享证据包" : "Fast Research 未发现必要查询",
    budget: Math.min(6, calls.length),
    calls,
  };
  const resultsByQuery = new Map(research.queryResults.map((item) => [item.query, item.results.map((result) => ({
    title: result.title,
    url: result.url,
    content: result.content,
    published_date: result.publishedDate,
    provider: result.provider,
  }))]));
  return buildTrafficEvidencePack(researchSource || source, async (query) => resultsByQuery.get(query) ?? [], plan);
}

function relevantClaimIds(query: string, claims: string[]) {
  const queryTokens = semanticTokens(query);
  const ranked = claims.map((claim, index) => {
    const claimTokens = semanticTokens(claim);
    const overlap = [...queryTokens].filter((token) => claimTokens.has(token)).length;
    return { id:`claim-${index + 1}`,overlap };
  }).filter((item) => item.overlap >= 2).sort((a, b) => b.overlap - a.overlap);
  return ranked.length ? ranked.map((item) => item.id) : claims.map((_, index) => `claim-${index + 1}`);
}

function semanticTokens(value: string) {
  const normalized = value.toLowerCase().replace(/[^\p{Script=Han}a-z0-9.]/gu, "");
  const tokens = new Set(normalized.match(/[a-z]+|\d+(?:\.\d+)?/g) ?? []);
  const han = normalized.replace(/[^\p{Script=Han}]/gu, "");
  for (let index = 0; index < han.length - 1; index += 1) tokens.add(han.slice(index, index + 2));
  return tokens;
}

export async function buildTrafficEvidencePack(source: string, search?: EvidenceSearch, plannedSearch?: TrafficEvidenceSearchPlan): Promise<TrafficEvidencePack> {
  const searchWeb = search ?? (await import("./link-remix-research")).searchPreferredWeb;
  const claims = extractTrafficClaims(source);
  const searchPlan = plannedSearch ?? planTrafficEvidenceSearch(source, claims);
  const settled = await Promise.allSettled(searchPlan.calls.map(async (call) => ({
    call,
    results: await searchWeb(call.query),
  })));
  const completedCalls = settled.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
  const resultCount = completedCalls.reduce((sum, item) => sum + item.results.length, 0);
  const researchStatus: TrafficEvidencePack["researchStatus"] = searchPlan.calls.length === 0 ? "skipped"
    : completedCalls.length === 0 ? "failed"
    : completedCalls.length < searchPlan.calls.length ? "partial"
    : resultCount === 0 ? "empty"
    : "success";
  const assessed = claims.map((claim, index) => {
    const claimId = `claim-${index + 1}`;
    const relevantCalls = completedCalls.filter(({ call }) => call.targetClaimIds.includes(claimId));
    const sources = relevantCalls.flatMap(({ results }) => results)
      .filter((item) => item.title && item.url)
      .map((item): TrafficEvidenceSource => {
        const authority = scoreSourceAuthority(item.url ?? "");
        return {
          title: item.title ?? "",
          url: item.url ?? "",
          publishedAt: item.published_date,
          snippet: normalizeSnippet(item.content ?? ""),
          provider: item.provider ?? "tavily",
          authorityTier: authority.tier,
          authorityScore: authority.score,
          publisherKey: publisherKey(item.url ?? ""),
        };
      })
      .sort((a, b) => b.authorityScore - a.authorityScore)
      .filter((item, sourceIndex, all) => all.findIndex((candidate) => candidate.url === item.url) === sourceIndex)
      .slice(0, 3);
    const query = relevantCalls.map(({ call }) => call.query).join("；");
    return assessClaim(claimId, claim, query, sources);
  });
  const topicMaterials = completedCalls
    .flatMap(({ call, results }) => results.map((result) => ({ call, result })))
    .filter(({ result }) => result.title && result.url)
    .map(({ call, result }, index) => {
      const source = toEvidenceSource(result);
      const relevanceScore = scoreMaterialRelevance(source, call.query, claims);
      const sourceTokens = semanticTokens(`${source.title} ${source.snippet}`);
      const siblingSources = completedCalls
        .filter((item) => item.call.query === call.query)
        .flatMap((item) => item.results)
        .filter((item) => item.url && item.title)
        .filter((item) => {
          const tokens = semanticTokens(`${item.title} ${item.content ?? ""}`);
          return [...sourceTokens].filter((token) => tokens.has(token)).length >= 2;
        });
      const independentSourceCount = new Set(siblingSources.map((item) => publisherKey(item.url ?? ""))).size;
      const usage: NonNullable<TrafficEvidenceSource["usage"]> = "context_only";
      return {
        ...source,
        independentSourceCount,
        relevanceScore,
        materialReason: buildMaterialReason(source, call.purpose, relevanceScore),
        id: `web-${index + 1}`,
        purpose: call.purpose === "claim_verification" ? "fact_check" as const : inferMaterialPurpose(source),
        confidence: source.authorityScore >= 80 ? "high" as const : source.authorityScore >= 60 ? "medium" as const : "low" as const,
        usage,
        supportsClaimIds: call.targetClaimIds,
      };
    })
    .filter((item, index, all) => all.findIndex((candidate) => candidate.url === item.url) === index)
    .filter((item) => (item.relevanceScore ?? 0) >= 20)
    // Preserve search relevance instead of letting an internal authority score
    // silently suppress a timely or narratively useful result.
    .sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0))
    .slice(0, 12);
  return {
    version: 2,
    generatedAt: new Date().toISOString(),
    searchPlan,
    claims: assessed,
    topicMaterials,
    providersUsed: [...new Set([...assessed.flatMap((claim) => claim.sources.map((source) => source.provider)), ...topicMaterials.map((source) => source.provider)])],
    researchStatus,
    unresolvedCount: assessed.filter((claim) => claim.status === "unresolved").length,
    potentialConflictCount: assessed.filter((claim) => claim.status === "potential_conflict").length,
  };
}

export function buildTrafficEvidenceSearchPlanningPrompt(source: string) {
  return [
    "你是内容创作中的搜索规划助手。先理解原稿的核心话题、核心矛盾和受众真正要做的判断；只规划必要搜索，不写文案。",
    "判断是否需要搜索补充素材。需要时，用最多3条自然、单意图的搜索Query回答真正会改变创作判断的问题。可能需要补充的是最新变化、背景原因、历史材料、规则条件、具体场景或其他内容；由你根据本题自主判断，不套固定类别或固定数量。",
    "每条Query只解决一个问题。不要把多个原因、影响、风险、案例堆进同一条；不要写预期答案、具体数值或指定机构名称。搜索的目的既可以补充创作素材，也可以发现原稿事实是否存在冲突。",
    "若原稿本身已经足够、搜索不会明显改善判断，可不搜索。预测点位、假设和纯观点不是待核验事实。",
    "只返回JSON，不要Markdown：",
    JSON.stringify({ shouldSearch: true, searches: [{ question: "本题需要补充或核对的具体问题", query: "适合搜索引擎的自然查询" }] }),
    "【原稿】",
    source,
  ].join("\n\n");
}

export function parseTrafficEvidenceSearchPlan(raw: string, source: string, fallbackPlan = planTrafficEvidenceSearch(source)): TrafficEvidenceSearchPlan {
  try {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    const value = JSON.parse(fenced ?? (start >= 0 && end > start ? raw.slice(start, end + 1) : raw)) as { shouldSearch?: boolean; searches?: unknown[]; queries?: unknown[] };
    const claims = extractTrafficClaims(source);
    const budget = fallbackPlan.budget;
    if (value.shouldSearch === false) return { necessary: false, reason: "检索规划器判断原稿素材已足够", budget, calls: [] };
    const seen = new Set<string>();
    const calls = (value.searches ?? value.queries ?? []).flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const queryItem = item as Record<string, unknown>;
      const query = typeof queryItem.query === "string" ? queryItem.query.replace(/\s+/g, "").trim() : "";
      if (!isFocusedSearchQuery(query) || isAnswerStuffedQuery(query) || seen.has(query)) return [];
      const indexes = Array.isArray(queryItem.claimIndexes) ? queryItem.claimIndexes.map(Number).filter((index) => Number.isInteger(index) && index >= 1 && index <= claims.length) : claims.map((_, index) => index + 1);
      seen.add(query);
      return [{
        id: "",
        purpose: "topic_evidence" as const,
        query,
        targetClaimIds: indexes.map((index) => `claim-${index}`),
        factNeed: typeof queryItem.question === "string" ? queryItem.question.slice(0, 120) : typeof queryItem.factNeed === "string" ? queryItem.factNeed.slice(0, 120) : "",
        materialNeed: "",
      }];
    }).slice(0, budget).map((call, index) => ({ ...call, id: `search-${index + 1}`, purpose: index === 0 ? "topic_evidence" as const : call.purpose }));
    if (calls.length === 0) return fallbackPlan;
    return {
      necessary: true,
      reason: "由检索规划器根据原稿自主生成",
      budget,
      calls,
    };
  } catch {
    return fallbackPlan;
  }
}

export function planTrafficEvidenceSearch(source: string, claims = extractTrafficClaims(source)): TrafficEvidenceSearchPlan {
  const configuredBudget = Number(process.env.TRAFFIC_SEARCH_MAX_CALLS ?? 3);
  const budget = Number.isFinite(configuredBudget) ? Math.max(0, Math.min(3, Math.floor(configuredBudget))) : 3;
  const searchable = claims.map((claim, index) => ({
    id: `claim-${index + 1}`,
    claim,
    category: classifySearchIntent(claim),
    priority: (extractNumbers(claim).length ? 4 : 0)
      + (/(最近|近期|当前|今年|去年|最新|发布|公布|数据显示|政策|规定|改革|调整|上涨|下降|达到|维持)/.test(claim) ? 3 : 0)
      + (/(研究|报告|机构|央行|美联储|海关|外汇|医保|养老|保险|法律)/.test(claim) ? 2 : 0),
  })).filter((item) => item.priority >= 3).sort((a, b) => b.priority - a.priority);
  if (budget === 0 || searchable.length === 0) {
    return { necessary: false, reason: budget === 0 ? "检索预算被关闭" : "原稿没有必须实时核验的数字、时效或外部事实", budget, calls: [] };
  }

  const calls: TrafficEvidenceSearchPlan["calls"] = [];
  const seenQueries = new Set<string>();
  const ordered = diversifySearchIntents(searchable);
  for (const item of ordered) {
    if (calls.length >= budget) break;
    const query = buildTopicResearchQuery(source, item.claim, item.category);
    if (!query) continue;
    if (seenQueries.has(query)) {
      const existing = calls.find((call) => call.query === query);
      if (existing && !existing.targetClaimIds.includes(item.id)) existing.targetClaimIds.push(item.id);
      continue;
    }
    seenQueries.add(query);
    calls.push({
      id: `search-${calls.length + 1}`,
      purpose: calls.length === 0 ? "topic_evidence" : "claim_verification",
      query,
      targetClaimIds: [item.id],
    });
  }
  return {
    necessary: true,
    reason: calls.length === 1 ? "一个短查询核验最重要的外部事实" : `按风险拆分为${calls.length}个单意图短查询`,
    budget,
    calls,
  };
}

export function extractTrafficClaims(source: string, limit = 8) {
  const sentences = source
    .replace(/\s+/g, " ")
    .split(/(?<=[。！？!?；;])/)
    .map((item) => item.trim().replace(/[。！？!?；;]+$/, ""))
    .filter((item) => item.length >= 8 && item.length <= 220);
  const scored = sentences.map((sentence, index) => ({
    sentence,
    index,
    score: (extractNumbers(sentence).length > 0 ? 5 : 0)
      + (/(最近|近期|当前|今年|去年|发布|公布|数据显示|改革|调整|上涨|下降|突破|达到|维持)/.test(sentence) ? 3 : 0)
      + (/(人民币|美元|央行|美联储|外汇|贸易|医保|养老|保险|政策|企业|家庭)/.test(sentence) ? 2 : 0),
  }));
  const selected = scored.sort((a, b) => b.score - a.score || a.index - b.index).slice(0, limit);
  if (selected.length === 0 && source.trim()) return [source.replace(/\s+/g, " ").trim().slice(0, 160)];
  return selected.sort((a, b) => a.index - b.index).map((item) => item.sentence);
}

export function scoreSourceAuthority(url: string): { tier: TrafficEvidenceSource["authorityTier"]; score: number } {
  let hostname = "";
  try { hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, ""); } catch { return { tier: "other", score: 10 }; }
  if (/(^|\.)gov\.cn$|(^|\.)gov$|pbc\.gov\.cn$|safe\.gov\.cn$|stats\.gov\.cn$|customs\.gov\.cn$|federalreserve\.gov$/.test(hostname)) {
    return { tier: "official", score: 100 };
  }
  if (/(xinhuanet\.com|news\.cn|people\.com\.cn|cctv\.com|ce\.cn|chinanews\.com|中新网|thepaper\.cn|caixin\.com|yicai\.com|eeo\.com\.cn|reuters\.com|apnews\.com|bbc\.|rthk\.hk|scmp\.com|hk01\.com|mingpao\.com|wenweipo\.com)/.test(hostname)) {
    return { tier: "major_media", score: 80 };
  }
  if (/(finance|economy|insurance|health|medical|law|edu)/.test(hostname)) return { tier: "professional", score: 60 };
  return { tier: "other", score: 30 };
}

export function formatTrafficEvidencePack(pack: TrafficEvidencePack) {
  if (pack.claims.length === 0) return "";
  return [
    "【原稿补充素材】",
    `本次搜索 ${pack.searchPlan.calls.length} 次。以下是搜索返回的候选素材，由教练结合选题自然取用。`,
    ...(pack.topicMaterials.length > 0 ? [
      "【可选补充素材】",
      ...pack.topicMaterials.map((source, index) => [
        `【素材#${index + 1}｜${source.id ?? `web-${index + 1}`}】${source.title}`,
        `来源：${source.url}${source.publishedAt ? `｜发布时间：${source.publishedAt}` : ""}`,
        `原始摘要：${source.snippet}`,
      ].join("\n")),
    ] : []),
    "这些资料用于理解事件、寻找矛盾和形成观点；不要输出后台评级、核验过程或素材标签。",
  ].join("\n\n");
}

export function buildTrafficMaterialBriefPrompt(source: string, searchMaterials: string) {
  return [
    "你是同一个内容创作Agent的编辑判断阶段。阅读原稿和搜索返回的补充素材，为下一阶段创作者做一份简短编辑说明；不写口播成稿。",
    "你需要自主判断原稿与搜索结果里哪些人物、事件、时间节点、说法、争议和细节最有内容价值，并把它们自然组织成创作材料。不要做来源评级、事实裁决、风险审查或表达限制。不同材料说法不同时并列保留有传播价值的版本，交给创作者判断。",
    "结合用户素材和搜索结果挑选真正有用的材料。从候选【素材#N】中可以选择1到8个编号，让下游创作者直接阅读其摘要。不要因为来源标签、待核验或存在争议而自动舍弃热点触发事件。",
    "如果原稿只是人物名或宽泛热点请求，从搜索结果中寻找几个可能的具体议题、人性矛盾和内容切口，交给教练自由选择。",
    "把搜索中的事实、说法、人物反应、争议和解释都作为候选素材交给教练判断。corrections、safeFacts、attributedFacts和doNotClaim全部返回空数组，避免后台标签干扰写作。",
    "若核心好奇是‘为什么这样做/为何如此安排/背后原因是什么’，优先给出最有解释力、最符合素材的人性与决策答案，让教练决定采用直接判断、叙事、推测还是机制解释。",
    "识别内容可能属于热点、人物故事、案例、时间线、机制或观点；requiredContentUnits只记录可用的内容方向，不代表正文必须逐项覆盖。",
    "属于热点事件时填写currentEventTrigger，帮助创作者理解为什么现在值得讲；非热点内容填null。",
    "只返回JSON，不要Markdown：",
    JSON.stringify({
      keepFromSource: ["原稿中应保留的核心问题或洞察"],
      corrections: [],
      selectedMaterialIndexes: [1, 2],
      creativeDirection: "用一句话说明如何把原稿与素材组织为独立口播",
      centralTension: "本题独有、不能被通用保险话术替代的矛盾",
      requiredTopicAnchors: ["必须解释的具体事件或机制"],
      safeFacts: [],
      attributedFacts: [],
      doNotClaim: [],
      contentType: "hot_event",
      requiredContentUnits: ["最新事件", "发生时间", "为何此刻值得讲", "事件触发的后续状态", "核心拆解问题"],
      currentEventTrigger: { subject: "事件主体", event: "最新发生的事件", occurredAt: "搜索材料中的发生时间", whyNow: "为何让旧话题重回讨论", consequence: "触发或改变的状态" },
    }),
    "【原稿】",
    source,
    searchMaterials,
  ].join("\n\n");
}

export function parseTrafficMaterialBrief(raw: string): TrafficMaterialBrief {
  try {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    const value = JSON.parse(fenced ?? (start >= 0 && end > start ? raw.slice(start, end + 1) : raw)) as Record<string, unknown>;
    const list = (item: unknown, limit: number) => Array.isArray(item) ? item.filter((entry): entry is string => typeof entry === "string").map((entry) => entry.trim().slice(0, 360)).filter(Boolean).slice(0, limit) : [];
    const selectedMaterialIndexes = Array.isArray(value.selectedMaterialIndexes)
      ? [...new Set(value.selectedMaterialIndexes.map(Number).filter((index) => Number.isInteger(index) && index >= 1 && index <= 12))].slice(0, 8)
      : [];
    const contentTypes = ["hot_event", "person_story", "case", "timeline", "mechanism", "opinion", "general"] as const;
    const contentType = contentTypes.includes(value.contentType as typeof contentTypes[number]) ? value.contentType as TrafficMaterialBrief["contentType"] : "general";
    const triggerValue = value.currentEventTrigger && typeof value.currentEventTrigger === "object" && !Array.isArray(value.currentEventTrigger) ? value.currentEventTrigger as Record<string, unknown> : null;
    const triggerText = (key: string) => triggerValue && typeof triggerValue[key] === "string" ? String(triggerValue[key]).trim().slice(0, 240) : "";
    const currentEventTrigger = contentType === "hot_event" && triggerValue ? { subject:triggerText("subject"),event:triggerText("event"),occurredAt:triggerText("occurredAt"),whyNow:triggerText("whyNow"),consequence:triggerText("consequence") } : null;
    return {
      keepFromSource: list(value.keepFromSource, 4),
      corrections: [],
      selectedMaterialIndexes,
      creativeDirection: typeof value.creativeDirection === "string" ? value.creativeDirection.trim().slice(0, 400) : "围绕原稿的核心矛盾，结合真正有用的补充素材重新组织口播。",
      centralTension: typeof value.centralTension === "string" ? value.centralTension.trim().slice(0, 400) : "",
      requiredTopicAnchors: list(value.requiredTopicAnchors, 5),
      safeFacts: [],
      attributedFacts: [],
      doNotClaim: [],
      contentType,
      requiredContentUnits: list(value.requiredContentUnits, 10),
      currentEventTrigger,
    };
  } catch {
    return { keepFromSource: [], corrections: [], selectedMaterialIndexes: [], creativeDirection: "围绕原稿的核心矛盾重新组织口播。", centralTension: "", requiredTopicAnchors: [], safeFacts: [], attributedFacts: [], doNotClaim: [], contentType:"general", requiredContentUnits:[], currentEventTrigger:null };
  }
}

export function formatTrafficMaterialBrief(brief: TrafficMaterialBrief, candidates: TrafficEvidenceSource[] = []) {
  const selectedChunks = brief.selectedMaterialIndexes
    .map((index) => ({ index, source: candidates[index - 1] }))
    .filter((item): item is { index: number; source: TrafficEvidenceSource } => Boolean(item.source));
  return [
    "【编辑素材说明】",
    ...(brief.keepFromSource.length ? ["原稿应保留：", ...brief.keepFromSource.map((item) => `- ${item}`)] : []),
    ...(selectedChunks.length ? ["【已选搜索素材 Chunk】", ...selectedChunks.map(({ index, source }) => [
      `【素材#${index}】${source.title}`,
      `来源：${source.url}`,
      `发布时间：${source.publishedAt || "未提供"}`,
      `原始摘要：${source.snippet}`,
    ].join("\n"))] : []),
    `创作方向：${brief.creativeDirection}`,
    ...(brief.centralTension ? [`核心矛盾：${brief.centralTension}`] : []),
    ...(brief.requiredTopicAnchors.length ? [`可用主题锚点：${brief.requiredTopicAnchors.join("、")}`] : []),
    ...(brief.safeFacts.length ? ["可用事实素材：", ...brief.safeFacts.map((item) => `- ${item}`)] : []),
    ...(brief.attributedFacts.length ? ["可用报道与观点素材：", ...brief.attributedFacts.map((item) => `- ${item}`)] : []),
    ...(brief.doNotClaim.length ? ["其他可供教练判断的争议信息：", ...brief.doNotClaim.map((item) => `- ${item}`)] : []),
    `内容类型：${brief.contentType}`,
    ...(brief.requiredContentUnits.length ? [`可用内容单元：${brief.requiredContentUnits.join("、")}`] : []),
    ...(brief.currentEventTrigger ? ["【当前事件参考】", `主体：${brief.currentEventTrigger.subject}`, `事件：${brief.currentEventTrigger.event}`, `发生时间：${brief.currentEventTrigger.occurredAt}`, `为什么今天讲：${brief.currentEventTrigger.whyNow}`, `后续状态：${brief.currentEventTrigger.consequence}`] : []),
    "请把原稿与以上材料交给教练自然发挥，正文不需要解释内部素材整理过程。",
  ].join("\n");
}

function buildFocusedQuery(claim: string) {
  const normalized = claim.replace(/^(你觉得|你知道|所以|但是|但|听起来|这就意味着)/, "").replace(/[，。！？；：、“”]/g, " ").replace(/\s+/g, " ").trim();
  const year = resolveQueryYear(normalized);
  if (/(人民币|汇率)/.test(normalized) && /(走强|升值|上涨|走势|变化|冲到|涨幅)/.test(normalized)) return "人民币汇率近期走势";
  if (/(贸易顺差|进出口)/.test(normalized)) return [year, "货物贸易顺差是多少"].filter(Boolean).join("");
  if (/(外汇储备|外储)/.test(normalized)) return [year, "末外汇储备减少了多少"].filter(Boolean).join("");
  if (/(美联储|利率|降息|加息)/.test(normalized)) return [year, "美联储利率决议"].filter(Boolean).join("");
  if (/(医保|医疗保险)/.test(normalized)) return [year, compactSubject(normalized), "政策内容"].filter(Boolean).join("").slice(0, 42);
  if (/(养老|养老金)/.test(normalized)) return [year, compactSubject(normalized), "政策内容"].filter(Boolean).join("").slice(0, 42);
  return [year, compactSubject(normalized), "数据"].filter(Boolean).join("").slice(0, 42).trim();
}

function buildTopicResearchQuery(source: string, claim: string, category: string) {
  const topic = detectTopicSubject(source);
  if (topic === "人民币汇率") {
    if (category === "current") return "人民币汇率近期走势";
    if (category === "historical") return "人民币汇率双向波动历史";
    if (category === "macro") return "人民币汇率走强原因";
  }
  if (category === "current") return `${topic}近期变化`;
  if (category === "historical") return `${topic}历史变化`;
  if (category === "macro") return `${topic}影响因素`;
  return buildFocusedQuery(claim);
}

function detectTopicSubject(source: string) {
  if (/(人民币|汇率)/.test(source)) return "人民币汇率";
  if (/(医保|医疗保险)/.test(source)) return "医保";
  if (/(养老|养老金)/.test(source)) return "养老";
  if (/(保险)/.test(source)) return "保险";
  return compactSubject(source) || "核心话题";
}

function compactSubject(value: string) {
  return value
    .replace(/(?:19|20)\d{2}年?/g, "")
    .replace(/(最近|近期|当前|今年|去年|数据显示|官方|公布|发布|按照|根据|接近|明显|出现)/g, " ")
    .replace(/\d+(?:[.,]\d+)*(?:%|万亿|亿|万|元|美元|人民币|年|月|日|个点)?/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 24);
}

function assessClaim(id: string, claim: string, query: string, sources: TrafficEvidenceSource[]): TrafficEvidenceClaim {
  const inputNumbers = extractNumbers(claim);
  const evidenceNumbers = [...new Set(sources.flatMap((source) => extractNumbers(`${source.title} ${source.snippet}`)))];
  const sharedNumbers = inputNumbers.filter((number) => evidenceNumbers.includes(number));
  const inputPrecisionNumbers = inputNumbers.filter(isPrecisionNumber);
  const sharedPrecisionNumbers = sharedNumbers.filter(isPrecisionNumber);
  const hasAuthoritativeSource = sources.some((source) => source.authorityScore >= 80);
  let status: TrafficEvidenceClaim["status"] = "unresolved";
  let conflictNote = "";
  if (sources.length > 0 && inputNumbers.length === 0) status = hasAuthoritativeSource ? "supported" : "partially_supported";
  else if (sharedNumbers.length > 0 && (inputPrecisionNumbers.length === 0 || sharedPrecisionNumbers.length > 0)) status = hasAuthoritativeSource ? "supported" : "partially_supported";
  else if (sources.length > 0 && sharedNumbers.length > 0 && inputPrecisionNumbers.length > 0) {
    status = "partially_supported";
    conflictNote = "搜索材料支持事件或时间阶段，但未直接支持原稿中的精确点位、比例或金额；成稿可保留事件作用，不应沿用该精确数字。";
  }
  else if (sources.length > 0 && isForecastOrQuestion(claim)) {
    status = "partially_supported";
    conflictNote = "该数字是目标点位或疑问，不是已发生事实；只核验当前背景，不把目标点位写成事实。";
  } else if (sources.length > 0 && inputNumbers.length > 0 && evidenceNumbers.length > 0 && hasAuthoritativeSource) {
    status = "potential_conflict";
    conflictNote = `原稿数字[${inputNumbers.join("、")}]与高等级搜索摘要数字[${evidenceNumbers.slice(0, 8).join("、")}]未直接匹配，需人工或规划阶段比较口径。`;
  } else if (sources.length > 0) status = "partially_supported";
  return { id, claim, query, status, inputNumbers, evidenceNumbers, conflictNote, sources };
}

function isPrecisionNumber(value: string) {
  return /[.．]|%|万亿|亿|万|元|美元|人民币|个点/.test(value);
}

function extractNumbers(value: string) {
  return [...new Set((value.match(/\d+(?:[.,]\d+)*(?:%|万亿|亿|万|元|美元|人民币|年|月|日|个点)?/g) ?? [])
    .map((item) => item.replace(/,/g, "").trim()))];
}

function normalizeSnippet(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 420);
}

function toEvidenceSource(item: EvidenceSearchResult): TrafficEvidenceSource {
  const authority = scoreSourceAuthority(item.url ?? "");
  return {
    title: item.title ?? "",
    url: item.url ?? "",
    publishedAt: item.published_date,
    snippet: normalizeSnippet(item.content ?? ""),
    provider: item.provider ?? "tavily",
    authorityTier: authority.tier,
    authorityScore: authority.score,
    publisherKey: publisherKey(item.url ?? ""),
  };
}

export function publisherKey(url: string) {
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    const parts = hostname.split(".");
    if (parts.length <= 2) return hostname;
    const suffix = parts.slice(-2).join(".");
    if (["com.cn", "org.cn", "gov.cn", "com.hk", "co.uk"].includes(suffix)) return parts.slice(-3).join(".");
    return suffix;
  } catch {
    return url.trim().toLowerCase();
  }
}

function scoreMaterialRelevance(source: TrafficEvidenceSource, query: string, claims: string[]) {
  const haystack = `${source.title} ${source.snippet}`.toLowerCase();
  const keywords = extractMaterialKeywords(`${query} ${claims.join(" ")}`);
  const matched = keywords.filter((keyword) => haystack.includes(keyword));
  const keywordScore = keywords.length > 0 ? Math.round((matched.length / Math.min(keywords.length, 8)) * 70) : 0;
  const queryTokens = semanticTokens(query);
  const sourceTokens = semanticTokens(haystack);
  const genericOverlap = [...queryTokens].filter((token) => sourceTokens.has(token)).length;
  const genericScore = Math.min(70, genericOverlap * 14);
  const evidenceBonus = extractNumbers(haystack).length > 0 ? 15 : 0;
  const explanatoryBonus = /(影响|原因|风险|意味着|家庭|企业|成本|支出|负债|案例|建议)/.test(haystack) ? 15 : 0;
  return Math.min(100, Math.max(keywordScore, genericScore) + evidenceBonus + explanatoryBonus);
}

function extractMaterialKeywords(value: string) {
  const known = ["人民币", "汇率", "外汇储备", "贸易顺差", "进出口", "美联储", "利率", "留学", "换汇", "家庭", "企业", "美元", "医保", "养老", "保险", "负债", "成本"];
  return [...new Set(known.filter((keyword) => value.includes(keyword)))];
}

function buildMaterialReason(source: TrafficEvidenceSource, purpose: TrafficEvidenceSearchPlan["calls"][number]["purpose"], relevanceScore: number) {
  if (source.authorityTier === "official" && extractNumbers(`${source.title} ${source.snippet}`).length > 0) return "可补充权威数据或事实口径";
  if (/(影响|原因|风险|意味着)/.test(`${source.title} ${source.snippet}`)) return "可补充核心论点的解释或影响";
  if (/(案例|家庭|企业|留学|换汇|成本|支出)/.test(`${source.title} ${source.snippet}`)) return "可补充受众场景或案例素材";
  return purpose === "claim_verification" && relevanceScore >= 40 ? "核验结果中发现的相关补充材料" : "与核心事实相关的背景材料";
}

function inferMaterialPurpose(source: TrafficEvidenceSource): NonNullable<TrafficEvidenceSource["purpose"]> {
  const value = `${source.title} ${source.snippet}`;
  if (/(比较|区别|对比|不同)/.test(value)) return "comparison";
  if (/(案例|家庭|企业|场景)/.test(value)) return "enrichment";
  if (/(原因|机制|意味着|如何)/.test(value)) return "explanation";
  return "background";
}

function resolveQueryYear(value: string) {
  const explicit = value.match(/(?:19|20)\d{2}年?/)?.[0];
  if (explicit) return explicit.endsWith("年") ? explicit : `${explicit}年`;
  const currentYear = new Date().getFullYear();
  if (value.includes("去年")) return `${currentYear - 1}年`;
  if (value.includes("今年")) return `${currentYear}年`;
  return /(最近|近期|当前)/.test(value) ? "近期" : "";
}

function classifySearchIntent(claim: string) {
  if (/(外汇储备|外储|汇改|2005年|2015年)/.test(claim)) return "historical";
  if (/(贸易顺差|进出口|美联储|利率|北向资金|外资)/.test(claim)) return "macro";
  if (/(人民币|汇率)/.test(claim) && /(最近|近期|当前|走强|升值|上涨|冲到|涨幅)/.test(claim)) return "current";
  return "other";
}

function diversifySearchIntents<T extends { category: string; priority: number }>(items: T[]) {
  const preferred = ["current", "historical", "macro", "other"];
  const selected: T[] = [];
  for (const category of preferred) {
    const match = items.filter((item) => item.category === category).sort((a, b) => b.priority - a.priority)[0];
    if (match) selected.push(match);
  }
  return [...selected, ...items.filter((item) => !selected.includes(item))];
}

function isForecastOrQuestion(value: string) {
  return /(能不能|会不会|是否|要不要|可能|预测|目标|冲到|跌到|涨到)/.test(value);
}

function isFocusedSearchQuery(value: string) {
  if (!value) return false;
  if (/(国家外汇局|海关总署|官方|原因|影响|风险|案例)/.test(value)) return false;
  if (/\d/.test(value.replace(/(?:19|20)\d{2}年/g, ""))) return false;
  return !/(为什么|怎么办|值不值得|要不要买)/.test(value);
}

function isAnswerStuffedQuery(value: string) {
  const mechanismTerms = ["贸易顺差", "资本流动", "资金流动", "美元走势", "结售汇", "外资", "利率", "政策"];
  return mechanismTerms.filter((term) => value.includes(term)).length >= 3;
}
