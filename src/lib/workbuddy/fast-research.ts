import { runInsuranceContentAgent } from "@/lib/agent/insurance-agent";
import { searchVolcengineWeb, type VolcengineSearchResult } from "@/lib/search/volcengine-search";
type WorkbuddyRuntimeEvent = {
  type: string;
  message?: string;
  data?: Record<string, unknown>;
};

type FastResearchPlan = {
  queries: Array<{ query: string; purpose: string }>;
  evidenceTarget: string;
};

export type FastResearchTrace = {
  mode: "answer" | "discovery";
  evidenceTarget: string;
  queries: Array<{ query: string; purpose: string; resultCount: number; newSourceCount: number }>;
  sourceCount: number;
  elapsedMs: number;
};

export type FastResearchResult = {
  sources: VolcengineSearchResult[];
  trace: FastResearchTrace;
  queryResults: Array<{ query: string; purpose: string; results: VolcengineSearchResult[] }>;
};

export async function runFastResearch(input: {
  objective: string;
  context: string;
  initialQueries?: string[];
  userId: string;
  onEvent?: (event: WorkbuddyRuntimeEvent) => void;
  signal?: AbortSignal;
  verifyEmergentCriticalFacts?: boolean;
  maxQueries?: number;
  mode?: "answer" | "discovery";
}) {
  const startedAt = Date.now();
  assertRunning(input.signal);
  const mode = input.mode ?? "answer";
  input.onEvent?.({ type: "fast_research.scope", message: mode === "discovery" ? "Fast Research 正在规划热点补源范围" : "Fast Research 正在确定最小证据范围" });
  const plan = await planFastResearch(input);
  input.onEvent?.({ type: "fast_research.plan", message: `已形成快速检索计划：${plan.queries.length} 个${mode === "discovery" ? "候选发现方向" : "证据问题"}`, data: { queries: plan.queries, evidenceTarget: plan.evidenceTarget, mode } });
  const initialBatches = await Promise.all(plan.queries.map(async ({ query, purpose }) => {
    assertRunning(input.signal);
    input.onEvent?.({ type: "search.query", message: `快速检索：${query}`, data: { query, purpose, mode: "fast" } });
    const results = await searchVolcengineWeb(query, { count: 6, timeoutMs: 9_000, requireContent: true });
    return { query, purpose, results };
  }));
  assertRunning(input.signal);
  const verificationQueries = input.verifyEmergentCriticalFacts
    ? await planEmergentCriticalFactVerification(input, initialBatches)
    : [];
  const verificationBatches = await Promise.all(verificationQueries.map(async ({ query, purpose }) => {
    assertRunning(input.signal);
    input.onEvent?.({ type: "search.query", message: `关键事实复核：${query}`, data: { query, purpose, mode: "fast" } });
    const results = await searchVolcengineWeb(query, { count: 8, timeoutMs: 9_000, requireContent: true });
    return { query, purpose, results };
  }));
  const batches = [...initialBatches, ...verificationBatches];
  assertRunning(input.signal);
  const seenUrls = new Set<string>();
  const sources: VolcengineSearchResult[] = [];
  const queryTrace = batches.map((batch) => {
    let added = 0;
    for (const result of batch.results) {
      if (seenUrls.has(result.url)) continue;
      seenUrls.add(result.url);
      sources.push(result);
      added += 1;
    }
    input.onEvent?.({ type: "search.query_completed", message: `“${batch.query}”命中 ${batch.results.length} 条，新增 ${added} 个来源`, data: { query: batch.query, count: batch.results.length, added, mode: "fast", results: batch.results.map(({ title, url, publishedDate }) => ({ title, url, publishedDate })) } });
    return { query: batch.query, purpose: batch.purpose, resultCount: batch.results.length, newSourceCount: added };
  });
  const trace: FastResearchTrace = { mode, evidenceTarget: plan.evidenceTarget, queries: queryTrace, sourceCount: Math.min(sources.length, 12), elapsedMs: Date.now() - startedAt };
  input.onEvent?.({ type: "fast_research.completed", message: `快速研究完成：${queryTrace.length} 次并发检索，保留 ${trace.sourceCount} 个来源`, data: trace });
  return {
    sources: sources.slice(0, 12),
    trace,
    queryResults: batches.map(({ query, purpose, results }) => ({ query, purpose, results })),
  } satisfies FastResearchResult;
}

