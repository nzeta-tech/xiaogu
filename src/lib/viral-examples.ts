import { inferHotTopicCategory } from "./topics/rules";
import { tryListPublishedViralContents } from "./db/repositories";
import { getLatestViralDataRun } from "./viral-data-repository";
import { inspectDouyinPublicMetadata } from "./creation/douyin-download";
import { inspectWechatChannelsWithContainerBrowser } from "./creation/wechat-channels-container";
import { parseSogouAccountResults } from "./viral-creator-sources";
import { discoverWechatProviderArticles, discoverWechatProviderCreators, type WechatProviderArticle } from "./wechat-provider-adapters";

export type ViralExampleType = "短视频" | "爆文";
export type ViralExample = {
  id: string;
  title: string;
  platform: "抖音" | "视频号" | "公众号" | "小红书";
  type: ViralExampleType;
  sourceUrl: string;
  sourceTitle?: string;
  authorName?: string;
  authorKey?: string;
  authorProfileUrl?: string;
  discoveryQuery?: string;
  excerpt?: string;
  thumbnailUrl?: string;
  mediaUrl?: string;
  embedUrl?: string;
  articleBody?: string;
  publishedAt?: string;
  fetchedAt: string;
  metricLabel: string;
  metricValue?: number;
  metricUnit?: string;
  category: string;
  contentType: string;
  tags: string[];
  insight: string;
  status: "ready" | "needs-review";
  statusNote: string;
  viralScore?: number;
  isFallback?: boolean;
  isManual?: boolean;
};

export type ViralCreatorCandidate = {
  platform: ViralExample["platform"];
  creatorKey: string;
  displayName: string;
  profileUrl?: string;
  discoveryQuery?: string;
  sourceKind: "platform_search" | "hot_list" | "account_search" | "authorized_link" | "qingshan_popular" | "public_ranking";
  evidenceTitle?: string;
  evidenceUrl?: string;
  evidenceCount?: number;
  evidence?: Array<{ query: string; title?: string; url?: string }>;
  followerCount?: number;
  platformWorkCount?: number;
  isVerified?: boolean;
  bio?: string;
  // Platform-level creator stats are only trusted after reading the profile page.
  profileStatsSource?: "profile_page";
};

export type ViralCreatorDiscoveryDiagnostics = {
  platform: ViralExample["platform"];
  queryCount: number;
  rawResultCount: number;
  creatorCount: number;
  profileCount: number;
  errors: number;
};

export type ViralWorkCandidate = {
  platform: ViralExample["platform"];
  sourceUrl: string;
  title: string;
  authorName?: string;
  authorKey?: string;
  authorProfileUrl?: string;
  discoveryQuery?: string;
  rawData?: Record<string, unknown>;
};

export type ViralPlatformDiscovery = {
  items: ViralExample[];
  creators: ViralCreatorCandidate[];
  candidates: ViralWorkCandidate[];
};

export type ViralSourceCoverage = {
  platform: ViralExample["platform"];
  count: number;
  latestFetchedAt: string | null;
  fresh: boolean;
};

export type ViralSourceHealth = {
  platform: ViralExample["platform"];
  status: "ready" | "needs_authorized_source" | "unavailable";
  detail: string;
};

const automaticCacheMaxAgeMs = 30 * 60 * 60 * 1000;
const defaultContentMaxAgeDays = 30;
const defaultWechatChannelDiscoveryQueries = ["保险", "保险理赔", "健康告知", "养老规划"];
const douyinHotSearchApiBase = "https://aweme.snssdk.com/aweme/v1/hot/search";
const douyinHotTopicPattern = /保险|医保|医疗|养老|退休|健康|疾病|医院|社保|家庭|收入|裁员|台风|暴雨|事故|车祸|理赔|灾害/;
const scaledCreatorDiscoveryQueries = [
  "保险", "保险理赔", "健康告知", "医疗险", "重疾险", "寿险", "养老规划", "年金险",
  "家庭保障", "保险经纪人", "资产配置", "家庭理财", "基金投资", "个人理财", "退休规划", "财务规划",
  "商业保险", "保险科普", "保单规划", "家庭财务", "财富管理", "指数基金", "储蓄规划", "养老金",
];

type NativeSearchConfig = {
  platform: ViralExample["platform"];
  type: ViralExampleType;
  queries: string[];
  searchUrl: (query: string) => string;
  hosts: RegExp;
  detailPath: RegExp;
};

const viralPlatformSearches: NativeSearchConfig[] = [
  {
    platform: "抖音", type: "短视频",
    queries: ["保险 健康告知", "保险 理赔", "保险 养老规划"],
    searchUrl: (query) => `https://www.douyin.com/search/${encodeURIComponent(query)}?aid=21ae4f84-44c0-43f2-a157-8f7012e0192e&type=general`,
    hosts: /(^|\.)douyin\.com$/i, detailPath: /\/(?:video|shipin)\/\d+/i,
  },
  {
    platform: "公众号", type: "爆文",
    queries: ["保险 健康告知", "保险 理赔", "保险 养老规划"],
    searchUrl: (query) => `https://weixin.sogou.com/weixin?type=2&page=1&ie=utf8&query=${encodeURIComponent(query)}&s_from=input`,
    hosts: /(^|\.)mp\.weixin\.qq\.com$|(^|\.)weixin\.sogou\.com$/i,
    detailPath: /\/s\//i,
  },
  {
    platform: "小红书", type: "短视频",
    queries: ["保险 健康告知", "保险 家庭保障", "保险 理赔"],
    searchUrl: (query) => `https://www.xiaohongshu.com/search_result/?keyword=${encodeURIComponent(query)}`,
    hosts: /(^|\.)xiaohongshu\.com$|(^|\.)xhslink\.com$/i,
    detailPath: /\/(?:explore|discovery\/item)\//i,
  },
];

export async function getViralExamples(options: { refresh?: boolean } = {}) {
  void options;
  const items = (await tryListPublishedViralContents(24)).map((item) => databaseRowToExample(item));
  const latestSuccessfulRun = await getLatestViralDataRun("succeeded").catch(() => null);
  const fetchedAt = latestSuccessfulRun?.completed_at ?? null;
  const maxAgeMs = preparedDataMaxAgeMs();
  const stale = items.some((item) => !item.isManual) && (!fetchedAt || Date.parse(fetchedAt) <= Date.now() - maxAgeMs);
  return buildViralResult(items, {
    degraded: items.length === 0 || stale,
    stale,
    source: "database" as const,
    fetchedAt,
  });
}

function databaseRowToExample(row: Awaited<ReturnType<typeof tryListPublishedViralContents>>[number]): ViralExample {
  return {
    id: row.id, title: row.title, platform: row.platform as ViralExample["platform"],
    type: row.example_type === "爆文" || row.content_type === "爆文" ? "爆文" : "短视频", sourceUrl: row.source_url,
    sourceTitle: row.source_title, authorName: row.source_author || undefined,
    excerpt: row.summary || undefined, thumbnailUrl: row.thumbnail_url ?? undefined, mediaUrl: row.media_url ?? undefined,
    embedUrl: row.embed_url ?? undefined, articleBody: row.article_body || undefined,
    fetchedAt: row.fetched_at ?? row.updated_at, publishedAt: row.publish_at ?? undefined, metricLabel: row.metric_label,
    metricValue: row.metric_value ?? undefined, metricUnit: row.metric_unit || undefined, category: row.category,
    contentType: row.content_type, tags: Array.isArray(row.tags) ? row.tags as string[] : [], insight: row.insight,
    status: "ready", statusNote: row.risk_note || "来源作品已入库，发布前请结合实际情况核验",
    viralScore: row.viral_score,
    isManual: row.source_type === "manual",
  };
}

function preparedDataMaxAgeMs() {
  const configured = Number(process.env.VIRAL_PREPARED_DATA_MAX_AGE_MS ?? 30 * 60 * 60 * 1000);
  return Number.isFinite(configured) ? Math.max(configured, 60 * 60 * 1000) : 30 * 60 * 60 * 1000;
}

function buildViralResult<TSource extends string>(items: ViralExample[], meta: { degraded: boolean; stale: boolean; source: TSource; fetchedAt: string | null }) {
  return { ...meta, items, sourceCoverage: getViralSourceCoverage(items), sourceHealth: getViralSourceHealth(items) };
}

function getViralSourceCoverage(items: ViralExample[]): ViralSourceCoverage[] {
  const platforms: ViralExample["platform"][] = ["抖音", "视频号", "公众号", "小红书"];
  return platforms.map((platform) => {
    const automaticItems = items.filter((item) => item.platform === platform && !item.isManual);
    const latestFetchedAt = automaticItems.reduce<string | null>((latest, item) => !latest || new Date(item.fetchedAt).getTime() > new Date(latest).getTime() ? item.fetchedAt : latest, null);
    return { platform, count: automaticItems.length, latestFetchedAt, fresh: automaticItems.some((item) => !isAutomaticCacheStale(item.fetchedAt)) };
  });
}

function getViralSourceHealth(items: ViralExample[]): ViralSourceHealth[] {
  const platforms: ViralExample["platform"][] = ["抖音", "视频号", "公众号", "小红书"];
  return platforms.map((platform) => {
    const count = items.filter((item) => item.platform === platform).length;
    if (platform === "视频号" && count === 0) {
      const discoveryEnabled = process.env.VIRAL_WECHAT_DISCOVERY_ENABLED === "1";
      return {
        platform,
        status: "needs_authorized_source" as const,
        detail: discoveryEnabled
          ? "Linux 视频号采集器尚未返回可核验作品。请在容器浏览器保持视频号助手登录，并确认自托管采集器已连接页面。"
          : "视频号助手不提供公开作品搜索结果。请启用自托管 Linux 采集器，或配置已授权的公开视频分享链接。",
      };
    }
    if (platform === "小红书" && count === 0) {
      const browserEnabled = process.env.VIRAL_XHS_BROWSER_ENABLED !== "0";
      const apiConfigured = Boolean(process.env.VIRAL_XHS_INSPECT_API_BASE?.trim());
      return {
        platform,
        status: "needs_authorized_source" as const,
        detail: browserEnabled || apiConfigured
          ? "小红书当前未返回可核验作品。请确认独立采集浏览器已登录且未触发访问验证。"
          : "小红书搜索需要独立登录态或自托管解析服务，请启用持久采集浏览器或配置小红书 API。",
      };
    }
    return count > 0
      ? { platform, status: "ready" as const, detail: "已收录可打开的作品详情链接。" }
      : { platform, status: "unavailable" as const, detail: "本轮平台搜索未返回可核验的作品详情链接。" };
  });
}

function isAutomaticCacheStale(fetchedAt?: string | null) {
  const timestamp = fetchedAt ? new Date(fetchedAt).getTime() : Number.NaN;
  return !Number.isFinite(timestamp) || timestamp < Date.now() - automaticCacheMaxAgeMs;
}

