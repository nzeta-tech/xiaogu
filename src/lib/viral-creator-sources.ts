import type { ViralCreatorCandidate } from "./viral-examples";

type UnknownRecord = Record<string, unknown>;

export function parseQingshanCreatorPayload(payload: unknown): ViralCreatorCandidate[] {
  const payloads = Array.isArray(payload)
    ? payload
    : Array.isArray(recordValue(payload).responses)
      ? recordValue(payload).responses as unknown[]
      : null;
  if (payloads) {
    const combined = new Map<string, ViralCreatorCandidate>();
    payloads.flatMap((entry) => parseQingshanCreatorPayload(entry)).forEach((creator) => mergeCreator(combined, creator));
    return [...combined.values()];
  }
  const inputRoot = recordValue(payload);
  const root = unwrapPayload(payload);
  const grouped = recordValue(root.grouped_items);
  const filterMode = stringValue(root.filter_mode) || stringValue(inputRoot.filter_mode) || "popular";
  const items = [
    ...arrayValue(grouped.wechat_channels).map((item) => ({ item, platform: "视频号" as const })),
    ...arrayValue(grouped.wechat_official_account).map((item) => ({ item, platform: "公众号" as const })),
  ];
  const groupedCreators = new Map<string, ViralCreatorCandidate>();

  for (const entry of items) {
    const item = recordValue(entry.item);
    if (item.is_locked === true) continue;
    const creator = recordValue(item.creator);
    const displayName = firstString(item.author_name, creator.display_name, creator.nickname, creator.name);
    if (!displayName) continue;
    const evidenceUrl = firstString(item.url, item.source_url, item.original_url);
    const creatorKey = firstString(
      creator.platform_creator_key,
      creator.username,
      creator.fakeid,
      creator.id,
      item.author_id,
      extractWechatBiz(evidenceUrl),
    ) || normalizeCreatorKey(displayName);
    const candidate: ViralCreatorCandidate = {
      platform: entry.platform,
      creatorKey,
      displayName,
      profileUrl: firstString(creator.profile_url, creator.home_url, creator.url) || undefined,
      discoveryQuery: `青山AI:${filterMode}`,
      sourceKind: "qingshan_popular",
      evidenceTitle: firstString(item.title, item.description) || undefined,
      evidenceUrl: evidenceUrl || undefined,
      followerCount: positiveInteger(creator.follower_count, creator.followers, item.follower_count),
      platformWorkCount: positiveInteger(creator.work_count, creator.item_count, creator.article_count),
      isVerified: booleanValue(creator.is_verified, creator.verified),
      bio: firstString(creator.description, creator.signature, creator.bio) || undefined,
    };
    mergeCreator(groupedCreators, candidate);
  }
  return [...groupedCreators.values()];
}

export function parseSogouAccountResults(html: string, query: string): ViralCreatorCandidate[] {
  if (!html || /\/antispider\/|请依次点击|协助验证/.test(html)) return [];
  const results = new Map<string, ViralCreatorCandidate>();
  const rows = html.match(/<li\b[^>]*(?:sogou_vr_11002301|news-list2)[^>]*>[\s\S]*?<\/li>/gi)
    ?? html.match(/<li\b[^>]*>[\s\S]*?<\/li>/gi)
    ?? [];

  for (const row of rows) {
    const titleBlock = row.match(/<p\b[^>]*class=["'][^"']*\btit\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/i)?.[1]
      ?? row.match(/<h3\b[^>]*>([\s\S]*?)<\/h3>/i)?.[1];
    const displayName = cleanText(titleBlock ?? "");
    if (!displayName) continue;
    const alias = cleanText(row.match(/(?:微信号|微信帐号|微信账号)[：:]?\s*<[^>]*>([\s\S]*?)<\/[^>]+>/i)?.[1] ?? "");
    const href = titleBlock?.match(/<a\b[^>]*href=["']([^"']+)["']/i)?.[1]
      ?? row.match(/<a\b[^>]*href=["']([^"']+)["'][^>]*>[\s\S]*?微信号/i)?.[1];
    const profileUrl = absoluteSogouUrl(href);
    const bio = cleanText(row.match(/功能介绍[：:]?\s*<[^>]*>([\s\S]*?)<\/[^>]+>/i)?.[1] ?? "");
    const verification = cleanText(row.match(/微信认证[：:]?\s*<[^>]*>([\s\S]*?)<\/[^>]+>/i)?.[1] ?? "");
    const creatorKey = alias || extractWechatBiz(profileUrl) || normalizeCreatorKey(displayName);
    mergeCreator(results, {
      platform: "公众号",
      creatorKey,
      displayName,
      profileUrl: profileUrl || undefined,
      discoveryQuery: query,
      sourceKind: "account_search",
      evidenceTitle: bio || verification || displayName,
      evidenceUrl: profileUrl || undefined,
      isVerified: Boolean(verification),
      bio: [bio, verification].filter(Boolean).join("；") || undefined,
    });
  }
  return [...results.values()];
}

function unwrapPayload(payload: unknown) {
  let current = recordValue(payload);
  for (let depth = 0; depth < 3 && !recordValue(current.grouped_items).wechat_channels; depth += 1) {
    const nested = recordValue(current.data);
    if (Object.keys(nested).length === 0) break;
    current = nested;
  }
  return current;
}

function mergeCreator(target: Map<string, ViralCreatorCandidate>, candidate: ViralCreatorCandidate) {
  const key = `${candidate.platform}:${candidate.creatorKey}`;
  const evidence = candidate.evidence?.length
    ? candidate.evidence
    : [{ query: candidate.discoveryQuery ?? "", title: candidate.evidenceTitle, url: candidate.evidenceUrl }];
  const existing = target.get(key);
  if (!existing) {
    target.set(key, { ...candidate, evidenceCount: candidate.evidenceCount ?? evidence.length, evidence });
    return;
  }
  target.set(key, {
    ...existing,
    profileUrl: existing.profileUrl ?? candidate.profileUrl,
    bio: existing.bio ?? candidate.bio,
    evidenceCount: (existing.evidenceCount ?? 1) + (candidate.evidenceCount ?? evidence.length),
    evidence: [...(existing.evidence ?? []), ...evidence],
    followerCount: Math.max(existing.followerCount ?? 0, candidate.followerCount ?? 0) || undefined,
    platformWorkCount: Math.max(existing.platformWorkCount ?? 0, candidate.platformWorkCount ?? 0) || undefined,
    isVerified: Boolean(existing.isVerified || candidate.isVerified),
  });
}

function recordValue(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
}

function arrayValue(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    const text = stringValue(value);
    if (text) return text;
  }
  return "";
}

function positiveInteger(...values: unknown[]) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return Math.round(number);
  }
  return undefined;
}

function booleanValue(...values: unknown[]) {
  return values.some((value) => value === true || value === 1 || value === "1" || value === "true");
}

function cleanText(input: string) {
  return decodeHtml(input.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function decodeHtml(input: string) {
  return input.replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

function absoluteSogouUrl(input?: string) {
  if (!input) return "";
  try { return new URL(decodeHtml(input), "https://weixin.sogou.com").toString(); } catch { return ""; }
}

function extractWechatBiz(input?: string) {
  if (!input) return "";
  try { return new URL(decodeHtml(input)).searchParams.get("__biz")?.trim() ?? ""; } catch { return ""; }
}

function normalizeCreatorKey(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "").slice(0, 200) || value.slice(0, 200);
}