async function planEmergentCriticalFactVerification(
  input: { objective: string; context: string; userId: string; signal?: AbortSignal },
  batches: Array<{ query: string; purpose: string; results: VolcengineSearchResult[] }>,
) {
  const excerpts = batches.flatMap((batch) => batch.results.slice(0, 5).map((result) => ({
    query: batch.query,
    title: result.title,
    url: result.url,
    publishedDate: result.publishedDate,
    content: result.content.slice(0, 500),
  }))).slice(0, 12);
  if (excerpts.length === 0) return [];
  const prompt = `你是事实复核编辑。第一轮搜索可能首次带回了原问题中没有的新事实。只挑选会改变热点成立与否或结论方向的高风险事实，规划第二轮交叉核验，不写答案。

高风险事实包括：人物去世及精确日期、法院判决、遗嘱或信托生效/终止、资产最终归属、案件结果、政策生效、当事人动机。普通背景和观点不复核。
要求：
- 最多输出3条查询，每条只核验一个完整事实；查询须包含主体和待核验的事件/状态，不能只搜宽泛主题。
- 优先寻找官方、司法文件、当事人原话或可靠媒体的独立报道。
- 不要照抄第一轮查询，不要在Query里预设未经核实的日期或结论。
- 没有高风险新事实时返回空数组。

只返回JSON：{"queries":[{"query":"主体+待核验事实","purpose":"要核验的事实"}]}

【目标】${input.objective}
【第一轮结果】${JSON.stringify(excerpts)}`;
  try {
    assertRunning(input.signal);
    const raw = await runInsuranceContentAgent([{ role: "user", content: prompt }], input.userId, "general");
    const parsed = normalizeFastResearchPlan(raw);
    if (!parsed) return [];
    const initialKeys = new Set(batches.map((item) => item.query.replace(/\s+/g, "").toLocaleLowerCase("zh-CN")));
    return parsed.queries.filter((item) => !initialKeys.has(item.query.replace(/\s+/g, "").toLocaleLowerCase("zh-CN"))).slice(0, 3);
  } catch {
    // A failed verification planner must not discard the first-round evidence.
    return [];
  }
}

async function planFastResearch(input: { objective: string; context: string; initialQueries?: string[]; userId: string; maxQueries?: number; mode?: "answer" | "discovery" }) {
  const maxQueries = Math.max(1, Math.min(6, Math.floor(input.maxQueries ?? 3)));
  const suggestedQueries = normalizeSuggestedQueries(input.initialQueries, maxQueries);
  if (suggestedQueries.length > 0) {
    return {
      queries: suggestedQueries.map((query) => ({ query, purpose: "核验与当前目标直接相关的公开事实" })),
      evidenceTarget: "取得足以完成当前目标的可追溯公开证据",
    };
  }

  const now = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "full", timeStyle: "medium" }).format(new Date());
  const discoveryInstruction = input.mode === "discovery" ? `当前任务是发现并扩充热点候选池，不是解释某个热点为什么火，也不是核验已有候选。查询应根据用户目标覆盖不同热点来源或领域，寻找榜单可能遗漏的当日新事件；不要预设具体事件名称。` : "当前任务是取得回答所需的最小证据包。";
  const prompt = `你是通用 Fast Research 的轻量检索规划器。${discoveryInstruction}只规划搜索，不写答案。

当前北京时间：${now}
问题：${input.objective}
补充上下文：${input.context || "无"}
主 Agent 建议查询（仅参考）：${input.initialQueries?.join("；") || "无"}

要求：
- 自主生成 1–${maxQueries} 个短而自然、彼此不重复的查询；简单单事实问题不必凑数。
- 查询覆盖一手来源或可靠交叉来源，但不要机械限定 gov.cn。
- 不使用未经确认支持的日期区间语法；涉及今天/当前时，在自然查询中写明正确日期。
- evidenceTarget 说明取得什么候选或证据即可停止，不扩大研究范围。

只输出 JSON：{"queries":[{"query":"...","purpose":"..."}],"evidenceTarget":"..."}`;
  let raw = "";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    raw = await runInsuranceContentAgent([{ role: "user", content: attempt ? `${prompt}\n上次输出无法解析：${raw.slice(0, 800)}。只返回合法 JSON。` : prompt }], input.userId, "general");
    const parsed = normalizeFastResearchPlan(raw, maxQueries);
    if (parsed) return parsed;
  }

  // A formatting mistake in the lightweight planner must not prevent research.
  // The user's objective is itself a valid last-resort search query.
  const objectiveQuery = input.objective.trim().slice(0, 180);
  if (objectiveQuery.length >= 2) {
    return {
      queries: [{ query: objectiveQuery, purpose: "直接检索并核验用户目标" }],
      evidenceTarget: "取得足以完成当前目标的可追溯公开证据",
    };
  }
  throw new Error("Fast Research 缺少可执行的研究目标");
}