export function canonicalizeViralSourceUrl(input: string) {
  try {
    const url = new URL(input);
    url.hash = "";
    ["_from", "from", "share_source", "share_token", "timestamp", "sec_uid", "mid", "source"].forEach((key) => url.searchParams.delete(key));
    return url.toString();
  } catch {
    return input.trim();
  }
}

export async function discoverPlatformViralExamples(options: { refresh?: boolean } = {}) {
  return (await discoverPlatformViralData(options)).items;
}

export async function discoverViralCreatorsAtScale(options: { refresh?: boolean; targetPerPlatform?: number } = {}) {
  const targetPerPlatform = Math.min(Math.max(options.targetPerPlatform ?? Number(process.env.VIRAL_CREATOR_TARGET_PER_PLATFORM ?? 100), 10), 500);
  const configuredQueries = (process.env.VIRAL_CREATOR_DISCOVERY_QUERIES ?? "")
    .split(/[\n,;]+/).map((value) => value.trim()).filter(Boolean);
  const queries = [...new Set(configuredQueries.length > 0 ? configuredQueries : scaledCreatorDiscoveryQueries)].slice(0, 40);
  const searchable = viralPlatformSearches
    .filter((config) => config.platform !== "公众号")
    .map((config) => collectSearchCreatorCandidates(config, queries, targetPerPlatform, Boolean(options.refresh)));
  const results = await Promise.all([
    ...searchable,
    collectWechatOfficialAccountCreatorCandidates(queries, targetPerPlatform, Boolean(options.refresh)),
    collectWechatChannelCreatorCandidates(queries, targetPerPlatform),
  ]);
  const creators = deduplicateCreatorCandidates(results.flatMap((result) => result.creators));
  await enrichCreatorProfiles(creators);
  return {
    creators,
    diagnostics: results.map((result) => result.diagnostics),
    targetPerPlatform,
  };
}

async function collectWechatOfficialAccountCreatorCandidates(queries: string[], target: number, refresh: boolean) {
  const [providers, sogou, official] = await Promise.all([
    discoverWechatProviderCreators(queries, target),
    collectSogouAccountCreatorCandidates(queries, target, refresh),
    collectWechatMpCreatorCandidates(queries, target),
  ]);
  const creators = aggregateCreatorEvidence([...providers.items, ...sogou.creators, ...official.creators]).slice(0, target);
  return {
    creators,
    diagnostics: {
      platform: "公众号" as const,
      queryCount: providers.attempts + sogou.diagnostics.queryCount + official.diagnostics.queryCount,
      rawResultCount: providers.items.length + sogou.diagnostics.rawResultCount + official.diagnostics.rawResultCount,
      creatorCount: creators.length,
      profileCount: creators.filter((creator) => creator.profileUrl).length,
      errors: providers.errors + sogou.diagnostics.errors + official.diagnostics.errors,
    } satisfies ViralCreatorDiscoveryDiagnostics,
  };
}

async function collectSogouAccountCreatorCandidates(queries: string[], target: number, refresh: boolean) {
  const collected: ViralCreatorCandidate[] = [];
  let rawResultCount = 0;
  let errors = 0;
  let attemptedQueries = 0;
  const maxPages = boundedInteger(process.env.VIRAL_SOGOU_ACCOUNT_SEARCH_MAX_PAGES, 2, 1, 5);
  let blocked = false;
  for (const query of queries) {
    if (blocked || deduplicateCreatorCandidates(collected).length >= target) break;
    attemptedQueries += 1;
    for (let page = 1; page <= maxPages && deduplicateCreatorCandidates(collected).length < target; page += 1) {
      const searchUrl = `https://weixin.sogou.com/weixin?type=1&page=${page}&ie=utf8&query=${encodeURIComponent(query)}&s_from=input`;
      try {
        const source = await fetchSogouArticleSearchPage(searchUrl, refresh);
        let html = source.html;
        let parsed = parseSogouAccountResults(html, query);
        if (parsed.length === 0 && process.env.VIRAL_SOGOU_BROWSER_ENABLED !== "0") {
          html = await fetchSearchPageWithCdp(searchUrl) ?? html;
          if (/\/antispider\/|请依次点击|协助验证/.test(html)) {
            errors += 1;
            blocked = true;
            break;
          }
          parsed = parseSogouAccountResults(html, query);
        }
        rawResultCount += parsed.length;
        collected.push(...parsed);
        if (parsed.length === 0) break;
      } catch {
        errors += 1;
        break;
      }
    }
  }
  const creators = aggregateCreatorEvidence(collected).slice(0, target);
  return {
    creators,
    diagnostics: {
      platform: "公众号" as const,
      queryCount: attemptedQueries,
      rawResultCount,
      creatorCount: creators.length,
      profileCount: creators.filter((creator) => creator.profileUrl).length,
      errors,
    } satisfies ViralCreatorDiscoveryDiagnostics,
  };
}

async function collectWechatMpCreatorCandidates(queries: string[], target: number) {
  const collected: ViralCreatorCandidate[] = [];
  let rawResultCount = 0;
  let errors = 0;
  let attemptedQueries = 0;
  if (process.env.VIRAL_WECHAT_MP_DISCOVERY_ENABLED !== "1") {
    return { creators: collected, diagnostics: { platform: "公众号" as const, queryCount: 0, rawResultCount: 0, creatorCount: 0, profileCount: 0, errors: 0 } };
  }
  for (const query of queries) {
    if (deduplicateCreatorCandidates(collected).length >= target) break;
    attemptedQueries += 1;
    const payload = await fetchWechatMpCreatorSearch(query);
    if (!payload) { errors += 1; break; }
    const root = asRecord(payload);
    const list = Array.isArray(root.list) ? root.list : Array.isArray(asRecord(root.data).list) ? asRecord(root.data).list as unknown[] : [];
    rawResultCount += list.length;
    for (const item of list) {
      const account = asRecord(item);
      const creatorKey = stringValue(account.fakeid ?? account.fake_id);
      const displayName = stringValue(account.nickname ?? account.nick_name);
      if (!creatorKey || !displayName) continue;
      collected.push({
        platform: "公众号",
        creatorKey,
        displayName,
        discoveryQuery: query,
        sourceKind: "account_search",
        evidenceTitle: stringValue(account.signature ?? account.alias) || "微信公众号后台账号搜索",
        bio: stringValue(account.signature) || undefined,
        isVerified: Boolean(account.verify_status ?? account.verifyStatus),
      });
    }
  }
  const creators = aggregateCreatorEvidence(collected).slice(0, target);
  return {
    creators,
    diagnostics: {
      platform: "公众号" as const,
      queryCount: attemptedQueries,
      rawResultCount,
      creatorCount: creators.length,
      profileCount: 0,
      errors,
    },
  };
}

async function fetchWechatMpCreatorSearch(query: string) {
  const base = (process.env.VIRAL_WECHAT_MP_CDP_URL ?? "http://127.0.0.1:9226").replace(/\/$/, "");
  try {
    const targets = await fetch(`${base}/json/list`, { signal: AbortSignal.timeout(2_000) })
      .then((response) => response.ok ? response.json() : []) as CdpTarget[];
    const target = targets.find((item) => item.webSocketDebuggerUrl && /\/\/mp\.weixin\.qq\.com(?:\/|$)/i.test(item.url ?? ""));
    if (!target?.webSocketDebuggerUrl) return null;
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    return await new Promise<unknown>((resolve) => {
      let settled = false;
      const finish = (value: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.close();
        resolve(value);
      };
      const timer = setTimeout(() => finish(null), Number(process.env.VIRAL_WECHAT_MP_SEARCH_TIMEOUT_MS ?? 12000));
      socket.addEventListener("open", () => socket.send(JSON.stringify({
        id: 1,
        method: "Runtime.evaluate",
        params: {
          awaitPromise: true,
          returnByValue: true,
          expression: `(() => {
            const token = new URL(location.href).searchParams.get("token");
            if (!token) return JSON.stringify({ error: "needs_login" });
            const url = new URL("/cgi-bin/searchbiz", location.origin);
            Object.entries({ action: "search_biz", token, lang: "zh_CN", f: "json", ajax: "1", query: ${JSON.stringify(query)}, begin: "0", count: "20" }).forEach(([key, value]) => url.searchParams.set(key, value));
            return fetch(url, { credentials: "include" }).then((response) => response.text());
          })()`,
        },
      })));
      socket.addEventListener("message", (event) => {
        const message = JSON.parse(String(event.data)) as { id?: number; result?: { result?: { value?: string } } };
        if (message.id !== 1) return;
        const value = message.result?.result?.value;
        if (!value) { finish(null); return; }
        try {
          const parsed = JSON.parse(value);
          finish(asRecord(parsed).error ? null : parsed);
        } catch { finish(null); }
      });
      socket.addEventListener("error", () => finish(null));
    });
  } catch {
    return null;
  }
}

async function collectSearchCreatorCandidates(config: NativeSearchConfig, queries: string[], target: number, refresh: boolean) {
  const collected: ViralCreatorCandidate[] = [];
  let rawResultCount = 0;
  let errors = 0;
  let attemptedQueries = 0;
  for (const query of queries) {
    if (deduplicateCreatorCandidates(collected).length >= target) break;
    attemptedQueries += 1;
    try {
      const searchUrl = config.platform === "公众号"
        ? `https://weixin.sogou.com/weixin?type=2&page=1&ie=utf8&query=${encodeURIComponent(query)}&s_from=input`
        : config.searchUrl(query);
      if (config.platform === "抖音") {
        const html = await fetchDouyinCreatorSearchPage(searchUrl);
        const discovered = parseDouyinRenderedCreators(html ?? "", query);
        rawResultCount += discovered.length;
        collected.push(...discovered);
        continue;
      }
      const source = config.platform === "公众号"
        ? await fetchSogouArticleSearchPage(searchUrl, refresh)
        : { html: await fetchNativeSearchPage(searchUrl, refresh, true) };
      let parsed = parseNativeSearchResults(source.html, config, query, source.cookie);
      if (config.platform === "公众号" && parsed.length === 0 && process.env.VIRAL_SOGOU_BROWSER_ENABLED !== "0") {
        const browserHtml = await fetchSearchPageWithCdp(searchUrl);
        if (/\/antispider\/|请依次点击|协助验证/.test(browserHtml ?? "")) {
          errors += 1;
          break;
        }
        parsed = parseNativeSearchResults(browserHtml ?? "", config, query);
      }
      rawResultCount += parsed.length;
      for (const candidate of parsed) {
        const displayName = candidate.result.authorName?.trim();
        if (!displayName) continue;
        collected.push({
          platform: config.platform,
          creatorKey: candidate.result.authorKey?.trim() || normalizeDiscoveredCreatorKey(displayName),
          displayName,
          profileUrl: candidate.result.authorProfileUrl,
          discoveryQuery: query,
          sourceKind: "platform_search",
          evidenceTitle: candidate.result.title,
          evidenceUrl: candidate.result.url,
          followerCount: candidate.result.followerCount,
          isVerified: candidate.result.isVerified,
        });
      }
    } catch {
      errors += 1;
    }
  }
  const creators = aggregateCreatorEvidence(collected).slice(0, target);
  return {
    creators,
    diagnostics: {
      platform: config.platform,
      queryCount: attemptedQueries,
      rawResultCount,
      creatorCount: creators.length,
      profileCount: creators.filter((creator) => creator.profileUrl).length,
      errors,
    } satisfies ViralCreatorDiscoveryDiagnostics,
  };
}

