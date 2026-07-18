import type { HotTopic } from "./types";

type TavilyResult = {
  title?: string;
  url?: string;
  content?: string;
  published_date?: string;
  score?: number;
};

type TavilyPayload = {
  results?: TavilyResult[];
};

const searchEndpoint = () => process.env.TAVILY_API_BASE ?? process.env.SEARCH_API_BASE ?? "https://api.tavily.com/search";

export async function enrichTopicsWithSearch(topics: HotTopic[], options: { refresh?: boolean } = {}) {
  const tavilyKey = process.env.TAVILY_API_KEY ?? process.env.SEARCH_API_KEY;
  if (!tavilyKey || topics.length === 0) return topics;

  const limit = Number(process.env.TOPIC_SEARCH_ENRICH_LIMIT ?? 8);
  const selected = topics.slice(0, limit);
  const rest = topics.slice(limit);
  const enriched = await Promise.all(
    selected.map((topic) => (topic.sourceUrl ? topic : enrichTopic(topic, tavilyKey, options))),
  );

  return [...enriched, ...rest];
}

export async function discoverTopicsWithSearch(options: { refresh?: boolean } = {}) {
  const tavilyKey = process.env.TAVILY_API_KEY ?? process.env.SEARCH_API_KEY;
  if (!tavilyKey) return [];

  const queries = [
    "今天 热搜 普通人 家庭 风险 涨价 裁员 医疗 养老 最新事件",
    "最新社会新闻 普通家庭 医疗费用 养老金 生育 教育 住房 就业",
    "企业涨价 停产 裁员 倒闭 供应链 物价 普通人 影响 最新",
    "医保 商业医疗险 养老 保险 政策 家庭风险 最新",
    "突发事故 暴雨 火灾 车祸 赔偿 医疗支出 家庭风险 最新",
    "年轻人 父母 孩子 老人 收入中断 健康风险 社会热点",
  ];

  const responses = await Promise.allSettled(queries.map((query) => tavilySearch(query, tavilyKey, options, 8)));
  const results = responses
    .flatMap((response) => (response.status === "fulfilled" ? response.value : []))
    .filter((result) => result.title && result.url && isProfessionalInsuranceResult(result.title, result.url));

  const seen = new Set<string>();
  const candidates: Array<{ result: TavilyResult; title: string }> = [];
  for (const result of results) {
    if (!result.title || !result.url) continue;
    const title = normalizeTitle(result.title);
    if (!title || seen.has(title)) continue;
    seen.add(title);
    candidates.push({ result, title });
    if (candidates.length >= 12) break;
  }

  return Promise.all(candidates.map(async ({ result, title }, index): Promise<HotTopic> => {
    const readerText = await readUrl(result.url ?? "");
    const evidence = summarizeEvidence(readerText || result.content || title);
    return {
      id: `search-${encodeURIComponent(title).slice(0, 48)}`,
      title,
      summary: evidence || result.content || "来自实时搜索结果，建议发布前再次核验来源。",
      source: "实时搜索 · Tavily/Jina",
      heat: index < 3 ? "高" : "中",
      category: inferSearchCategory(title),
      insuranceRelevance: inferSearchRelevance(title),
      recommendedAngle: buildSearchAngle(title),
      riskNote: "引用最新信息时先核验来源和发布时间，不做收益、理赔或核保结果承诺。",
      sourceUrl: result.url,
      sourceTitle: result.title,
      sourcePublishedAt: result.published_date,
      evidence,
    };
  }));
}

async function enrichTopic(topic: HotTopic, tavilyKey: string, options: { refresh?: boolean }) {
  try {
    const result = await searchTopic(topic, tavilyKey, options);
    if (!result?.url) return topic;

    const readerText = await readUrl(result.url);
    const evidence = summarizeEvidence(readerText || result.content || topic.summary);
    const sourceTitle = result.title?.trim() || topic.title;

    return {
      ...topic,
      summary: evidence || topic.summary,
      source: `${topic.source} · 搜索增强`,
      sourceUrl: result.url,
      sourceTitle,
      sourcePublishedAt: result.published_date,
      evidence,
      riskNote: `${topic.riskNote} 引用热点时建议标注来源，并避免把未经核实的讨论当作确定事实。`,
    };
  } catch {
    return topic;
  }
}

async function searchTopic(topic: HotTopic, tavilyKey: string, options: { refresh?: boolean }) {
  const results = await tavilySearch(`${topic.title} 最新 背景 影响 家庭 风险`, tavilyKey, options, 3);
  return results
    .filter((item) => item.url && item.title)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0] ?? null;
}