export function normalizeFastResearchPlan(raw: string, maxQueries = 3): FastResearchPlan | null {
  const json = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]
    ?? raw.match(/\{[\s\S]*\}/)?.[0]
    ?? "";
  if (!json) return null;

  try {
    const value = JSON.parse(json) as Record<string, unknown>;
    const queryValue = value.queries ?? value.searchQueries ?? value.search_queries ?? value.query;
    const items = Array.isArray(queryValue) ? queryValue : queryValue ? [queryValue] : [];
    const queries: FastResearchPlan["queries"] = [];
    const seen = new Set<string>();

    for (const item of items) {
      const query = typeof item === "string"
        ? item
        : item && typeof item === "object"
          ? String((item as Record<string, unknown>).query ?? (item as Record<string, unknown>).q ?? "")
          : "";
      const normalizedQuery = query.trim().slice(0, 180);
      const key = normalizedQuery.toLocaleLowerCase("zh-CN");
      if (normalizedQuery.length < 2 || seen.has(key)) continue;
      seen.add(key);
      const rawPurpose = item && typeof item === "object"
        ? (item as Record<string, unknown>).purpose ?? (item as Record<string, unknown>).reason
        : undefined;
      const purpose = typeof rawPurpose === "string" && rawPurpose.trim().length >= 2
        ? rawPurpose.trim().slice(0, 200)
        : "核验与当前目标直接相关的公开事实";
      queries.push({ query: normalizedQuery, purpose });
      if (queries.length === Math.max(1, Math.min(6, Math.floor(maxQueries)))) break;
    }

    if (queries.length === 0) return null;
    const rawTarget = value.evidenceTarget ?? value.evidence_target ?? value.target;
    const evidenceTarget = typeof rawTarget === "string" && rawTarget.trim().length >= 2
      ? rawTarget.trim().slice(0, 300)
      : "取得足以完成当前目标的可追溯公开证据";
    return { queries, evidenceTarget };
  } catch {
    return null;
  }
}

function normalizeSuggestedQueries(queries?: string[], maxQueries = 3) {
  const seen = new Set<string>();
  return (queries ?? []).flatMap((query) => {
    const normalized = query.trim().slice(0, 180);
    const key = normalized.toLocaleLowerCase("zh-CN");
    if (normalized.length < 2 || seen.has(key)) return [];
    seen.add(key);
    return [normalized];
  }).slice(0, Math.max(1, Math.min(6, Math.floor(maxQueries))));
}

function assertRunning(signal?: AbortSignal) {
  if (signal?.aborted) throw new Error("任务已停止");
}