function parseDouyinRenderedCreators(html: string, query: string): ViralCreatorCandidate[] {
  const results: ViralCreatorCandidate[] = [];
  const seen = new Set<string>();
  const pattern = /<a\b[^>]*href=["']([^"']*\/user\/(MS4[^?"'&]+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(pattern)) {
    const creatorKey = decodeHtml(match[2]);
    if (seen.has(creatorKey)) continue;
    const card = match[3];
    const displayMarkup = card.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1];
    const displayName = cleanText(stripMarkup(decodeHtml(displayMarkup ?? "")));
    if (!displayName) continue;
    let profileUrl: string | undefined;
    try { profileUrl = new URL(decodeHtml(match[1]), "https://www.douyin.com").toString().split("?")[0]; } catch { profileUrl = undefined; }
    const text = cleanText(stripMarkup(decodeHtml(card)));
    const followerText = text.match(/([\d.]+)\s*万?粉丝/)?.[0] ?? "";
    const followerCount = parseChineseMetric(followerText);
    results.push({
      platform: "抖音",
      creatorKey,
      displayName,
      profileUrl,
      discoveryQuery: query,
      sourceKind: "platform_search",
      evidenceTitle: text.slice(0, 300),
      evidenceUrl: profileUrl,
      followerCount: followerCount || undefined,
      isVerified: /认证徽章|认证/.test(text),
    });
    seen.add(creatorKey);
  }
  return results;
}

function parseChineseMetric(value: string) {
  const match = value.match(/([\d.]+)\s*(万)?/);
  if (!match) return 0;
  return Math.round(Number(match[1]) * (match[2] ? 10_000 : 1));
}

function boundedInteger(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(Math.max(Math.floor(parsed), min), max) : fallback;
}

async function collectWechatChannelCreatorCandidates(queries: string[], target: number) {
  const creators: ViralCreatorCandidate[] = [];
  let rawResultCount = 0;
  let errors = 0;
  let attemptedQueries = 0;
  const baseUrl = process.env.VIRAL_WECHAT_DISCOVERY_API_BASE?.trim();
  if (process.env.VIRAL_WECHAT_DISCOVERY_ENABLED === "1" && baseUrl) {
    for (const query of queries) {
      if (deduplicateCreatorCandidates(creators).length >= target) break;
      attemptedQueries += 1;
      const payload = await fetchWechatChannelDiscoveryApi(baseUrl, "/api/channels/contact/search", { keyword: query, page_size: "50" });
      if (!payload) { errors += 1; break; }
      const infoList = asRecord(asRecord(payload).data).infoList;
      if (!Array.isArray(infoList)) continue;
      rawResultCount += infoList.length;
      for (const entry of infoList) {
        const contact = asRecord(asRecord(entry).contact);
        const username = stringValue(contact.username);
        const displayName = stringValue(contact.nickname);
        if (!username || !displayName) continue;
        creators.push({
          platform: "视频号",
          creatorKey: username,
          displayName,
          discoveryQuery: query,
          sourceKind: "account_search",
          evidenceTitle: stringValue(contact.signature) || undefined,
          bio: stringValue(contact.signature) || undefined,
          followerCount: numericValue(contact.followCount) || undefined,
          isVerified: Boolean(contact.authIconType),
        });
      }
    }
  }
  const aggregated = aggregateCreatorEvidence(creators).slice(0, target);
  return {
    creators: aggregated,
    diagnostics: {
      platform: "视频号" as const,
      queryCount: attemptedQueries,
      rawResultCount,
      creatorCount: aggregated.length,
      profileCount: 0,
      errors,
    } satisfies ViralCreatorDiscoveryDiagnostics,
  };
}

function aggregateCreatorEvidence(candidates: ViralCreatorCandidate[]) {
  const grouped = new Map<string, ViralCreatorCandidate>();
  for (const candidate of candidates) {
    const key = `${candidate.platform}:${candidate.creatorKey}`;
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, { ...candidate, evidenceCount: 1, evidence: [{ query: candidate.discoveryQuery ?? "", title: candidate.evidenceTitle, url: candidate.evidenceUrl }] });
      continue;
    }
    grouped.set(key, {
      ...existing,
      profileUrl: existing.profileUrl ?? candidate.profileUrl,
      evidenceCount: (existing.evidenceCount ?? 1) + 1,
      evidence: [...(existing.evidence ?? []), { query: candidate.discoveryQuery ?? "", title: candidate.evidenceTitle, url: candidate.evidenceUrl }],
      followerCount: Math.max(existing.followerCount ?? 0, candidate.followerCount ?? 0) || undefined,
      platformWorkCount: Math.max(existing.platformWorkCount ?? 0, candidate.platformWorkCount ?? 0) || undefined,
      isVerified: Boolean(existing.isVerified || candidate.isVerified),
      bio: existing.bio ?? candidate.bio,
    });
  }
  return [...grouped.values()];
}