async function tavilySearch(query: string, tavilyKey: string, options: { refresh?: boolean }, maxResults: number) {
  const response = await fetch(searchEndpoint(), {
    method: "POST",
    cache: options.refresh ? "no-store" : undefined,
    next: options.refresh ? undefined : { revalidate: 1800 },
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${tavilyKey}`,
    },
    body: JSON.stringify({
      query,
      search_depth: "basic",
      max_results: maxResults,
      include_answer: false,
      include_raw_content: false,
      days: 30,
    }),
    signal: AbortSignal.timeout(Number(process.env.TOPIC_SEARCH_TIMEOUT_MS ?? 8000)),
  });

  if (!response.ok) return [];
  const payload = (await response.json()) as TavilyPayload;
  return payload.results ?? [];
}

async function readUrl(url: string) {
  const jinaKey = process.env.JINA_API_KEY;
  if (!jinaKey) return "";

  try {
    const response = await fetch(`https://r.jina.ai/${url}`, {
      signal: AbortSignal.timeout(Number(process.env.JINA_TIMEOUT_MS ?? 7000)),
      headers: {
        authorization: `Bearer ${jinaKey}`,
        accept: "text/plain",
      },
    });
    if (!response.ok) return "";
    return response.text();
  } catch {
    return "";
  }
}

function summarizeEvidence(input: string) {
  return input
    .replace(/\s+/g, " ")
    .replace(/#+\s*/g, "")
    .trim()
    .slice(0, 220);
}

function normalizeTitle(title: string) {
  return title
    .replace(/\s+/g, " ")
    .replace(/[|｜].*$/, "")
    .replace(/[_-](凤凰网|新浪.*|腾讯.*|网易.*|搜狐.*|今日头条).*$/, "")
    .trim()
    .slice(0, 72);
}

function isInsuranceRelevant(title: string) {
  return /保险|医保|社保|养老|养老金|医疗|医院|药|健康|重疾|意外|车险|理赔|家庭|退休|护理|涨价|降价|裁员|倒闭|停产|赔偿|补偿|事故|火灾|暴雨|台风|教育|生育|住房|就业|收入|工资|物价|父母|孩子|老人|年轻人/.test(title);
}

function isProfessionalInsuranceResult(title: string, url = "") {
  if (!isInsuranceRelevant(title)) return false;
  if (/youtube\.com|youtu\.be|\.pdf(\?|$)|download|uploads|research|paper/i.test(url)) return false;
  if (/YouTube|PDF|调研报告|研究报告|白皮书|论文|报告下载|大学经济学院|国务院办公厅关于|保险网|网上买保险|买保险推荐|推荐平台|保险商城|产品中心|app下载|百科|招商|招聘|太平洋保险|平安保险/.test(title)) return false;
  if (/配置指南|配置方案|需要配置多少保险|怎么买|哪种好|排行榜/.test(title)) return false;
  if (!/(2025|2026|最新|今天|热搜|回应|发布|通知|政策|新规|调整|上涨|下降|涨价|降价|裁员|倒闭|停产|事故|赔偿|补偿|费用|负担|补贴|报销|医保|养老金|社保|改革|生育|教育|住房|就业|医疗|养老)/.test(title)) return false;
  return true;
}

function inferSearchCategory(title: string): string {
  if (/医保|医疗|医院|药|健康|重疾|护理/.test(title)) return "健康医疗";
  if (/养老|养老金|退休/.test(title)) return "养老规划";
  if (/意外|车险|理赔|灾害|事故/.test(title)) return "意外与财产风险";
  if (/裁员|倒闭|停产|工资|就业|收入/.test(title)) return "收入与企业主风险";
  if (/涨价|降价|物价|住房|房贷|消费/.test(title)) return "家庭现金流";
  if (/生育|教育|孩子|父母|老人/.test(title)) return "家庭责任";
  if (/社保|政策|监管|新规|调整/.test(title)) return "政策与社保";
  return "家庭保障";
}

function inferSearchRelevance(title: string): HotTopic["insuranceRelevance"] {
  if (/医保|医疗|医院|药|健康|重疾|护理|养老|养老金|退休|社保|事故|火灾|暴雨|车祸|裁员|倒闭|停产|赔偿|补偿|生育/.test(title)) return "高";
  return "中";
}

function buildSearchAngle(title: string): string {
  if (/医保|医疗|医院|药/.test(title)) return "从医保和商业医疗险的边界切入，讲清家庭医疗费用需要提前准备。";
  if (/养老|养老金|退休/.test(title)) return "从退休现金流切入，讲清社保、储蓄和商业养老规划的分工。";
  if (/重疾|健康|护理/.test(title)) return "从健康风险对投保和家庭现金流的影响切入，提醒尽早配置基础保障。";
  if (/理赔|车险|意外|事故/.test(title)) return "从真实风险场景切入，讲清保障责任、免责条款和理赔材料准备。";
  if (/裁员|倒闭|停产|工资|就业|收入/.test(title)) return "从收入中断和家庭责任切入，提醒普通家庭不要把安全感押在单一收入来源上。";
  if (/涨价|降价|物价|住房|房贷|消费/.test(title)) return "从生活成本和现金流压力切入，讲清应急金、保障预算和长期规划的顺序。";
  if (/生育|教育|孩子|父母|老人/.test(title)) return "从家庭责任周期切入，把教育、赡养、医疗和收入保障放在同一张风险清单里讲。";
  return "先解释热点背后的家庭风险，再转化为保障规划提醒，避免直接推销单一产品。";
}
