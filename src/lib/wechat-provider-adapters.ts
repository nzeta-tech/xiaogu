import type { ViralCreatorCandidate } from "./viral-examples";

type UnknownRecord = Record<string, unknown>;

export type WechatProviderArticle = {
  provider: "werss" | "wechatsogou";
  sourceUrl: string;
  title: string;
  authorName?: string;
  authorKey?: string;
  authorProfileUrl?: string;
  excerpt?: string;
  thumbnailUrl?: string;
  publishedAt?: string;
  articleBody?: string;
  discoveryQuery?: string;
};

export type WechatProviderResult<T> = {
  items: T[];
  attempts: number;
  errors: number;
};

const defaultTimeoutMs = 12_000;

export async function discoverWechatProviderCreators(queries: string[], target: number): Promise<WechatProviderResult<ViralCreatorCandidate>> {
  const providers = await Promise.all([
    discoverWechatSogouCreators(queries, target),
    discoverWeRssCreators(queries, target),
  ]);
  return {
    items: deduplicateCreators(providers.flatMap((provider) => provider.items)).slice(0, target),
    attempts: providers.reduce((sum, provider) => sum + provider.attempts, 0),
    errors: providers.reduce((sum, provider) => sum + provider.errors, 0),
  };
}

export async function discoverWechatProviderArticles(queries: string[], limit = 30): Promise<WechatProviderResult<WechatProviderArticle>> {
  const providers = await Promise.all([
    discoverWechatSogouArticles(queries, limit),
    discoverWeRssArticles(limit),
  ]);
  return {
    items: deduplicateArticles(providers.flatMap((provider) => provider.items)).slice(0, limit),
    attempts: providers.reduce((sum, provider) => sum + provider.attempts, 0),
    errors: providers.reduce((sum, provider) => sum + provider.errors, 0),
  };
}

async function discoverWechatSogouCreators(queries: string[], target: number): Promise<WechatProviderResult<ViralCreatorCandidate>> {
  const base = configuredBase("VIRAL_WECHATSOGOU_API_BASE");
  if (!base || process.env.VIRAL_WECHATSOGOU_ENABLED === "0") return emptyResult();
  const items: ViralCreatorCandidate[] = [];
  let attempts = 0;
  let errors = 0;
  const pages = boundedInteger(process.env.VIRAL_WECHATSOGOU_MAX_PAGES, 2, 1, 5);
  for (const query of queries) {
    if (deduplicateCreators(items).length >= target) break;
    for (let page = 1; page <= pages; page += 1) {
      attempts += 1;
      const payload = await providerJson(base, "/v1/accounts/search", { q: query, page: String(page) });
      if (!payload) { errors += 1; break; }
      const parsed = normalizeWechatSogouCreators(payload, query);
      items.push(...parsed);
      if (parsed.length === 0) break;
    }
  }
  return { items: deduplicateCreators(items).slice(0, target), attempts, errors };
}

async function discoverWeRssCreators(queries: string[], target: number): Promise<WechatProviderResult<ViralCreatorCandidate>> {
  const base = configuredBase("VIRAL_WERSS_API_BASE");
  if (!base || process.env.VIRAL_WERSS_ENABLED === "0") return emptyResult();
  const items: ViralCreatorCandidate[] = [];
  let attempts = 0;
  let errors = 0;

  attempts += 1;
  const subscribed = await providerJson(base, "/api/v1/wx/mps", { limit: "100", offset: "0" }, weRssHeaders());
  if (subscribed) items.push(...normalizeWeRssCreators(subscribed, "WeRSS已订阅")); else errors += 1;

  for (const query of queries) {
    if (deduplicateCreators(items).length >= target) break;
    attempts += 1;
    const payload = await providerJson(base, `/api/v1/wx/mps/search/${encodeURIComponent(query)}`, { limit: "20", offset: "0" }, weRssHeaders());
    if (!payload) { errors += 1; break; }
    items.push(...normalizeWeRssCreators(payload, query));
  }
  return { items: deduplicateCreators(items).slice(0, target), attempts, errors };
}

