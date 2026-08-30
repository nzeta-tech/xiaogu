import { stringifyCreationFieldValue, type CreationFieldValue } from "@/lib/creation/output";
import { searchVolcengineWeb } from "@/lib/search/volcengine-search";

type ResearchResult = {
  title?: string;
  url?: string;
  content?: string;
  score?: number;
  published_date?: string;
  provider?: "volcengine" | "tavily" | "exa";
};

const tavilyEndpoint = () => process.env.TAVILY_API_BASE ?? "https://api.tavily.com/search";
const exaEndpoint = () => process.env.EXA_API_BASE ?? "https://api.exa.ai/search";

/**
 * Supplies a compact, attributable research pack for link-remix tasks. It is
 * deliberately best-effort: a missing key or a provider outage must never
 * block content creation.
 */
export async function buildLinkRemixResearchContext(values: Record<string, CreationFieldValue>) {
  const query = buildResearchQuery(values);
  if (!query) return "";

  const results = await searchPreferredWeb(query);
  if (results.length === 0) return "";

  const evidence = results
    .filter((item) => item.title && item.url)
    .slice(0, 3)
    .map((item, index) => {
      const summary = normalizeSnippet(item.content ?? "");
      return `${index + 1}. ${item.title}\n来源：${item.url}${summary ? `\n摘要：${summary}` : ""}`;
    })
    .join("\n\n");

  if (!evidence) return "";
  return [
    "补充检索资料（仅用于补足事实、场景和行动步骤）：",
    evidence,
    "使用规则：只引用资料中可明确支持的内容；不得把搜索摘要转写为收益、领取、理赔、核保或政策承诺。资料与原作冲突时，以可核验资料为准；资料不足时，保留具体问题和行动步骤，不编造数字或案例。",
  ].join("\n");
}

export async function searchPreferredWeb(query: string): Promise<ResearchResult[]> {
  const volcanic = await searchVolcengineWeb(query, {
    count: 5,
    timeoutMs: Number(process.env.LINK_REMIX_SEARCH_TIMEOUT_MS ?? 8000),
    requireContent: true,
  });
  if (volcanic.length > 0) return volcanic.map((item) => ({
    title: item.title, url: item.url, content: item.content, score: item.score,
    published_date: item.publishedDate, provider: "volcengine",
  }));
  const tavilyResults = await searchTavily(query);
  return tavilyResults.length > 0 ? tavilyResults : searchExaInstant(query);
}

/** Best-effort public-source pack for idea-led Xiaohongshu creation. */
export async function buildXiaohongshuIdeaResearchContext(values: Record<string, CreationFieldValue>) {
  if (stringifyCreationFieldValue(values.creation_mode) !== "idea") return "";
  return buildLinkRemixResearchContext({ ...values, source_topic: stringifyCreationFieldValue(values.topic) });
}

function buildResearchQuery(values: Record<string, CreationFieldValue>) {
  const title = stringifyCreationFieldValue(values.source_title).replace(/#[^\s#]+/g, " ").trim();
  const topic = stringifyCreationFieldValue(values.source_topic).trim();
  const transcript = stringifyCreationFieldValue(values.source_transcript).trim();
  const seed = topic || title || transcript.slice(0, 80);
  if (!seed) return "";
  return `${seed.slice(0, 100)} 家庭保障 保险规划 权威解读`;
}

async function searchTavily(query: string): Promise<ResearchResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return [];

  try {
    const response = await fetch(tavilyEndpoint(), {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        query,
        search_depth: "basic",
        max_results: 3,
        include_answer: false,
        include_raw_content: false,
      }),
      signal: AbortSignal.timeout(Number(process.env.LINK_REMIX_SEARCH_TIMEOUT_MS ?? 8000)),
    });
    if (!response.ok) return [];
    const payload = await response.json() as { results?: ResearchResult[] };
    return (payload.results ?? []).map((item) => ({ ...item, provider: "tavily" }));
  } catch {
    return [];
  }
}

async function searchExaInstant(query: string): Promise<ResearchResult[]> {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) return [];

  try {
    const response = await fetch(exaEndpoint(), {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({
        query,
        type: "instant",
        numResults: 3,
        contents: { text: { maxCharacters: 900 } },
      }),
      signal: AbortSignal.timeout(Number(process.env.LINK_REMIX_SEARCH_TIMEOUT_MS ?? 8000)),
    });
    if (!response.ok) return [];
    const payload = await response.json() as { results?: ResearchResult[] };
    return (payload.results ?? []).map((item) => ({ ...item, provider: "exa" }));
  } catch {
    return [];
  }
}

function normalizeSnippet(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 360);
}
