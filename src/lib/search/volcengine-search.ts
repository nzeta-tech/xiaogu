export type VolcengineSearchResult = {
  title: string;
  url: string;
  content: string;
  publishedDate?: string;
  score?: number;
  provider: "volcengine";
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
    return normalizeVolcenginePayload(await response.json());
  } catch {
    return [];
  }
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