async function discoverWechatSogouArticles(queries: string[], limit: number): Promise<WechatProviderResult<WechatProviderArticle>> {
  const base = configuredBase("VIRAL_WECHATSOGOU_API_BASE");
  if (!base || process.env.VIRAL_WECHATSOGOU_ENABLED === "0") return emptyResult();
  const items: WechatProviderArticle[] = [];
  let attempts = 0;
  let errors = 0;
  for (const query of queries) {
    if (items.length >= limit) break;
    attempts += 1;
    const payload = await providerJson(base, "/v1/articles/search", { q: query, page: "1" });
    if (!payload) { errors += 1; break; }
    items.push(...normalizeWechatSogouArticles(payload, query));
  }
  return { items: deduplicateArticles(items).slice(0, limit), attempts, errors };
}

async function discoverWeRssArticles(limit: number): Promise<WechatProviderResult<WechatProviderArticle>> {
  const base = configuredBase("VIRAL_WERSS_API_BASE");
  if (!base || process.env.VIRAL_WERSS_ENABLED === "0") return emptyResult();
  const payload = await providerJson(base, "/api/v1/wx/articles", { limit: String(Math.min(limit, 100)), offset: "0", has_content: "true" }, weRssHeaders());
  return payload
    ? { items: normalizeWeRssArticles(payload).slice(0, limit), attempts: 1, errors: 0 }
    : { items: [], attempts: 1, errors: 1 };
}

export function normalizeWechatSogouCreators(payload: unknown, query: string): ViralCreatorCandidate[] {
  return payloadList(payload).map((entry): ViralCreatorCandidate | null => {
    const item = recordValue(entry);
    const displayName = firstString(item.wechat_name, item.name, item.nickname);
    const creatorKey = firstString(item.wechat_id, item.open_id, item.fakeid) || normalizeKey(displayName);
    if (!displayName || !creatorKey) return null;
    return {
      platform: "公众号" as const,
      creatorKey,
      displayName,
      profileUrl: firstString(item.profile_url) || undefined,
      discoveryQuery: query,
      sourceKind: "account_search" as const,
      evidenceTitle: firstString(item.authentication, item.introduction) || "WechatSogou公众号搜索",
      evidenceUrl: firstString(item.profile_url) || undefined,
      platformWorkCount: positiveInteger(item.post_perm),
      isVerified: Boolean(firstString(item.authentication)),
      bio: [firstString(item.introduction), firstString(item.authentication)].filter(Boolean).join("；") || undefined,
    };
  }).filter((item): item is ViralCreatorCandidate => Boolean(item));
}

export function normalizeWeRssCreators(payload: unknown, query: string): ViralCreatorCandidate[] {
  return payloadList(payload).map((entry): ViralCreatorCandidate | null => {
    const item = recordValue(entry);
    const displayName = firstString(item.mp_name, item.nickname, item.nick_name);
    const creatorKey = firstString(item.fakeid, item.faker_id, item.id) || normalizeKey(displayName);
    if (!displayName || !creatorKey) return null;
    return {
      platform: "公众号" as const,
      creatorKey,
      displayName,
      profileUrl: firstString(item.profile_url) || undefined,
      discoveryQuery: query,
      sourceKind: "authorized_link" as const,
      evidenceTitle: firstString(item.mp_intro, item.signature, item.alias) || "WeRSS授权公众号",
      evidenceUrl: firstString(item.profile_url) || undefined,
      isVerified: Boolean(item.verify_status ?? item.verifyStatus),
      bio: firstString(item.mp_intro, item.signature) || undefined,
    };
  }).filter((item): item is ViralCreatorCandidate => Boolean(item));
}

export function normalizeWechatSogouArticles(payload: unknown, query: string): WechatProviderArticle[] {
  return payloadList(payload).map((entry) => normalizeArticle(recordValue(entry), "wechatsogou", query)).filter(isArticle);
}

