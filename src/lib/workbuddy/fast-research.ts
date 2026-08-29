import { runInsuranceContentAgent } from "@/lib/agent/insurance-agent";
import { searchVolcengineWeb, type VolcengineSearchResult } from "@/lib/search/volcengine-search";
import type { WorkbuddyRuntimeEvent } from "./runtime";

type FastResearchPlan = {
  queries: Array<{ query: string; purpose: string }>;
  evidenceTarget: string;
};

export type FastResearchTrace = {
  mode: "fast";
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
}) {
  const startedAt = Date.now();
  assertRunning(input.signal);
  input.onEvent?.({ type: "fast_research.scope", message: "Fast Research 正在确定最小证据范围" });
  const plan = await planFastResearch(input);
  input.onEvent?.({ type: "fast_research.plan", message: `已形成快速检索计划：${plan.queries.length} 个证据问题`, data: { queries: plan.queries, evidenceTarget: plan.evidenceTarget } });
  const batches = await Promise.all(plan.queries.map(async ({ query, purpose }) => {
    assertRunning(input.signal);
    input.onEvent?.({ type: "search.query", message: `快速检索：${query}`, data: { query, purpose, mode: "fast" } });
    const results = await searchVolcengineWeb(query, { count: 6, timeoutMs: 9_000, requireContent: true });
    return { query, purpose, results };
  }));
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
  const trace: FastResearchTrace = { mode: "fast", evidenceTarget: plan.evidenceTarget, queries: queryTrace, sourceCount: Math.min(sources.length, 12), elapsedMs: Date.now() - startedAt };
  input.onEvent?.({ type: "fast_research.completed", message: `快速研究完成：${queryTrace.length} 次并发检索，保留 ${trace.sourceCount} 个来源`, data: trace });
  return {
    sources: sources.slice(0, 12),
    trace,
    queryResults: batches.map(({ query, purpose, results }) => ({ query, purpose, results })),
  } satisfies FastResearchResult;
}

async function planFastResearch(input: { objective: string; context: string; initialQueries?: string[]; userId: string }) {
  const suggestedQueries = normalizeSuggestedQueries(input.initialQueries);
  if (suggestedQueries.length > 0) {
    return {
      queries: suggestedQueries.map((query) => ({ query, purpose: "核验与当前目标直接相关的公开事实" })),
      evidenceTarget: "取得足以完成当前目标的可追溯公开证据",
    };
  }

  const now = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "full", timeStyle: "medium" }).format(new Date());
  const prompt = `你是 Fast Research 的轻量检索规划器。针对一个简单问题，只规划回答所需的最小证据包，不写答案。

当前北京时间：${now}
问题：${input.objective}
补充上下文：${input.context || "无"}
主 Agent 建议查询（仅参考）：${input.initialQueries?.join("；") || "无"}

要求：
- 自主生成 1–3 个短而自然的查询；简单单事实问题通常只需 1–2 个。
- 查询覆盖一手来源或可靠交叉来源，但不要机械限定 gov.cn。
- 不使用未经确认支持的日期区间语法；涉及今天/当前时，在自然查询中写明正确日期。
- evidenceTarget 说明取得什么证据即可停止，不扩大研究范围。

只输出 JSON：{"queries":[{"query":"...","purpose":"..."}],"evidenceTarget":"..."}`;
  let raw = "";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    raw = await runInsuranceContentAgent([{ role: "user", content: attempt ? `${prompt}\n上次输出无法解析：${raw.slice(0, 800)}。只返回合法 JSON。` : prompt }], input.userId, "general");
    const parsed = normalizeFastResearchPlan(raw);
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

export function normalizeFastResearchPlan(raw: string): FastResearchPlan | null {
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
      if (queries.length === 3) break;
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

function normalizeSuggestedQueries(queries?: string[]) {
  const seen = new Set<string>();
  return (queries ?? []).flatMap((query) => {
    const normalized = query.trim().slice(0, 180);
    const key = normalized.toLocaleLowerCase("zh-CN");
    if (normalized.length < 2 || seen.has(key)) return [];
    seen.add(key);
    return [normalized];
  }).slice(0, 3);
}

function assertRunning(signal?: AbortSignal) {
  if (signal?.aborted) throw new Error("任务已停止");
}
