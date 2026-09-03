import { z } from "zod";
import { runInsuranceContentAgent } from "@/lib/agent/insurance-agent";
import { searchVolcengineWeb, type VolcengineSearchResult } from "@/lib/search/volcengine-search";
import type { WorkbuddyRuntimeEvent } from "./runtime";

const researchActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("search"), query: z.string().min(2).max(100), purpose: z.string().min(2).max(300) }),
  z.object({ type: z.literal("reflect"), findings: z.array(z.string().max(500)).max(8), gaps: z.array(z.string().max(500)).max(8), nextIntent: z.string().min(2).max(500) }),
  z.object({ type: z.literal("ask_user"), question: z.string().min(2).max(800), reason: z.string().min(2).max(300) }),
  z.object({ type: z.literal("finish"), reason: z.string().min(2).max(500) }),
]);

type ResearchAction = z.infer<typeof researchActionSchema>;
type ResearchTraceEntry = { iteration: number; action: ResearchAction; observation: string; newSourceCount?: number };

export type DeepResearchTrace = {
  brief: string;
  rounds: Array<{ round: number; queries: Array<{ query: string; purpose: string }>; sourceCount: number; assessment: { sufficient: boolean; findings: string[]; gaps: string[]; nextQueries: Array<{ query: string; purpose: string }>; stopReason: string } }>;
  actions: ResearchTraceEntry[];
  stopReason: string;
  totalQueries: string[];
};