export function normalizeWeRssArticles(payload: unknown): WechatProviderArticle[] {
  return payloadList(payload).map((entry) => normalizeArticle(recordValue(entry), "werss", "WeRSS已订阅")).filter(isArticle);
}

function normalizeArticle(item: UnknownRecord, provider: WechatProviderArticle["provider"], query: string): WechatProviderArticle | null {
  const article = Object.keys(recordValue(item.article)).length > 0 ? recordValue(item.article) : item;
  const account = recordValue(item.gzh);
  const sourceUrl = firstString(article.url, article.link, article.content_url);
  const title = firstString(article.title, article.name);
  if (!sourceUrl || !title || !isWechatArticleUrl(sourceUrl)) return null;
  const timestamp = positiveInteger(article.publish_time, article.datetime, article.timestamp, article.time);
  const images = Array.isArray(article.imgs) ? article.imgs : [];
  return {
    provider,
    sourceUrl,
    title,
    authorName: firstString(item.mp_name, item.account, item.author, item.author_name, account.wechat_name) || undefined,
    authorKey: firstString(item.mp_id, item.wechat_id, item.fakeid, item.biz, account.open_id) || undefined,
    authorProfileUrl: firstString(item.profile_url, account.profile_url) || undefined,
    excerpt: firstString(article.description, article.digest, article.abstract) || undefined,
    thumbnailUrl: firstString(article.pic_url, article.cover, article.img_url, article.main_img, images[0]) || undefined,
    publishedAt: timestamp ? new Date(timestamp * 1000).toISOString() : undefined,
    articleBody: firstString(article.content, article.content_html) || undefined,
    discoveryQuery: query,
  };
}

async function providerJson(base: string, path: string, params: Record<string, string>, headers: HeadersInit = {}) {
  try {
    const url = new URL(path, `${base}/`);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    const response = await fetch(url, { headers: { accept: "application/json", ...headers }, signal: AbortSignal.timeout(providerTimeoutMs()) });
    if (!response.ok) return null;
    return await response.json() as unknown;
  } catch {
    return null;
  }
}

function payloadList(payload: unknown): unknown[] {
  const root = recordValue(payload);
  const data = root.data;
  if (Array.isArray(data)) return data;
  const nested = recordValue(data);
  if (Array.isArray(nested.list)) return nested.list;
  if (Array.isArray(root.list)) return root.list;
  return [];
}

function weRssHeaders(): HeadersInit {
  const authorization = process.env.VIRAL_WERSS_AUTHORIZATION?.trim();
  return authorization ? { authorization } : {};
}

function configuredBase(name: "VIRAL_WECHATSOGOU_API_BASE" | "VIRAL_WERSS_API_BASE") {
  return process.env[name]?.trim().replace(/\/$/, "") || "";
}

function providerTimeoutMs() {
  return boundedInteger(process.env.VIRAL_WECHAT_PROVIDER_TIMEOUT_MS, defaultTimeoutMs, 2_000, 60_000);
}

function deduplicateCreators(items: ViralCreatorCandidate[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.platform}:${item.creatorKey || normalizeKey(item.displayName)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function deduplicateArticles(items: WechatProviderArticle[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.sourceUrl.replace(/#.*$/, "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function emptyResult<T>(): WechatProviderResult<T> {
  return { items: [], attempts: 0, errors: 0 };
}

function recordValue(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
}

function firstString(...values: unknown[]) {
  for (const value of values) if (typeof value === "string" && value.trim()) return value.trim();
  return "";
}

function positiveInteger(...values: unknown[]) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed);
  }
  return undefined;
}

function normalizeKey(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "").slice(0, 200);
}

function boundedInteger(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(Math.max(Math.floor(parsed), min), max) : fallback;
}

function isWechatArticleUrl(value: string) {
  try {
    const url = new URL(value);
    return /(^|\.)mp\.weixin\.qq\.com$/i.test(url.hostname) && /^\/s(?:\/|$)/i.test(url.pathname);
  } catch {
    return false;
  }
}

function isArticle(value: WechatProviderArticle | null): value is WechatProviderArticle {
  return Boolean(value);
}