export async function discoverPlatformViralData(options: { refresh?: boolean } = {}): Promise<ViralPlatformDiscovery> {
  const providerArticlePromise = discoverWechatProviderArticles(
    viralPlatformSearches.find((config) => config.platform === "公众号")?.queries ?? [],
    boundedInteger(process.env.VIRAL_WECHAT_PROVIDER_ARTICLE_LIMIT, 30, 3, 100),
  );
  const candidates = (await Promise.all(viralPlatformSearches.flatMap((config) => config.queries.map(async (query, queryIndex) => {
    try {
      const source = config.platform === "公众号"
        ? await fetchSogouArticleSearchPage(config.searchUrl(query), options.refresh)
        // Browser automation is expensive and serialized by the shared logged-in
        // session. One fallback page per platform is enough to detect/render a
        // dynamic result list; the remaining queries still use direct HTML.
        : { html: await fetchNativeSearchPage(config.searchUrl(query), options.refresh, config.platform !== "抖音" && queryIndex === 0) };
      const parsed = parseNativeSearchResults(source.html, config, query, source.cookie);
      if (config.platform === "小红书") {
        console.info("[viral-examples] xiaohongshu query parsed", {
          query,
          htmlLength: source.html.length,
          renderedCards: (source.html.match(/\bnote-item\b/g) ?? []).length,
          resultCount: parsed.length,
        });
      }
      return parsed;
    } catch {
      return [];
    }
  })))).flat();
  const resolvedCandidates = (await Promise.all(candidates.map(async (candidate) => {
    if (candidate.config.platform !== "公众号") return candidate;
    const url = await resolveSogouArticleUrl(candidate.result.url, candidate.searchHtml, candidate.searchCookie);
    return url ? { ...candidate, result: { ...candidate.result, url } } : null;
  }))).filter((candidate): candidate is NativeSearchResult => Boolean(candidate));
  const seen = new Set<string>();
  const selected = resolvedCandidates
    .filter(({ config, result }) => result.url && result.title && isPlatformDetailUrl(result.url, config.platform) && isEligibleViralResult(result))
    .filter(({ result }) => {
      const key = result.url ?? result.title;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  const perPlatform = new Map<string, number>();
  const limited = selected.filter(({ config }) => {
    const count = perPlatform.get(config.platform) ?? 0;
    if (count >= 3) return false;
    perPlatform.set(config.platform, count + 1);
    return true;
  });
  console.info("[viral-examples] native search candidates", {
    parsed: candidates.length,
    resolved: resolvedCandidates.length,
    selected: selected.length,
    limited: limited.length,
    selectedCoverage: selected.reduce<Record<string, number>>((counts, candidate) => {
      counts[candidate.config.platform] = (counts[candidate.config.platform] ?? 0) + 1;
      return counts;
    }, {}),
  });

  const nativeCandidates = await Promise.all(limited.map(async ({ config, query, result }, index) => {
    // The authenticated Xiaohongshu search card already carries the canonical
    // title, author and cover. An anonymous detail request often returns the
    // generic platform metadata and must not overwrite those real card fields.
    const hasCompleteXiaohongshuCard = config.platform === "小红书"
      && Boolean(result.title && result.authorName && result.thumbnailUrl);
    const metadata = hasCompleteXiaohongshuCard ? {} : await fetchSourceMetadata(result.url, config.platform);
    const metadataTitle = metadata.title && !/小红书\s*[-—]|你访问的页面不见了|页面不存在|404/i.test(metadata.title) ? metadata.title : undefined;
    const title = cleanText(metadataTitle ?? result.title);
    return {
      id: `search-${config.platform}-${index}-${encodeURIComponent(title).slice(0, 22)}`,
      title,
      platform: config.platform,
      type: config.type,
      sourceUrl: metadata.sourceUrl ?? result.url,
      sourceTitle: title,
      authorName: metadata.authorName ?? result.authorName,
      authorKey: result.authorKey,
      authorProfileUrl: result.authorProfileUrl,
      discoveryQuery: query,
      excerpt: result.excerpt,
      thumbnailUrl: metadata.thumbnailUrl ?? result.thumbnailUrl,
      publishedAt: metadata.publishedAt ?? result.publishedAt,
      fetchedAt: new Date().toISOString(),
      metricLabel: result.metricLabel,
      metricValue: metadata.metricValue ?? result.metricValue,
      metricUnit: result.metricUnit,
      category: inferHotTopicCategory(title),
      contentType: config.type === "爆文" ? "公众号正文" : "平台热门作品",
      tags: [inferHotTopicCategory(title), "平台搜索", query.slice(0, 12)],
      insight: buildViralInsight(title, config.platform),
      status: "needs-review" as const,
      statusNote: metadata.thumbnailUrl ? "已自动读取作品封面，发布前请核验来源信息" : "来源信息待补全，发布前请核验",
    } satisfies ViralExample;
  }));
  const nativeItems = nativeCandidates.filter(isDisplayableNativeItem);
  console.info("[viral-examples] native search displayable", {
    itemCount: nativeItems.length,
    coverage: nativeItems.reduce<Record<string, number>>((counts, item) => {
      counts[item.platform] = (counts[item.platform] ?? 0) + 1;
      return counts;
    }, {}),
  });
  const douyinHotItems = nativeItems.some((item) => item.platform === "抖音") ? [] : await discoverDouyinHotExamples();
  const providerArticles = await providerArticlePromise;
  const providerWechatItems = providerArticles.items.map(wechatProviderArticleToExample);
  const wechatChannelItems = await discoverAuthorizedWechatChannelExamples();
  const wechatChannelSearchItems = await discoverWechatChannelSearchExamples();
  const directlyDiscoveredItems = [...nativeItems, ...providerWechatItems, ...douyinHotItems, ...wechatChannelItems, ...wechatChannelSearchItems];
  const initialWorkCandidates = deduplicateWorkCandidates([
    ...selected.map(({ config, query, result }) => ({
      platform: config.platform,
      sourceUrl: result.url,
      title: result.title,
      authorName: result.authorName,
      authorKey: result.authorKey,
      authorProfileUrl: result.authorProfileUrl,
      discoveryQuery: query,
      rawData: { metricLabel: result.metricLabel, metricValue: result.metricValue },
    })),
    ...directlyDiscoveredItems.map((item) => viralExampleToCandidate(item)),
  ]);
  const creators = deduplicateCreatorCandidates(initialWorkCandidates.map((candidate) => workCandidateToCreator(candidate)).filter((candidate): candidate is ViralCreatorCandidate => Boolean(candidate)));
  const creatorProfileItems = await discoverCreatorProfileWorks(creators);
  const items = deduplicateViralExamples([...directlyDiscoveredItems, ...creatorProfileItems]);
  const workCandidates = deduplicateWorkCandidates([...initialWorkCandidates, ...creatorProfileItems.map(viralExampleToCandidate)]);
  return { items, creators, candidates: workCandidates };
}

function wechatProviderArticleToExample(article: WechatProviderArticle, index: number): ViralExample {
  const title = cleanText(article.title);
  return {
    id: `${article.provider}-wechat-${index}-${encodeURIComponent(title).slice(0, 22)}`,
    title,
    platform: "公众号",
    type: "爆文",
    sourceUrl: article.sourceUrl,
    sourceTitle: title,
    authorName: article.authorName,
    authorKey: article.authorKey,
    authorProfileUrl: article.authorProfileUrl,
    discoveryQuery: article.discoveryQuery,
    excerpt: article.excerpt,
    thumbnailUrl: article.thumbnailUrl,
    articleBody: article.articleBody,
    publishedAt: article.publishedAt,
    fetchedAt: new Date().toISOString(),
    metricLabel: "阅读量待核验",
    category: inferHotTopicCategory(title),
    contentType: article.provider === "werss" ? "WeRSS订阅文章" : "WechatSogou搜索文章",
    tags: [inferHotTopicCategory(title), article.provider === "werss" ? "授权订阅" : "平台搜索", article.discoveryQuery ?? "公众号"],
    insight: buildViralInsight(title, "公众号"),
    status: "needs-review",
    statusNote: article.provider === "werss" ? "来自WeRSS授权订阅，发布前请核验原文。" : "来自WechatSogou搜索，发布前请核验原文。",
  };
}

async function discoverCreatorProfileWorks(creators: ViralCreatorCandidate[]) {
  if (process.env.VIRAL_CREATOR_PROFILE_REFRESH_ENABLED === "0") return [];
  const maxAccounts = boundedPositiveInteger(process.env.VIRAL_CREATOR_REFRESH_MAX_ACCOUNTS, 8, 1, 50);
  const maxWorks = boundedPositiveInteger(process.env.VIRAL_CREATOR_REFRESH_MAX_WORKS, 10, 1, 30);
  const browserAccounts = boundedPositiveInteger(process.env.VIRAL_CREATOR_REFRESH_BROWSER_ACCOUNTS, 3, 1, 10);
  const refreshable = creators.filter((creator) => creator.profileUrl && creator.platform !== "视频号").slice(0, maxAccounts);
  const output: ViralExample[] = [];

  for (const [creatorIndex, creator] of refreshable.entries()) {
    const config = viralPlatformSearches.find((entry) => entry.platform === creator.platform);
    if (!config || !creator.profileUrl) continue;
    try {
      // Only one profile uses the shared browser session; direct HTML is used
      // for the rest so a larger author pool cannot serialize the whole run.
      const html = await fetchNativeSearchPage(creator.profileUrl, true, creatorIndex < browserAccounts);
      applyCreatorProfileData(creator, html);
      const parsed = parseNativeSearchResults(html, config, creator.displayName).slice(0, maxWorks);
      for (const { result } of parsed) {
        output.push({
          id: `creator-${creator.platform}-${encodeURIComponent(creator.creatorKey).slice(0, 18)}-${output.length}`,
          title: result.title,
          platform: creator.platform,
          type: config.type,
          sourceUrl: result.url,
          sourceTitle: result.title,
          authorName: creator.displayName,
          authorKey: creator.creatorKey,
          authorProfileUrl: creator.profileUrl,
          discoveryQuery: `作者主页:${creator.displayName}`,
          excerpt: result.excerpt,
          thumbnailUrl: result.thumbnailUrl,
          publishedAt: result.publishedAt,
          fetchedAt: new Date().toISOString(),
          metricLabel: result.metricLabel,
          metricValue: result.metricValue,
          metricUnit: result.metricUnit,
          category: inferHotTopicCategory(result.title),
          contentType: config.type === "爆文" ? "作者近期文章" : "作者近期作品",
          tags: [inferHotTopicCategory(result.title), "作者主页", creator.displayName],
          insight: buildViralInsight(result.title, creator.platform),
          status: "needs-review",
          statusNote: "来自作者主页近期作品列表，发布前请复核互动数据。",
        });
      }
    } catch {
      continue;
    }
  }
  return output;
}

async function enrichCreatorProfiles(creators: ViralCreatorCandidate[]) {
  if (process.env.VIRAL_CREATOR_PROFILE_REFRESH_ENABLED === "0") return;
  const maxAccounts = boundedPositiveInteger(process.env.VIRAL_CREATOR_REFRESH_MAX_ACCOUNTS, 8, 1, 50);
  const browserAccounts = boundedPositiveInteger(process.env.VIRAL_CREATOR_REFRESH_BROWSER_ACCOUNTS, 3, 1, 10);
  const refreshable = creators.filter((creator) => creator.profileUrl && creator.platform !== "视频号").slice(0, maxAccounts);
  for (const [creatorIndex, creator] of refreshable.entries()) {
    if (!creator.profileUrl) continue;
    try {
      const html = await fetchNativeSearchPage(creator.profileUrl, true, creatorIndex < browserAccounts);
      applyCreatorProfileData(creator, html);
    } catch {
      continue;
    }
  }
}

function applyCreatorProfileData(creator: ViralCreatorCandidate, html: string) {
  creator.bio = creator.bio || extractCreatorProfileBio(html);
  const stats = extractCreatorProfileStats(html, creator.platform);
  if (typeof stats.followerCount === "number") creator.followerCount = stats.followerCount;
  if (typeof stats.isVerified === "boolean") creator.isVerified = stats.isVerified;
  if (typeof stats.platformWorkCount === "number") {
    creator.platformWorkCount = stats.platformWorkCount;
    creator.profileStatsSource = "profile_page";
  }
}

function deduplicateViralExamples(items: ViralExample[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.platform}:${canonicalizeViralSourceUrl(item.sourceUrl)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function viralExampleToCandidate(item: ViralExample): ViralWorkCandidate {
  return {
    platform: item.platform,
    sourceUrl: item.sourceUrl,
    title: item.title,
    authorName: item.authorName,
    authorKey: item.authorKey,
    authorProfileUrl: item.authorProfileUrl,
    discoveryQuery: item.discoveryQuery,
    rawData: { metricLabel: item.metricLabel, metricValue: item.metricValue, publishedAt: item.publishedAt },
  };
}

function workCandidateToCreator(candidate: ViralWorkCandidate): ViralCreatorCandidate | null {
  const displayName = candidate.authorName?.trim();
  if (!displayName) return null;
  const creatorKey = candidate.authorKey?.trim() || normalizeDiscoveredCreatorKey(displayName);
  return {
    platform: candidate.platform,
    creatorKey,
    displayName,
    profileUrl: candidate.authorProfileUrl,
    discoveryQuery: candidate.discoveryQuery,
    sourceKind: candidate.platform === "视频号" ? "account_search" : candidate.discoveryQuery && !candidate.discoveryQuery.includes("保险") ? "hot_list" : "platform_search",
  };
}

function deduplicateCreatorCandidates(candidates: ViralCreatorCandidate[]) {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = `${candidate.platform}:${candidate.creatorKey}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function deduplicateWorkCandidates(candidates: ViralWorkCandidate[]) {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = `${candidate.platform}:${canonicalizeViralSourceUrl(candidate.sourceUrl)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeDiscoveredCreatorKey(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "").slice(0, 200) || value.slice(0, 200);
}

async function discoverDouyinHotExamples(): Promise<ViralExample[]> {
  try {
    const response = await fetch(`${douyinHotSearchApiBase}/list/`, {
      headers: { "user-agent": "Aweme/300401 (iPhone; iOS 18.0; Scale/3.00)" },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return [];
    const payload = asRecord(await response.json());
    const words = asRecord(payload.data).word_list;
    if (!Array.isArray(words)) return [];
    const topics = words
      .map((entry) => asRecord(entry))
      .filter((entry) => douyinHotTopicPattern.test(stringValue(entry.word)))
      .slice(0, 5);

    const results = await Promise.all(topics.map(async (topic) => {
      const word = stringValue(topic.word);
      const url = new URL(`${douyinHotSearchApiBase}/video/list/`);
      url.searchParams.set("hotword", word);
      url.searchParams.set("count", "10");
      try {
        const videoResponse = await fetch(url, {
          headers: { "user-agent": "Aweme/300401 (iPhone; iOS 18.0; Scale/3.00)" },
          cache: "no-store",
          signal: AbortSignal.timeout(8_000),
        });
        if (!videoResponse.ok) return null;
        const videoPayload = asRecord(await videoResponse.json());
        const awemeList = Array.isArray(videoPayload.aweme_list) ? videoPayload.aweme_list : [];
        for (const entry of awemeList) {
          const aweme = asRecord(entry);
          const id = stringValue(aweme.aweme_id);
          const title = cleanText(stringValue(aweme.desc));
          const author = asRecord(aweme.author);
          const authorName = stringValue(author.nickname);
          const authorKey = stringValue(author.sec_uid ?? author.uid ?? author.unique_id) || undefined;
          const video = asRecord(aweme.video);
          const thumbnailUrl = firstUrl(asRecord(video.origin_cover)) || firstUrl(asRecord(video.cover));
          const createdAt = numericValue(aweme.create_time);
          if (!/^\d+$/.test(id) || title.length < 5 || !authorName || !thumbnailUrl || !createdAt) continue;
          const publishedAt = new Date(createdAt * 1000).toISOString();
          if (!isEligibleViralResult({ title, publishedAt })) continue;
          const metricValue = numericValue(asRecord(aweme.statistics).digg_count);
          return {
            id: `douyin-hot-${id}`,
            title,
            platform: "抖音" as const,
            type: "短视频" as const,
            sourceUrl: `https://www.douyin.com/video/${id}`,
            sourceTitle: title,
            authorName,
            authorKey,
            authorProfileUrl: authorKey ? `https://www.douyin.com/user/${encodeURIComponent(authorKey)}` : undefined,
            discoveryQuery: word,
            thumbnailUrl,
            publishedAt,
            fetchedAt: new Date().toISOString(),
            metricLabel: "点赞",
            metricValue: metricValue || undefined,
            category: inferHotTopicCategory(word),
            contentType: "热点短视频",
            tags: [inferHotTopicCategory(word), "平台搜索", "抖音热榜"],
            insight: buildViralInsight(`${word} ${title}`, "抖音"),
            status: "ready" as const,
            statusNote: "已从抖音公开热榜读取作品、作者、封面和互动数据",
          } satisfies ViralExample;
        }
      } catch {
        return null;
      }
      return null;
    }));
    return results.filter((item): item is NonNullable<typeof item> => item !== null).slice(0, 3);
  } catch {
    return [];
  }
}

function firstUrl(value: Record<string, unknown>) {
  const urls = value.url_list;
  return Array.isArray(urls) ? urls.find((item): item is string => typeof item === "string" && item.startsWith("https://")) ?? "" : "";
}

function isDisplayableNativeItem(item: ViralExample) {
  if (item.platform !== "小红书") return true;
  return !/· 小红书作品$/.test(item.title)
    && !/picasso-static\.xiaohongshu\.com\/fe-platform\//i.test(item.thumbnailUrl ?? "");
}

function numericValue(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : 0;
}

export async function enrichViralExampleMetadata(items: ViralExample[]) {
  return Promise.all(items.map(async (item) => {
    if (item.authorName && item.thumbnailUrl) return item;
    const metadata = await fetchSourceMetadata(item.sourceUrl, item.platform);
    const title = metadata.title && !/小红书\s*[-—]|你访问的页面不见了|页面不存在|404/i.test(metadata.title)
      ? cleanText(metadata.title)
      : item.title;
    return {
      ...item,
      title,
      sourceTitle: title,
      sourceUrl: metadata.sourceUrl ?? item.sourceUrl,
      authorName: metadata.authorName ?? item.authorName,
      thumbnailUrl: metadata.thumbnailUrl ?? item.thumbnailUrl,
      publishedAt: metadata.publishedAt ?? item.publishedAt,
      metricValue: metadata.metricValue ?? item.metricValue,
    };
  }));
}

async function discoverWechatChannelSearchExamples(): Promise<ViralExample[]> {
  if (process.env.VIRAL_WECHAT_DISCOVERY_ENABLED !== "1") return [];
  const baseUrl = process.env.VIRAL_WECHAT_DISCOVERY_API_BASE?.trim();
  if (!baseUrl) return [];
  const queries = parseWechatChannelDiscoveryQueries(process.env.VIRAL_WECHAT_DISCOVERY_QUERIES);
  const maxAccounts = boundedPositiveInteger(process.env.VIRAL_WECHAT_DISCOVERY_MAX_ACCOUNTS, 3, 1, 8);
  const maxWorks = boundedPositiveInteger(process.env.VIRAL_WECHAT_DISCOVERY_MAX_WORKS, 3, 1, 8);
  const accounts = new Map<string, { authorName?: string; query: string }>();

  for (const query of queries) {
    const payload = await fetchWechatChannelDiscoveryApi(baseUrl, "/api/channels/contact/search", { keyword: query, page_size: "20" });
    // A connected adapter can still lack the consumer-side search session.
    // Stop after the first failed call so Video Channels cannot block every
    // other platform's refresh for several minutes.
    if (!payload) break;
    const infoList = asRecord(asRecord(payload).data).infoList;
    if (!Array.isArray(infoList)) continue;
    for (const entry of infoList) {
      const contact = asRecord(asRecord(entry).contact);
      const username = stringValue(contact.username);
      if (!username || accounts.has(username)) continue;
      accounts.set(username, { authorName: stringValue(contact.nickname) || undefined, query });
      if (accounts.size >= maxAccounts) break;
    }
    if (accounts.size >= maxAccounts) break;
  }

  const output: ViralExample[] = [];
  const seen = new Set<string>();
  for (const [username, account] of accounts) {
    const payload = await fetchWechatChannelDiscoveryApi(baseUrl, "/api/channels/contact/feed/list", { username, page_size: String(maxWorks) });
    const objects = asRecord(asRecord(payload).data).object;
    if (!Array.isArray(objects)) continue;
    for (const rawObject of objects) {
      if (output.length >= 3) return output;
      const object = asRecord(rawObject);
      const objectDesc = asRecord(object.objectDesc);
      const objectId = stringValue(object.id);
      const nonceId = stringValue(object.objectNonceId);
      const title = cleanText(stringValue(objectDesc.description));
      const sourceUrl = buildWechatChannelWorkUrl(objectId, nonceId);
      const publishedAt = unixTimestampToIso(object.createtime ?? object.createTime ?? object.publishTime);
      if (!sourceUrl || title.length < 5 || !isLikelyViralTitle(title) || !isEligibleViralResult({ title, publishedAt }) || seen.has(sourceUrl)) continue;
      seen.add(sourceUrl);
      const media = Array.isArray(objectDesc.media) ? asRecord(objectDesc.media[0]) : {};
      const thumbnailUrl = stringValue(media.thumbUrl ?? media.coverUrl ?? object.coverUrl) || undefined;
      output.push({
        id: `linux-视频号-${encodeURIComponent(objectId).slice(0, 24)}`,
        title,
        platform: "视频号",
        type: "短视频",
        sourceUrl,
        sourceTitle: title,
        authorName: account.authorName,
        authorKey: username,
        discoveryQuery: account.query,
        excerpt: title,
        thumbnailUrl,
        publishedAt,
        fetchedAt: new Date().toISOString(),
        metricLabel: "互动待核验",
        category: inferHotTopicCategory(title),
        contentType: "视频号公开作品",
        tags: [inferHotTopicCategory(title), "视频号账号搜索", account.query],
        insight: buildViralInsight(title, "视频号"),
        status: "needs-review",
        statusNote: "来自自托管 Linux 视频号账号搜索；请在已登录的视频号会话中打开来源复核互动数据。",
      });
    }
  }
  return output;
}

async function fetchWechatChannelDiscoveryApi(baseUrl: string, pathname: string, params: Record<string, string>): Promise<unknown> {
  try {
    const url = new URL(pathname, baseUrl.replace(/\/$/, "") + "/");
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    const response = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(Number(process.env.VIRAL_WECHAT_DISCOVERY_TIMEOUT_MS ?? 12000)) });
    if (!response.ok) return null;
    const payload = await response.json() as Record<string, unknown>;
    return Number(payload.code ?? 0) === 0 ? payload : null;
  } catch {
    return null;
  }
}

function parseWechatChannelDiscoveryQueries(value?: string) {
  const configured = (value ?? "").split(/[\n,;]+/).map((item) => item.trim()).filter(Boolean);
  return [...new Set(configured.length > 0 ? configured : defaultWechatChannelDiscoveryQueries)].slice(0, 8);
}

function boundedPositiveInteger(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(Math.max(Math.floor(parsed), min), max) : fallback;
}

function buildWechatChannelWorkUrl(objectId: string, nonceId: string) {
  if (!objectId || !nonceId) return null;
  const url = new URL("https://channels.weixin.qq.com/finder-preview/pages/feed");
  url.searchParams.set("objectId", objectId);
  url.searchParams.set("nonceId", nonceId);
  return isPlatformDetailUrl(url.toString(), "视频号") ? url.toString() : null;
}

function unixTimestampToIso(value: unknown) {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return undefined;
  return new Date(timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp).toISOString();
}

async function discoverAuthorizedWechatChannelExamples(): Promise<ViralExample[]> {
  const urls = parseWechatChannelSourceUrls(process.env.VIRAL_WECHAT_CHANNEL_SOURCE_URLS);
  if (urls.length === 0) return [];
  const items = await Promise.all(urls.slice(0, 3).map(async (sourceUrl, index) => {
    const inspected = await inspectWechatChannelsWithContainerBrowser(sourceUrl);
    if (inspected.status !== "success") return null;
    const metadata = extractWechatChannelMetadata(inspected.payload);
    if (!metadata.title) return null;
    return {
      id: `authorized-视频号-${index}-${encodeURIComponent(metadata.title).slice(0, 22)}`,
      title: metadata.title,
      platform: "视频号" as const,
      type: "短视频" as const,
      sourceUrl,
      sourceTitle: metadata.title,
      authorName: metadata.authorName,
      discoveryQuery: "authorized_link",
      excerpt: metadata.excerpt,
      thumbnailUrl: metadata.thumbnailUrl,
      publishedAt: metadata.publishedAt,
      fetchedAt: new Date().toISOString(),
      metricLabel: "互动待核验",
      category: inferHotTopicCategory(metadata.title),
      contentType: "视频号公开作品",
      tags: [inferHotTopicCategory(metadata.title), "授权分享链接", "视频号核验"],
      insight: buildViralInsight(metadata.title, "视频号"),
      status: "needs-review" as const,
      statusNote: "已通过当前登录态读取视频号作品详情；互动数据发布前仍需复核。",
    } satisfies ViralExample;
  }));
  return items.filter((item): item is NonNullable<typeof item> => item !== null);
}

function parseWechatChannelSourceUrls(value?: string) {
  return [...new Set((value ?? "").split(/[\s,;\n]+/).map((item) => item.trim()).filter((item) => isPlatformDetailUrl(item, "视频号")))];
}

function extractWechatChannelMetadata(payload: Record<string, unknown>) {
  const nestedData = asRecord(payload.data);
  const data = Object.keys(nestedData).length > 0 ? nestedData : payload;
  const feed = asRecord(data.feedInfo);
  const author = asRecord(data.authorInfo);
  const title = cleanText(stringValue(feed.description));
  const timestamp = Number(feed.createtime);
  return {
    title,
    authorName: stringValue(author.nickname) || undefined,
    excerpt: title || undefined,
    thumbnailUrl: stringValue(feed.coverUrl) || undefined,
    publishedAt: Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp * 1000).toISOString() : undefined,
  };
}

type NativeSearchResult = {
  config: NativeSearchConfig;
  query: string;
  searchHtml?: string;
  searchCookie?: string;
  result: { url: string; title: string; thumbnailUrl?: string; authorName?: string; authorKey?: string; authorProfileUrl?: string; followerCount?: number; isVerified?: boolean; excerpt?: string; publishedAt?: string; metricLabel: string; metricValue?: number; metricUnit?: string };
};

async function fetchNativeSearchPage(url: string, refresh = false, allowBrowserFallback = true) {
  const direct = await fetch(url, {
    cache: refresh ? "no-store" : undefined,
    headers: { "user-agent": nativeSearchUserAgent, accept: "text/html,application/xhtml+xml" },
    signal: AbortSignal.timeout(Number(process.env.VIRAL_EXAMPLES_TIMEOUT_MS ?? 12000)),
  }).then((response) => response.ok ? response.text() : "").catch(() => "");
  const isXiaohongshuSearch = /(^|\.)xiaohongshu\.com$/i.test(new URL(url).hostname);
  const directHasUsableResults = isXiaohongshuSearch
    ? containsRenderedXiaohongshuCard(direct)
    : containsSearchDetailUrl(direct) || containsSogouArticleList(direct);
  if (direct && directHasUsableResults) return direct;
  if (!allowBrowserFallback || process.env.VIRAL_SEARCH_BROWSER_ENABLED === "0") return direct;
  return (await fetchSearchPageWithCdp(url)) ?? direct;
}

function containsRenderedXiaohongshuCard(html: string) {
  return /class=["'][^"']*\bnote-item\b[^"']*["']/i.test(html)
    && /href=["'][^"']*\/(?:explore|discovery\/item)\/[A-Za-z0-9_-]+/i.test(html)
    && /class=["'][^"']*\bname\b[^"']*["']/i.test(html);
}

async function fetchSogouArticleSearchPage(url: string, refresh = false) {
  const response = await fetch(url, {
    cache: refresh ? "no-store" : undefined,
    headers: { "user-agent": nativeSearchUserAgent, accept: "text/html,application/xhtml+xml" },
    signal: AbortSignal.timeout(Number(process.env.VIRAL_EXAMPLES_TIMEOUT_MS ?? 12000)),
  }).catch(() => null);
  if (!response?.ok) return { html: "" };
  return { html: await response.text(), cookie: extractResponseCookie(response.headers) };
}

const nativeSearchUserAgent = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131 Safari/537.36";

function parseNativeSearchResults(html: string, config: NativeSearchConfig, query: string, searchCookie?: string): NativeSearchResult[] {
  if (!html) return [];
  if (config.platform === "公众号") return parseSogouArticleResults(html, config, query, searchCookie);
  if (config.platform === "抖音") {
    const apiResults = parseDouyinSearchApiResults(html, config, query);
    if (apiResults.length > 0) return apiResults;
  }
  if (config.platform === "小红书") {
    const renderedCards = parseXiaohongshuRenderedCards(html, config, query);
    if (renderedCards.length > 0) return renderedCards;
  }
  const output: NativeSearchResult[] = [];
  const seen = new Set<string>();
  const anchorPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = anchorPattern.exec(html)) && output.length < 12) {
    const url = normalizeNativeResultUrl(match[1], config);
    const anchorTitle = cleanText(stripMarkup(decodeHtml(match[2])));
    // Xiaohongshu search cards expose an intentionally hidden detail anchor.
    // The canonical title and cover are then read from that real note page below.
    const title = anchorTitle || (config.platform === "小红书" && url ? `${query} · 小红书作品` : "");
    if (!url || title.length < 5 || !isPlatformDetailUrl(url, config.platform) || !isLikelyViralTitle(title) || seen.has(url)) continue;
    seen.add(url);
    const image = match[2].match(/(?:src|data-src|data-original)=["']([^"']+)["']/i)?.[1];
    let thumbnailUrl: string | undefined;
    try { thumbnailUrl = image ? new URL(decodeHtml(image), config.searchUrl(query)).toString() : undefined; } catch { thumbnailUrl = undefined; }
    output.push({ config, query, result: { url, title, thumbnailUrl, metricLabel: config.type === "爆文" ? "阅读量待核验" : "热度待核验" } });
  }
  if (output.length === 0) output.push(...parseSerializedPlatformResults(html, config, query));
  return output;
}

function parseDouyinSearchApiResults(input: string, config: NativeSearchConfig, query: string): NativeSearchResult[] {
  let payload: unknown;
  try { payload = JSON.parse(input); } catch { return []; }
  const results: NativeSearchResult[] = [];
  const seen = new Set<string>();
  const visit = (value: unknown, depth: number) => {
    if (depth > 8 || results.length >= 30) return;
    if (Array.isArray(value)) { value.forEach((entry) => visit(entry, depth + 1)); return; }
    const record = asRecord(value);
    if (Object.keys(record).length === 0) return;
    const aweme = Object.keys(asRecord(record.aweme_info)).length > 0 ? asRecord(record.aweme_info) : record;
    const id = stringValue(aweme.aweme_id ?? aweme.group_id);
    const author = asRecord(aweme.author);
    const authorName = stringValue(author.nickname);
    const authorKey = stringValue(author.sec_uid ?? author.uid ?? author.unique_id);
    const title = cleanText(stringValue(aweme.desc ?? aweme.title));
    if (/^\d{8,}$/.test(id) && authorName && authorKey && title.length >= 2 && !seen.has(id)) {
      seen.add(id);
      const video = asRecord(aweme.video);
      const thumbnailUrl = firstUrl(asRecord(video.cover)) || firstUrl(asRecord(video.origin_cover)) || undefined;
      results.push({
        config,
        query,
        result: {
          url: `https://www.douyin.com/video/${id}`,
          title,
          authorName,
          authorKey,
          authorProfileUrl: `https://www.douyin.com/user/${encodeURIComponent(authorKey)}`,
          followerCount: numericValue(author.follower_count) || undefined,
          isVerified: Boolean(stringValue(author.custom_verify ?? author.enterprise_verify_reason)),
          thumbnailUrl,
          metricLabel: "点赞",
          metricValue: numericValue(asRecord(aweme.statistics).digg_count) || undefined,
        },
      });
    }
    Object.values(record).forEach((entry) => {
      if (entry !== aweme) visit(entry, depth + 1);
    });
  };
  visit(payload, 0);
  return results;
}

function parseXiaohongshuRenderedCards(html: string, config: NativeSearchConfig, query: string): NativeSearchResult[] {
  const starts = [...html.matchAll(/<(?:section|div)\b[^>]*class=["'][^"']*\bnote-item\b[^"']*["'][^>]*>/gi)];
  const results: NativeSearchResult[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < starts.length && results.length < 12; index += 1) {
    const start = starts[index].index ?? 0;
    const end = starts[index + 1]?.index ?? Math.min(html.length, start + 12_000);
    const card = html.slice(start, end);
    const href = card.match(/href=["']([^"']*\/(?:explore|discovery\/item)\/[A-Za-z0-9_-]+[^"']*)["']/i)?.[1];
    const url = href ? normalizeNativeResultUrl(href, config) : null;
    const titleMarkup = card.match(/<(?:a|span)[^>]*class=["'][^"']*\btitle\b[^"']*["'][^>]*>([\s\S]*?)<\/(?:a|span)>/i)?.[1]
      ?? card.match(/<(?:a|span)[^>]*(?:title|aria-label)=["']([^"']{5,160})["'][^>]*>/i)?.[1];
    const title = cleanText(stripMarkup(decodeHtml(titleMarkup ?? "")));
    const authorMarkup = card.match(/<(?:a|span|div)[^>]*class=["'][^"']*\bname\b[^"']*["'][^>]*>([\s\S]*?)<\/(?:a|span|div)>/i)?.[1];
    const authorName = cleanText(stripMarkup(decodeHtml(authorMarkup ?? ""))) || undefined;
    const authorHref = card.match(/href=["']([^"']*\/user\/profile\/[A-Za-z0-9_-]+[^"']*)["']/i)?.[1];
    let authorProfileUrl: string | undefined;
    try { authorProfileUrl = authorHref ? new URL(decodeHtml(authorHref), "https://www.xiaohongshu.com").toString() : undefined; } catch { authorProfileUrl = undefined; }
    const authorKey = authorProfileUrl?.match(/\/user\/profile\/([A-Za-z0-9_-]+)/i)?.[1];
    const image = card.match(/<img\b[^>]*(?:src|data-src)=["']([^"']+)["']/i)?.[1];
    let thumbnailUrl: string | undefined;
    try { thumbnailUrl = image ? new URL(decodeHtml(image), config.searchUrl(query)).toString() : undefined; } catch { thumbnailUrl = undefined; }
    if (!url || title.length < 5 || !authorName || !thumbnailUrl || seen.has(url)) continue;
    if (/picasso-static\.xiaohongshu\.com\/fe-platform\//i.test(thumbnailUrl)) continue;
    seen.add(url);
    results.push({ config, query, result: { url, title, authorName, authorKey, authorProfileUrl, thumbnailUrl, metricLabel: "互动待核验" } });
  }
  return results;
}

function parseSogouArticleResults(html: string, config: NativeSearchConfig, query: string, searchCookie?: string): NativeSearchResult[] {
  const results: NativeSearchResult[] = [];
  const seen = new Set<string>();
  const rows = html.match(/<li(?:\s[^>]*)?>[\s\S]*?<\/li>/gi) ?? [];
  for (const row of rows) {
    const href = row.match(/<a\b[^>]*href=["']([^"']*(?:\/link\?url=|mp\.weixin\.qq\.com\/s\/)[^"']*)["']/i)?.[1];
    const titleMarkup = row.match(/<h3\b[^>]*>[\s\S]*?<a\b[^>]*>([\s\S]*?)<\/a>/i)?.[1];
    const title = cleanText(stripMarkup(decodeHtml(titleMarkup ?? "")));
    if (!href || title.length < 5 || !isLikelyViralTitle(title) || seen.has(href)) continue;
    seen.add(href);
    const image = row.match(/<img\b[^>]*(?:src|data-src)=["']([^"']+)["']/i)?.[1];
    const excerptMarkup = row.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1];
    const authorMarkup = row.match(/<span\b[^>]*class=["'][^"']*all-time-y2[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1]
      ?? row.match(/<a\b[^>]*(?:data-isv|data-headimage)[^>]*>([\s\S]*?)<\/a>/i)?.[1];
    const timestamp = row.match(/timeConvert\(['"](\d{9,})['"]\)/i)?.[1];
    let thumbnailUrl: string | undefined;
    try { thumbnailUrl = image ? new URL(decodeHtml(image), config.searchUrl(query)).toString() : undefined; } catch { thumbnailUrl = undefined; }
    results.push({
      config,
      query,
      searchHtml: html,
      searchCookie,
      result: {
        url: decodeHtml(href), title, thumbnailUrl,
        authorName: cleanText(stripMarkup(decodeHtml(authorMarkup ?? ""))) || undefined,
        excerpt: cleanText(stripMarkup(decodeHtml(excerptMarkup ?? ""))) || undefined,
        publishedAt: timestamp ? new Date(Number(timestamp) * 1000).toISOString() : undefined,
        metricLabel: "阅读量待核验",
      },
    });
    if (results.length >= 20) break;
  }
  return results;
}

function parseSerializedPlatformResults(html: string, config: NativeSearchConfig, query: string): NativeSearchResult[] {
  const patterns = config.platform === "抖音"
    ? [/(?:aweme_id|video_id)["']?\s*[:=]\s*["'](\d{8,})["']/gi]
    : config.platform === "小红书"
      ? [/(?:note_id|noteId)["']?\s*[:=]\s*["']([A-Za-z0-9_-]{8,})["']/gi]
      : [];
  const results: NativeSearchResult[] = [];
  const seen = new Set<string>();
  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      const id = match[1];
      const url = config.platform === "抖音" ? `https://www.douyin.com/video/${id}` : `https://www.xiaohongshu.com/explore/${id}`;
      if (seen.has(url) || !isPlatformDetailUrl(url, config.platform)) continue;
      seen.add(url);
      const position = match.index ?? 0;
      const context = html.slice(Math.max(0, position - 700), position + 700);
      const title = cleanText(decodeHtml(context.match(/(?:title|desc|text)["']?\s*[:=]\s*["']([^"']{5,160})/i)?.[1] ?? `${query} · 平台搜索作品`));
      const thumbnail = context.match(/(?:cover|cover_url|image|url)["']?\s*[:=]\s*["'](https?:[^"']+)/i)?.[1];
      results.push({ config, query, result: { url, title, thumbnailUrl: thumbnail, metricLabel: "热度待核验" } });
      if (results.length >= 12) return results;
    }
  }
  return results;
}

function normalizeNativeResultUrl(raw: string, config: NativeSearchConfig) {
  const decoded = decodeHtml(raw).replace(/\\\//g, "/");
  let url: URL;
  try { url = new URL(decoded, config.searchUrl(config.queries[0])); } catch { return null; }
  return config.hosts.test(url.hostname) && config.detailPath.test(url.pathname) ? url.toString() : null;
}

async function resolveSogouArticleUrl(raw: string, searchHtml?: string, searchCookie?: string) {
  try {
    let url = new URL(raw, "https://weixin.sogou.com");
    if (isPlatformDetailUrl(url.toString(), "公众号")) return url.toString();
    if (!url.hostname.endsWith("sogou.com") || !url.pathname.startsWith("/link")) return null;
    url = decorateSogouRedirectUrl(url, searchHtml);
    const response = await fetch(url, {
      headers: {
        "user-agent": nativeSearchUserAgent,
        referer: "https://weixin.sogou.com/weixin?type=2",
        ...(searchCookie ? { cookie: searchCookie } : {}),
      },
      redirect: "follow",
      signal: AbortSignal.timeout(6000),
    });
    if (isPlatformDetailUrl(response.url, "公众号")) return response.url;
    const page = await response.text();
    const base = page.match(/var\s+url\s*=\s*['"]([^'"]+)['"]/i)?.[1] ?? "";
    const suffix = [...page.matchAll(/url\s*\+=\s*['"]([^'"]+)['"]/gi)].map((match) => match[1]).join("");
    const resolved = decodeHtml(`${base}${suffix}`).replace(/@/g, "");
    return isPlatformDetailUrl(resolved, "公众号") ? resolved : null;
  } catch {
    return null;
  }
}

function extractResponseCookie(headers: Headers) {
  const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  const entries = getSetCookie?.call(headers) ?? [headers.get("set-cookie") ?? ""];
  return entries.map((entry) => entry.split(";", 1)[0]).filter(Boolean).join("; ") || undefined;
}

function decorateSogouRedirectUrl(url: URL, searchHtml?: string) {
  if (url.searchParams.has("k") || !searchHtml) return url;
  const pads = searchHtml.match(/href\.substr\(a\+(\d+)\+parseInt\(["'](\d+)["']\)\+b,1\)/i);
  const marker = url.toString().indexOf("url=");
  if (!pads || marker < 0) return url;
  const seed = Math.floor(Math.random() * 100) + 1;
  const offset = Number(pads[1]) + Number(pads[2]) + seed + marker;
  const hash = url.toString().charAt(offset);
  if (hash) {
    url.searchParams.set("k", String(seed));
    url.searchParams.set("h", hash);
  }
  return url;
}

function containsSearchDetailUrl(html: string) {
  return /douyin\.com\/(?:video|shipin)\/\d+|xiaohongshu\.com\/(?:explore|discovery\/item)\/|mp\.weixin\.qq\.com\/s\//i.test(html);
}

function containsSogouArticleList(html: string) {
  return /<ul\b[^>]*class=["'][^"']*news-list[^"']*["']/i.test(html) && /\/link\?url=/i.test(html);
}

function stripMarkup(input: string) { return input.replace(/<[^>]*>/g, " "); }

function extractCreatorProfileBio(html: string) {
  if (!html) return undefined;
  const candidates = [
    extractMetaContent(html, "description"),
    html.match(/"(?:signature|userDesc|user_desc|description)"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i)?.[1],
    html.match(/(?:个人简介|简介|签名)[：:]?\s*<[^>]*>([^<]{4,240})</i)?.[1],
  ];
  for (const candidate of candidates) {
    const text = cleanText(decodeHtml(String(candidate ?? "").replace(/\\n/g, " ").replace(/\\"/g, '"')));
    if (text.length >= 4 && !/登录|下载|小红书|抖音.*首页|服务条款/i.test(text)) return text;
  }
  return undefined;
}

function extractCreatorProfileStats(html: string, platform: ViralExample["platform"]) {
  if (!html) return {};
  const workFields = platform === "抖音"
    ? ["aweme_count", "awemeCount"]
    : platform === "小红书"
      ? ["note_count", "noteCount", "notes_count", "notesCount"]
      : [];
  const platformWorkCount = extractProfileInteger(html, workFields);
  const followerCount = extractProfileInteger(html, ["follower_count", "followerCount", "fans_count", "fansCount"]);
  const verified = /"(?:custom_verify|enterprise_verify_reason|verify_type|verified)"\s*:\s*(?:true|[1-9]\d*|"[^"\\]{1,80}")/i.test(html);
  return {
    ...(platformWorkCount ? { platformWorkCount } : {}),
    ...(followerCount ? { followerCount } : {}),
    ...(verified ? { isVerified: true } : {}),
  };
}

function extractProfileInteger(html: string, fields: string[]) {
  for (const field of fields) {
    const match = html.match(new RegExp(`"${field}"\\s*:\\s*"?(\\d{1,6})"?`, "i"));
    if (!match) continue;
    const value = Number(match[1]);
    // A six-digit ceiling prevents engagement totals being mistaken for works.
    if (Number.isSafeInteger(value) && value > 0 && value <= 100_000) return value;
  }
  return undefined;
}

function decodeHtml(input: string) {
  return input.replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

const cdpSearchQueues = new Map<string, Promise<unknown>>();
type CdpTarget = { id?: string; webSocketDebuggerUrl?: string; url?: string };
let douyinSearchTarget: CdpTarget | null = null;
let sogouSearchTarget: CdpTarget | null = null;

async function fetchSearchPageWithCdp(url: string) {
  const base = getSearchCdpBase(url);
  const current = cdpSearchQueues.get(base) ?? Promise.resolve();
  const queued = current.then(() => fetchSearchPageWithCdpUnlocked(url));
  cdpSearchQueues.set(base, queued.then(() => undefined, () => undefined));
  return queued;
}

async function fetchDouyinCreatorSearchPage(url: string) {
  const base = getSearchCdpBase(url);
  const current = cdpSearchQueues.get(base) ?? Promise.resolve();
  const queued = current.then(() => fetchSearchPageWithCdpUnlocked(url, true));
  cdpSearchQueues.set(base, queued.then(() => undefined, () => undefined));
  return queued;
}

async function fetchSearchPageWithCdpUnlocked(url: string, douyinCreatorMode = false) {
  const base = getSearchCdpBase(url);
  try {
    const douyinQuery = getDouyinSearchQuery(url);
    const xiaohongshuQuery = getXiaohongshuSearchQuery(url);
    const sogouQuery = getSogouSearchQuery(url);
    // Douyin treats rapid new pages as separate unverified sessions. Reuse one tab.
    const target = douyinQuery
      ? await getDouyinSearchTarget(base, url)
      : xiaohongshuQuery
        ? await getXiaohongshuSearchTarget(base)
        : sogouQuery
          ? await getSogouSearchTarget(base)
          : await createCdpTarget(base, url);
    if (!target?.webSocketDebuggerUrl) return null;
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    return await new Promise<string | null>((resolve) => {
      let settled = false;
      let commandId = 0;
      let htmlCommandId = 0;
      let htmlAttempts = 0;
      const finish = (value: string | null) => {
        if (settled) return;
        settled = true;
        socket.close();
        if (!douyinQuery && !xiaohongshuQuery && !sogouQuery && target.id) void fetch(`${base}/json/close/${target.id}`).catch(() => undefined);
        resolve(value);
      };
      const timer = setTimeout(() => finish(null), Number(process.env.VIRAL_SEARCH_BROWSER_TIMEOUT_MS ?? 12000));
      socket.addEventListener("open", () => {
        socket.send(JSON.stringify({ id: ++commandId, method: "Page.enable" }));
        if (douyinQuery && !douyinCreatorMode) {
          socket.send(JSON.stringify({ id: ++commandId, method: "Network.enable" }));
          // Opening a Douyin search URL alone does not execute its signed search request.
          setTimeout(() => socket.send(JSON.stringify({
            id: ++commandId,
            method: "Runtime.evaluate",
            params: { expression: buildDouyinSearchTrigger(douyinQuery), returnByValue: true },
          })), 2_000);
        }
        if (douyinQuery && douyinCreatorMode) {
          setTimeout(() => socket.send(JSON.stringify({
            id: ++commandId,
            method: "Runtime.evaluate",
            params: { expression: buildDouyinSearchTrigger(douyinQuery), returnByValue: true },
          })), 600);
          setTimeout(() => socket.send(JSON.stringify({
            id: ++commandId,
            method: "Runtime.evaluate",
            params: { expression: "[...document.querySelectorAll('span,div')].find((element) => element.children.length === 0 && element.textContent?.trim() === '用户')?.click()", returnByValue: true },
          })), 3_000);
        }
        if (xiaohongshuQuery) {
          // A direct search URL triggers security verification even with a
          // valid session. Search through the logged-in SPA instead.
          setTimeout(() => socket.send(JSON.stringify({
            id: ++commandId,
            method: "Runtime.evaluate",
            params: { expression: buildXiaohongshuSearchTrigger(xiaohongshuQuery), returnByValue: true },
          })), 600);
        }
        if (sogouQuery) {
          setTimeout(() => socket.send(JSON.stringify({
            id: ++commandId,
            method: "Page.navigate",
            params: { url },
          })), 600);
        }
        // Non-Douyin platforms are parsed from their completed search DOM.
        if (douyinQuery && !douyinCreatorMode) return;
        const requestRenderedHtml = () => {
          htmlAttempts += 1;
          htmlCommandId = ++commandId;
          socket.send(JSON.stringify({ id: htmlCommandId, method: "Runtime.evaluate", params: { expression: "document.documentElement.outerHTML", returnByValue: true } }));
        };
        setTimeout(requestRenderedHtml, douyinCreatorMode ? 6_000 : xiaohongshuQuery ? 5_500 : sogouQuery ? 5_000 : 4_500);
      });
      socket.addEventListener("message", (event) => {
        const message = JSON.parse(String(event.data)) as { id?: number; method?: string; params?: { requestId?: string; response?: { url?: string } }; result?: { result?: { value?: string }; body?: string } };
        if (douyinQuery && !douyinCreatorMode && message.method === "Network.responseReceived" && message.params?.response?.url?.includes("/general/search/stream/")) {
          setTimeout(() => socket.send(JSON.stringify({ id: ++commandId, method: "Network.getResponseBody", params: { requestId: message.params?.requestId } })), 400);
        }
        if (douyinQuery && !douyinCreatorMode && message.result?.body) { clearTimeout(timer); finish(message.result.body); return; }
        if (message.id === htmlCommandId && message.result?.result?.value) {
          const html = message.result.result.value;
          if (xiaohongshuQuery && !containsRenderedXiaohongshuCard(html) && htmlAttempts < 4) {
            setTimeout(() => {
              htmlAttempts += 1;
              htmlCommandId = ++commandId;
              socket.send(JSON.stringify({ id: htmlCommandId, method: "Runtime.evaluate", params: { expression: "document.documentElement.outerHTML", returnByValue: true } }));
            }, 1_500);
            return;
          }
          clearTimeout(timer);
          finish(html);
        }
      });
      socket.addEventListener("error", () => { clearTimeout(timer); finish(null); });
    });
  } catch { return null; }
}

function getSearchCdpBase(url: string) {
  try {
    const hostname = new URL(url).hostname;
    if (/(^|\.)xiaohongshu\.com$/i.test(hostname)) {
      return (process.env.VIRAL_XHS_CDP_URL ?? "http://127.0.0.1:9223").replace(/\/$/, "");
    }
    if (/(^|\.)weixin\.sogou\.com$/i.test(hostname)) {
      return (process.env.VIRAL_SOGOU_CDP_URL ?? "http://127.0.0.1:9225").replace(/\/$/, "");
    }
  } catch {
    // Fall through to the shared search browser.
  }
  return (process.env.VIRAL_SEARCH_CDP_URL ?? process.env.VIRAL_WECHAT_CDP_URL ?? "http://127.0.0.1:9222").replace(/\/$/, "");
}

async function createCdpTarget(base: string, url: string) {
  return fetch(`${base}/json/new?${encodeURIComponent(url)}`, {
    method: "PUT",
    signal: AbortSignal.timeout(2_000),
  }).then((response) => response.ok ? response.json() : null) as Promise<CdpTarget | null>;
}

async function getDouyinSearchTarget(base: string, url: string) {
  if (douyinSearchTarget?.webSocketDebuggerUrl) return douyinSearchTarget;
  douyinSearchTarget = await createCdpTarget(base, url);
  return douyinSearchTarget;
}

async function getXiaohongshuSearchTarget(base: string) {
  const targets = await fetch(`${base}/json/list`, { signal: AbortSignal.timeout(2_000) })
    .then((response) => response.ok ? response.json() : []) as CdpTarget[];
  const existing = targets.find((target) => target.webSocketDebuggerUrl
    && /xiaohongshu\.com\/(?:explore|search_result)/i.test(target.url ?? "")
    && !/website-login\/captcha/i.test(target.url ?? ""));
  return existing ?? createCdpTarget(base, "https://www.xiaohongshu.com/explore");
}

async function getSogouSearchTarget(base: string) {
  if (sogouSearchTarget?.webSocketDebuggerUrl) return sogouSearchTarget;
  const targets = await fetch(`${base}/json/list`, { signal: AbortSignal.timeout(2_000) })
    .then((response) => response.ok ? response.json() : []) as CdpTarget[];
  sogouSearchTarget = targets.find((target) => target.webSocketDebuggerUrl && /weixin\.sogou\.com/i.test(target.url ?? ""))
    ?? await createCdpTarget(base, "https://weixin.sogou.com/");
  return sogouSearchTarget;
}

function getDouyinSearchQuery(url: string) {
  try {
    const parsed = new URL(url);
    if (!/(^|\.)douyin\.com$/i.test(parsed.hostname) || !parsed.pathname.startsWith("/search/")) return null;
    return decodeURIComponent(parsed.pathname.slice("/search/".length)).trim() || null;
  } catch {
    return null;
  }
}

function getXiaohongshuSearchQuery(url: string) {
  try {
    const parsed = new URL(url);
    if (!/(^|\.)xiaohongshu\.com$/i.test(parsed.hostname) || !parsed.pathname.startsWith("/search_result")) return null;
    return parsed.searchParams.get("keyword")?.trim() || null;
  } catch {
    return null;
  }
}

function getSogouSearchQuery(url: string) {
  try {
    const parsed = new URL(url);
    if (!/(^|\.)weixin\.sogou\.com$/i.test(parsed.hostname)) return null;
    return parsed.searchParams.get("query")?.trim() || null;
  } catch {
    return null;
  }
}

function buildDouyinSearchTrigger(query: string) {
  return `(() => {
    const input = document.querySelector('input[placeholder*="搜索"]');
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, ${JSON.stringify(query)});
    input.dispatchEvent(new InputEvent("input", { bubbles: true, data: ${JSON.stringify(query)}, inputType: "insertText" }));
    input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter", code: "Enter", keyCode: 13, which: 13 }));
    input.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Enter", code: "Enter", keyCode: 13, which: 13 }));
    return true;
  })()`;
}

function buildXiaohongshuSearchTrigger(query: string) {
  return `(() => {
    const input = document.querySelector('input.search-input, input#search-input');
    const button = document.querySelector('.input-box .search-icon');
    if (!input || !button) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, ${JSON.stringify(query)});
    input.dispatchEvent(new InputEvent("input", { bubbles: true, data: ${JSON.stringify(query)}, inputType: "insertText" }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    button.click();
    return true;
  })()`;
}

export function isViralPlatformDetailUrl(input: string, platform: ViralExample["platform"]) {
  try {
    const url = new URL(input);
    if (platform === "抖音") return /(^|\.)douyin\.com$/i.test(url.hostname) && /\/(?:video|shipin|m\/video)\/\d+/i.test(url.pathname);
    if (platform === "小红书") return /(^|\.)xiaohongshu\.com$|(^|\.)xhslink\.com$/i.test(url.hostname) && /\/(?:explore|discovery\/item)\/[A-Za-z0-9_-]+/i.test(url.pathname);
    // Sogou resolves articles to both /s?... and /s/<legacy-path> forms.
    if (platform === "公众号") return /(^|\.)mp\.weixin\.qq\.com$/i.test(url.hostname) && /\/s(?:\/|$)/i.test(url.pathname);
    return /(^|\.)weixin\.qq\.com$|(^|\.)channels\.weixin\.qq\.com$/i.test(url.hostname)
      && (/\/(?:sph|channels|video|finder)\//i.test(url.pathname) || /\/finder-preview\/pages\/(?:feed|sph)$/i.test(url.pathname))
      && !/\/search/i.test(url.pathname);
  } catch {
    return false;
  }
}

function isPlatformDetailUrl(input: string, platform: ViralExample["platform"]) {
  return isViralPlatformDetailUrl(input, platform);
}

function isEligibleViralResult(result: Pick<NativeSearchResult["result"], "title" | "publishedAt">) {
  if (!isLikelyViralTitle(result.title)) return false;
  if (!result.publishedAt) return true;
  const publishedAt = new Date(result.publishedAt).getTime();
  if (!Number.isFinite(publishedAt)) return false;
  return publishedAt >= Date.now() - getContentMaxAgeDays() * 24 * 60 * 60 * 1000;
}

function getContentMaxAgeDays() {
  const configured = Number(process.env.VIRAL_EXAMPLES_MAX_CONTENT_AGE_DAYS ?? defaultContentMaxAgeDays);
  return Number.isFinite(configured) ? Math.min(Math.max(Math.floor(configured), 1), 90) : defaultContentMaxAgeDays;
}

function isLikelyViralTitle(title: string) {
  return !/服务条款|用户协议|隐私政策|违规内容|违规说明|认证服务|招聘|课程报名|平台公告|团队参与编写|下载中心|培训课程|脚本课|招商加盟|广告投放|营销方案/i.test(title);
}

async function fetchSourceMetadata(sourceUrl: string, platform: ViralExample["platform"]) {
  const douyinMetadata = platform === "抖音" && process.env.VIRAL_DOUYIN_METADATA_ENABLED !== "0"
    ? await inspectDouyinPublicMetadata(sourceUrl)
    : null;
  try {
    const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(4000), headers: { "user-agent": "Mozilla/5.0 (compatible; XiaoguViralBot/1.0)" } });
    if (!response.ok) return douyinMetadata ?? {};
    const html = (await response.text()).slice(0, 500_000);
    return {
      title: douyinMetadata?.title || extractMetaContent(html, "og:title") || extractTitleTag(html),
      authorName: douyinMetadata?.authorName || extractMetaContent(html, "author") || extractMetaContent(html, "article:author"),
      thumbnailUrl: douyinMetadata?.thumbnailUrl || extractMetaContent(html, "og:image") || extractMetaContent(html, "twitter:image"),
      publishedAt: douyinMetadata?.publishedAt,
      metricValue: douyinMetadata?.metricValue,
      sourceUrl: douyinMetadata?.sourceUrl,
    };
  } catch {
    return douyinMetadata ?? {};
  }
}

function extractMetaContent(html: string, property: string) {
  const escaped = property.replace(":", "\\:");
  const match = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, "i")) ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`, "i"));
  return match?.[1]?.replace(/&amp;/g, "&").trim() || undefined;
}

function cleanText(input: string) {
  return input.replace(/\s+/g, " ").trim().slice(0, 160);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function extractTitleTag(html: string) {
  return html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim();
}

function buildViralInsight(title: string, platform: ViralExample["platform"]) {
  if (/体检|结节|脂肪肝|尿酸|核保/.test(title)) return `${platform}用户对健康风险的关注度较高，适合拆成“异常是什么、可能影响什么、下一步准备什么”三段。`;
  if (/养老|父母|退休|现金流/.test(title)) return `${platform}用户更容易被家庭责任和现金流场景打动，适合换成一个真实家庭问题再展开。`;
  if (/理赔|医疗|医保|事故|暴雨|台风|车险/.test(title)) return `${platform}用户关心的是事情发生后怎么办，适合先讲具体场景，再讲保障边界和待核验信息。`;
  return `参考${platform}原作品的标题钩子和内容节奏，替换成你的客户场景、专业判断和可执行建议。`;
}