export async function runDeepResearch(input: {
  objective: string;
  context: string;
  initialQueries?: string[];
  userId: string;
  onEvent?: (event: WorkbuddyRuntimeEvent) => void;
  signal?: AbortSignal;
}) {
  const now = currentBeijingTime();
  const sources: VolcengineSearchResult[] = [];
  const seenUrls = new Set<string>();
  const seenQueries = new Set<string>();
  const reflections: Array<{ findings: string[]; gaps: string[]; nextIntent: string }> = [];
  const trace: DeepResearchTrace = { brief: input.objective, rounds: [], actions: [], stopReason: "", totalQueries: [] };
  const maxActions = 12;
  const maxSearches = 8;
  let actionTimeouts = 0;
  input.onEvent?.({ type: "research.scope", message: "深度研究 Agent 正在读取目标与当前证据", data: { objective: input.objective, maxActions, maxSearches } });

  for (let iteration = 1; iteration <= maxActions; iteration += 1) {
    assertRunning(input.signal);
    let action: ResearchAction;
    try {
      action = await decideResearchAction({ userId: input.userId, objective: input.objective, context: input.context, now, iteration, maxActions, maxSearches, sources, trace, reflections, initialQueries: input.initialQueries });
    } catch (error) {
      if (!isModelTimeout(error)) throw error;
      actionTimeouts += 1;
      const observation = `研究决策模型第 ${actionTimeouts} 次超时，已保留 ${sources.length} 个现有来源`;
      const recoveryAction: ResearchAction = { type: "reflect", findings: [], gaps: ["本轮研究决策超时"], nextIntent: sources.length ? "基于已有证据形成有边界的结论" : "缩小问题后重试一次" };
      trace.actions.push({ iteration, action: recoveryAction, observation });
      input.onEvent?.({ type: "research.timeout_recovered", message: observation, data: { iteration, actionTimeouts, sourceCount: sources.length } });
      if (sources.length) { trace.stopReason = "研究决策超时，已使用成功取得的部分证据完成交付"; break; }
      if (actionTimeouts < 2) continue;
      trace.stopReason = "研究决策连续超时且尚未取得公开证据";
      break;
    }
    input.onEvent?.({ type: "research.action", message: describeAction(action), data: { iteration, action, remainingActions: maxActions - iteration, remainingSearches: maxSearches - seenQueries.size } });

    if (action.type === "ask_user") {
      trace.stopReason = `需要用户补充：${action.reason}`;
      trace.actions.push({ iteration, action, observation: trace.stopReason });
      throw new Error(`研究需要用户补充：${action.question}`);
    }
    if (action.type === "finish") {
      if (!sources.length) {
        trace.actions.push({ iteration, action, observation: "没有任何公开证据，拒绝结束研究" });
        input.onEvent?.({ type: "research.guard", message: "尚未取得公开证据，不能结束研究", data: { iteration } });
        continue;
      }
      if (!reflections.length) {
        trace.actions.push({ iteration, action, observation: "尚未进行证据反思，拒绝结束研究" });
        input.onEvent?.({ type: "research.guard", message: "结束前需要检查证据覆盖、冲突与缺口", data: { iteration } });
        continue;
      }
      trace.stopReason = action.reason;
      trace.actions.push({ iteration, action, observation: `研究完成：${action.reason}` });
      break;
    }
    if (action.type === "reflect") {
      reflections.push({ findings: action.findings, gaps: action.gaps, nextIntent: action.nextIntent });
      const observation = action.gaps.length ? `确认 ${action.findings.length} 项发现，仍有 ${action.gaps.length} 个缺口` : `确认 ${action.findings.length} 项发现，未发现关键缺口`;
      trace.actions.push({ iteration, action, observation });
      input.onEvent?.({ type: "research.reflect", message: observation, data: { iteration, findings: action.findings, gaps: action.gaps, nextIntent: action.nextIntent } });
      continue;
    }

    const key = queryKey(action.query);
    if (seenQueries.has(key)) {
      const observation = "该查询与已执行查询重复，没有产生新证据";
      trace.actions.push({ iteration, action, observation, newSourceCount: 0 });
      input.onEvent?.({ type: "research.guard", message: `跳过重复查询：${action.query}`, data: { iteration, query: action.query } });
      continue;
    }
    if (seenQueries.size >= maxSearches) {
      const observation = "搜索预算已经用完，请根据现有证据反思并结束";
      trace.actions.push({ iteration, action, observation, newSourceCount: 0 });
      input.onEvent?.({ type: "research.guard", message: observation, data: { iteration } });
      continue;
    }
    seenQueries.add(key);
    trace.totalQueries.push(action.query);
    input.onEvent?.({ type: "search.query", message: `检索：${action.query}`, data: { iteration, query: action.query, purpose: action.purpose } });
    const results = await searchVolcengineWeb(action.query, { count: 7, timeoutMs: 12_000, requireContent: true });
    let added = 0;
    for (const result of results) {
      if (!seenUrls.has(result.url)) { seenUrls.add(result.url); sources.push(result); added += 1; }
    }
    const observation = `命中 ${results.length} 条，新增 ${added} 个去重来源；结果：${results.slice(0, 5).map(item => `${item.title}（${item.publishedDate || "日期未知"}）`).join("；") || "无"}`;
    trace.actions.push({ iteration, action, observation, newSourceCount: added });
    trace.rounds.push({ round: iteration, queries: [{ query: action.query, purpose: action.purpose }], sourceCount: sources.length, assessment: { sufficient: false, findings: [], gaps: [], nextQueries: [], stopReason: "等待 Agent 根据本次观察决定下一步" } });
    input.onEvent?.({ type: "search.query_completed", message: `“${action.query}”命中 ${results.length} 条，新增 ${added} 个来源`, data: { iteration, query: action.query, count: results.length, added, results: results.map(({ title, url, publishedDate }) => ({ title, url, publishedDate })) } });
  }

  if (!trace.stopReason) trace.stopReason = sources.length ? "达到行动预算，使用当前证据形成有边界的报告" : "达到行动预算且没有取得可用公开证据";
  input.onEvent?.({ type: "research.completed", message: `研究完成：${trace.totalQueries.length} 次动态检索，保留 ${sources.length} 个来源`, data: { stopReason: trace.stopReason, actions: trace.actions.length, queries: trace.totalQueries, sources: sources.slice(0, 24).map(({ title, url, publishedDate }) => ({ title, url, publishedDate })) } });
  return { sources: sources.slice(0, 24), evidence: formatEvidence(sources.slice(0, 24)), trace };
}

