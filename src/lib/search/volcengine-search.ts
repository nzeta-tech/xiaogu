export type VolcengineSearchResult = {
  title: string;
  url: string;
  content: string;
  publishedDate?: string;
  score?: number;
  provider: "volcengine" | "tavily";
};

const DEFAULT_ENDPOINT = "https://open.feedcoopapi.com/search_api/web_search";

export async function searchVolcengineWeb(
  query: string,
  options: { count?: number; timeoutMs?: number; requireContent?: boolean } = {},
): Promise<VolcengineSearchResult[]> {
  const apiKey = process.env.VOLCENGINE_SEARCH_API_KEY?.trim();
  if (!apiKey || !query.trim()) return [];
  try {
    const response = await fetch(process.env.VOLCENGINE_SEARCH_API_BASE?.trim() || DEFAULT_ENDPOINT, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        Query: query.trim().slice(0, 100),
        SearchType: "web",
        Count: Math.max(1, Math.min(50, options.count ?? 5)),
        Filter: { NeedContent: options.requireContent ?? true, NeedUrl: true },
      }),
      signal: AbortSignal.timeout(options.timeoutMs ?? 8_000),
    });
    if (!response.ok) return [];
    const payload = await response.json();
    if (extractVolcengineBusinessError(payload)) return [];
    return normalizeVolcenginePayload(payload);
  } catch {
    return [];
  }
}

export class SearchProviderError extends Error {
  readonly failures: Array<{ provider: string; code: string; message: string }>;
  constructor(failures: Array<{ provider: string; code: string; message: string }>) {
    super(`搜索服务不可用：${failures.map(item => `${item.provider} ${item.code}: ${item.message}`).join("；")}`);
    this.name = "SearchProviderError";
    this.failures = failures;
  }
}

/** WorkBuddy search gateway: Volcengine first, Tavily on failure or zero results. */
export async function searchWeb(query: string, options: { count?: number; timeoutMs?: number; requireContent?: boolean } = {}) {
  if (!query.trim()) return [];
  const failures: Array<{ provider: string; code: string; message: string }> = [];
  const volcanic = await requestVolcengine(query, options).catch((error: unknown) => { failures.push(providerFailure("volcengine", error)); return []; });
  if (volcanic.length) return volcanic;
  const tavily = await requestTavily(query, options).catch((error: unknown) => { failures.push(providerFailure("tavily", error)); return []; });
  if (tavily.length) return tavily;
  if (failures.length >= 2 || (failures.length && !hasConfiguredProviderBesides(failures[0].provider))) throw new SearchProviderError(failures);
  return [];
}

async function requestVolcengine(query: string, options: { count?: number; timeoutMs?: number; requireContent?: boolean }) {
  const apiKey = process.env.VOLCENGINE_SEARCH_API_KEY?.trim();
  if (!apiKey) throw new Error("NOT_CONFIGURED: VOLCENGINE_SEARCH_API_KEY 未配置");
  const response = await fetch(process.env.VOLCENGINE_SEARCH_API_BASE?.trim() || DEFAULT_ENDPOINT, {
    method: "POST", headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ Query: query.trim().slice(0, 100), SearchType: "web", Count: Math.max(1, Math.min(50, options.count ?? 5)), Filter: { NeedContent: options.requireContent ?? true, NeedUrl: true } }),
    signal: AbortSignal.timeout(options.timeoutMs ?? 8_000),
  });
  if (!response.ok) throw new Error(`HTTP_${response.status}: ${response.statusText}`);
  const payload = await response.json();
  const businessError = extractVolcengineBusinessError(payload);
  if (businessError) throw new Error(`${businessError.code}: ${businessError.message}`);
  return normalizeVolcenginePayload(payload);
}

async function requestTavily(query: string, options: { count?: number; timeoutMs?: number }) {
  const apiKey = (process.env.TAVILY_API_KEY ?? process.env.SEARCH_API_KEY)?.trim();
  if (!apiKey) throw new Error("NOT_CONFIGURED: TAVILY_API_KEY 未配置");
  const endpoint = process.env.TAVILY_API_BASE ?? process.env.SEARCH_API_BASE ?? "https://api.tavily.com/search";
  const response = await fetch(endpoint, {
    method: "POST", headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ query: query.trim().slice(0, 300), search_depth: "basic", max_results: Math.max(1, Math.min(20, options.count ?? 5)), include_answer: false, include_raw_content: false, days: 30 }),
    signal: AbortSignal.timeout(options.timeoutMs ?? 8_000),
  });
  if (!response.ok) throw new Error(`HTTP_${response.status}: ${response.statusText}`);
  const payload = await response.json() as { results?: Array<{ title?: string; url?: string; content?: string; published_date?: string; score?: number }> };
  return (payload.results ?? []).flatMap(item => item.title?.trim() && item.url?.trim() ? [{ title: item.title.trim(), url: item.url.trim(), content: item.content?.trim() ?? "", publishedDate: item.published_date?.trim() || undefined, score: Number.isFinite(item.score) ? item.score : undefined, provider: "tavily" as const }] : []);
}

export function extractVolcengineBusinessError(payload: unknown) {
  const root = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const metadata = root.ResponseMetadata && typeof root.ResponseMetadata === "object" ? root.ResponseMetadata as Record<string, unknown> : {};
  const error = metadata.Error && typeof metadata.Error === "object" ? metadata.Error as Record<string, unknown> : null;
  return error ? { code: String(error.Code ?? error.CodeN ?? "UNKNOWN"), message: String(error.Message ?? "未知业务错误") } : null;
}

function providerFailure(provider: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/^([^:]+):\s*(.*)$/);
  return { provider, code: match?.[1] || "REQUEST_FAILED", message: match?.[2] || message };
}

function hasConfiguredProviderBesides(provider: string) {
  return provider === "volcengine" ? Boolean((process.env.TAVILY_API_KEY ?? process.env.SEARCH_API_KEY)?.trim()) : Boolean(process.env.VOLCENGINE_SEARCH_API_KEY?.trim());
}

export function normalizeVolcenginePayload(payload: unknown): VolcengineSearchResult[] {
  const root = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const result = root.Result && typeof root.Result === "object" ? root.Result as Record<string, unknown> : root;
  const items = Array.isArray(result.WebResults) ? result.WebResults : [];
  return items.flatMap((raw) => {
    const item = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    const title = stringValue(item.Title);
    const url = stringValue(item.Url);
    if (!title || !url) return [];
    return [{
      title, url,
      content: stringValue(item.Content) || stringValue(item.Snippet),
      publishedDate: stringValue(item.PublishTime) || undefined,
      score: finiteNumber(item.RankScore),
      provider: "volcengine" as const,
    }];
  });
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function finiteNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
