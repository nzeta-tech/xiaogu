import { stringifyCreationFieldValue, type CreationFieldValue } from "@/lib/creation/output";

type ResearchResult = {
  title?: string;
  url?: string;
  content?: string;
  score?: number;
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

  const tavilyResults = await searchTavily(query);
  const results = tavilyResults.length > 0 ? tavilyResults : await searchExaInstant(query);
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
    return payload.results ?? [];
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
    return payload.results ?? [];
  } catch {
    return [];
  }
}

function normalizeSnippet(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 360);
}