async function decideResearchAction(input: {
  userId: string; objective: string; context: string; now: string; iteration: number; maxActions: number; maxSearches: number;
  sources: VolcengineSearchResult[]; trace: DeepResearchTrace; reflections: Array<{ findings: string[]; gaps: string[]; nextIntent: string }>; initialQueries?: string[];
}) {
  const state = {
    executedQueries: input.trace.totalQueries,
    recentObservations: input.trace.actions.slice(-6).map(item => ({ action: item.action, observation: item.observation })),
    evidence: input.sources.slice(0, 12).map((item, index) => ({ id: index + 1, title: item.title, url: item.url, publishedDate: item.publishedDate || "未知", sourceType: sourceTier(item.url), excerpt: item.content.slice(0, 450) })),
    reflections: input.reflections.slice(-3),
    remainingActions: input.maxActions - input.iteration,
    remainingSearches: input.maxSearches - input.trace.totalQueries.length,
  };
  const prompt = `你是小谷深度研究 Agent。研究策略由你根据目标和每次工具观察动态形成，不使用固定工作流，也不预先规划整批查询。

当前北京时间：${input.now}
用户目标：${input.objective}
用户资料：${input.context || "无"}
主Agent曾建议的查询（仅供参考，可以完全不用）：${input.initialQueries?.join("；") || "无"}
当前环境状态：${JSON.stringify(state)}

每轮只允许一个动作：
1. search：执行一个短而自然的搜索词，只解决当前最有信息增益的问题。
2. reflect：根据已有证据明确已验证发现、证据缺口以及下一步研究意图。
3. ask_user：只有关键歧义无法通过公开只读研究解决，并会导致完全不同结论时使用。
4. finish：证据足以回答或继续搜索没有明显信息增益时结束。

约束：
- 自主选择信息渠道。不得默认把研究限制在政府网站、保险行业或主Agent建议主题。
- 如果目标是发现“热点”，应先取得广泛候选和真实传播/热度信号，再针对候选追溯权威来源；政府网站通常用于核验而非发现。
- 如果目标是核验政策、条款或具体声明，应优先追溯一手来源。以上只是判断原则，不是固定步骤。
- 不要使用未经工具确认支持的特殊搜索语法或日期区间运算符；日期有效性应根据结果发布时间判断。
- 搜索摘要不是完整原文；来源日期未知、单一来源、来源冲突必须在反思中体现。
- 不得伪造来源、热度、数据或已经执行的动作。保险结论不得承诺收益、承保或理赔。
- 已有足够证据时应结束；查询重复、连续无新增来源或预算不足时应调整或停止。

只输出一个JSON动作：
{"type":"search","query":"...","purpose":"..."}
或 {"type":"reflect","findings":["..."],"gaps":["..."],"nextIntent":"..."}
或 {"type":"ask_user","question":"...","reason":"..."}
或 {"type":"finish","reason":"..."}`;
  const action = await modelAction(prompt, input.userId);
  if (!action) throw new Error("深度研究 Agent 未能形成有效的下一步动作");
  return action;
}

async function modelAction(prompt: string, userId: string): Promise<ResearchAction | null> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const raw = await runInsuranceContentAgent([{ role: "user", content: attempt ? `${prompt}\n\n上次输出无法解析。只返回一个合法JSON动作。` : prompt }], userId, "general", { timeoutSeconds: 35 });
      const json = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? raw.match(/\{[\s\S]*\}/)?.[0] ?? "";
      const parsed = researchActionSchema.safeParse(JSON.parse(json));
      if (parsed.success) return parsed.data;
    } catch (error) {
      lastError = error;
      if (isRetryableConcurrencyError(error) && attempt < 2) { await new Promise(resolve => setTimeout(resolve, 700 * (attempt + 1))); continue; }
      if (attempt === 2 || isRetryableConcurrencyError(error)) throw error;
    }
  }
  if (lastError && isRetryableConcurrencyError(lastError)) throw lastError;
  return null;
}

function describeAction(action: ResearchAction) {
  if (action.type === "search") return `决定检索一个证据问题：${action.purpose}`;
  if (action.type === "reflect") return "正在根据当前证据反思覆盖、冲突与缺口";
  if (action.type === "ask_user") return `研究需要确认关键边界：${action.reason}`;
  return `决定结束研究：${action.reason}`;
}

function formatEvidence(sources: VolcengineSearchResult[]) {
  return sources.length ? sources.map((item, index) => `[来源${index + 1}] ${item.title}\nURL: ${item.url}\n发布时间: ${item.publishedDate || "未提供"}\n来源类型: ${sourceTier(item.url)}\n摘要: ${item.content.slice(0, 1000)}`).join("\n\n") : "本次没有获得可用的公开检索结果，不得声称已经联网核验。";
}
function sourceTier(url: string) { try { const host = new URL(url).hostname.toLowerCase(); if (host.endsWith(".gov.cn") || host.includes("pbc.gov.cn") || host.includes("nfra.gov.cn") || host.includes("nhsa.gov.cn")) return "官方/监管来源"; if (host.includes("cninfo.com.cn") || host.includes("sse.com.cn") || host.includes("szse.cn")) return "公告/交易所来源"; } catch { /* retain unclassified URL */ } return "公开网页（需交叉核验）"; }
function currentBeijingTime() { return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", weekday: "long", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()); }
function queryKey(value: string) { return value.toLowerCase().replace(/[\s，。；、：:!?！？"'“”‘’]/g, ""); }
function assertRunning(signal?: AbortSignal) { if (signal?.aborted) throw new Error("任务已停止"); }
function isRetryableConcurrencyError(error: unknown) { const message = error instanceof Error ? error.message : String(error); return /429|concurrency limit|rate limit|too many requests/i.test(message); }
function isModelTimeout(error: unknown) { const message = error instanceof Error ? `${error.name} ${error.message}` : String(error); return /timeout|timed out|aborted due to timeout|TimeoutError/i.test(message); }
