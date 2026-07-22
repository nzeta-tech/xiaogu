import type {
  FactStatus,
  FactType,
  RightsBasis,
  RightsScope,
  ShortVideo,
  ShortVideoEvidence,
  ShortVideoFeed,
  ShortVideoMetric,
  ShortVideoPlatformAdapter,
  ShortVideoSort,
} from "./types";

export type ProviderItem = {
  id?: string;
  title?: string;
  platform?: string;
  platform_adapter?: ShortVideoPlatformAdapter;
  source_url?: string;
  source_title?: string;
  published_at?: string;
  metrics?: Partial<ShortVideoMetric> & { statistics_at?: string };
  themes?: string[];
  labels?: string[];
  authorized?: boolean;
  fact_status?: FactStatus;
  fact_type?: FactType;
  fact_claims?: string[];
  evidence?: ShortVideoEvidence[];
  jurisdiction?: string;
  effective_at?: string;
  reviewed_at?: string;
  reviewer_id?: string;
  rights_basis?: RightsBasis;
  rights_scope?: RightsScope;
  rights_expires_at?: string;
  attribution?: string;
  platform_policy_checked_at?: string;
  platform_deleted?: boolean;
  absolute_language?: boolean;
  sensitive_information?: boolean;
};

type CachedFeed = { items: ShortVideo[]; fetchedAt: string };
let cachedFeed: CachedFeed | null = null;
let lastProviderAttemptAt: number | null = null;

const MAX_CACHE_AGE_MS = 24 * 60 * 60 * 1000;
const PROVIDER_INTERVAL_MS = 15 * 60 * 1000;
const DEFAULT_LIMIT = 20;
const ABSOLUTE_LANGUAGE = /必赔|一定承保|保证收益|闭眼买|一定拒保|零风险|百分之百|绝对安全/;
const SENSITIVE_INFORMATION = /身份证|手机号|电话号码|微信号|住址|精确位置|病历号|银行卡|未成年人.*姓名/;

export async function getShortVideoFeed(input: {
  refresh?: boolean;
  theme?: string;
  platform?: string;
  sort?: ShortVideoSort;
  limit?: number;
} = {}): Promise<ShortVideoFeed> {
  const baseUrl = process.env.AUTHORIZED_SHORT_VIDEO_API_BASE?.trim();
  const now = new Date();
  let source: ShortVideoFeed["source"] = "authorized_provider";
  let degraded = false;
  let degradationReason: ShortVideoFeed["degradationReason"];
  const providerDue = lastProviderAttemptAt === null || now.getTime() - lastProviderAttemptAt > PROVIDER_INTERVAL_MS;

  if (baseUrl && providerDue) {
    lastProviderAttemptAt = now.getTime();
    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, "")}/short-videos`, {
        headers: { accept: "application/json" },
        cache: input.refresh ? "no-store" : undefined,
        next: input.refresh ? undefined : { revalidate: 900 },
      });
      if (!response.ok) throw new Error(`provider returned ${response.status}`);
      const payload = (await response.json()) as { data?: ProviderItem[] };
      // Authorization is a provider contract, not something Xiaogu infers from a public URL.
      const items = (payload.data ?? [])
        .map((item, index) => (item.authorized === true ? normalizeProviderItem(item, index) : null))
    .filter((item): item is ShortVideo => item !== null && isStructurallyEligible(item));
      if (items.length > 0) cachedFeed = { items, fetchedAt: now.toISOString() };
    } catch {
      degraded = true;
      degradationReason = "provider_unavailable";
    }
  } else if (!baseUrl) {
    degraded = true;
    degradationReason = "provider_not_configured";
  }

  if (!cachedFeed) {
    return { items: [], filteredCount: 0, fetchedAt: null, source: "none", degraded: true, degradationReason: degradationReason ?? "no_eligible_items" };
  }

  if (degraded || !baseUrl) source = "cache";
  const stale = now.getTime() - new Date(cachedFeed.fetchedAt).getTime() > MAX_CACHE_AGE_MS;
  const sortedItems = filterAndSortShortVideos(cachedFeed.items, input);
  const filteredCount = sortedItems.filter((item) => classifyShortVideo(item) === "filtered").length;
  const items = sortedItems
    .filter((item) => classifyShortVideo(item) !== "filtered")
    .map((item) => stale ? {
      ...item,
      availability: "stale" as const,
      compliance: { ...item.compliance, status: "pending_review" as const, publishable: false, reasons: [...item.compliance.reasons, "缓存已过期，需重新核验"] },
    } : item)
    .slice(0, clampLimit(input.limit));
  return {
    items,
    filteredCount,
    fetchedAt: cachedFeed.fetchedAt,
    source,
    degraded: degraded || stale || items.length === 0,
    degradationReason: degradationReason ?? (items.length === 0 ? "no_eligible_items" : undefined),
  };
}

export function normalizeProviderItem(item: ProviderItem, index = 0): ShortVideo {
  const fetchedAt = new Date().toISOString();
  const normalized: ShortVideo = {
    id: item.id?.trim() || `short-video-${index}-${encodeURIComponent(item.title?.trim() || "untitled").slice(0, 28)}`,
    title: item.title?.trim() || "未命名视频",
    platform: item.platform?.trim() || "unknown",
    platformAdapter: item.platform_adapter ?? inferPlatformAdapter(item.platform),
    sourceUrl: item.source_url?.trim() || "",
    sourceTitle: item.source_title?.trim() || undefined,
    publishedAt: parseDate(item.published_at),
    fetchedAt,
    metrics: normalizeMetrics(item.metrics),
    themes: cleanLabels(item.themes),
    labels: cleanLabels(item.labels),
    availability: "active",
    platformDeleted: item.platform_deleted === true,
    absoluteLanguage: item.absolute_language === true,
    sensitiveInformation: item.sensitive_information === true,
    factStatus: item.fact_status ?? "unverified",
    factType: item.fact_type ?? null,
    factClaims: cleanLabels(item.fact_claims),
    evidence: normalizeEvidence(item.evidence),
    jurisdiction: item.jurisdiction?.trim() || null,
    effectiveAt: parseDate(item.effective_at) ?? null,
    reviewedAt: parseDate(item.reviewed_at) ?? null,
    reviewerId: item.reviewer_id?.trim() || null,
    rightsExpiresAt: parseDate(item.rights_expires_at) ?? null,
    attribution: item.attribution?.trim() || null,
    platformPolicyCheckedAt: parseDate(item.platform_policy_checked_at) ?? null,
    compliance: { status: "pending_review", reasons: [], publishable: false, rightsBasis: item.rights_basis ?? null, rightsScope: item.rights_scope ?? null },
  };
  const status = classifyShortVideo(normalized, item);
  normalized.compliance = {
    status,
    reasons: policyReasons(normalized, item),
    publishable: status === "displayable",
    rightsBasis: normalized.compliance.rightsBasis,
    rightsScope: normalized.compliance.rightsScope,
  };
  return normalized;
}

export function classifyShortVideo(item: ShortVideo, raw?: Pick<ProviderItem, "absolute_language" | "sensitive_information">): ShortVideo["compliance"]["status"] {
  if (!isStructurallyEligible(item) || item.platformDeleted) return "filtered";
  if (item.factStatus === "rejected") return "filtered";
  if (item.absoluteLanguage || item.sensitiveInformation || raw?.absolute_language === true || raw?.sensitive_information === true || ABSOLUTE_LANGUAGE.test(`${item.title} ${item.factClaims.join(" ")}`) || SENSITIVE_INFORMATION.test(`${item.title} ${item.factClaims.join(" ")}`)) return "filtered";
  if (item.availability === "stale" || !item.evidence.length || !item.jurisdiction || !item.effectiveAt || !item.reviewedAt || !item.reviewerId || !item.factType || !item.factClaims.length || item.factStatus !== "human_verified") return "pending_review";
  return "displayable";
}

export function isStructurallyEligible(item: ShortVideo) {
  const rightsActive = !item.rightsExpiresAt || new Date(item.rightsExpiresAt).getTime() > Date.now();
  return Boolean(
    item.title && item.title !== "未命名视频" && /^https:\/\//i.test(item.sourceUrl) && item.platform !== "unknown" && platformAdapterMatches(item) &&
    item.metrics.statisticsAt && !Number.isNaN(Date.parse(item.metrics.statisticsAt)) && item.compliance.rightsBasis && item.compliance.rightsScope &&
      item.attribution && item.platformPolicyCheckedAt && rightsActive,
  );
}

function inferPlatformAdapter(platform?: string): ShortVideoPlatformAdapter {
  const value = platform?.trim().toLowerCase();
  if (value === "douyin" || value === "抖音") return "douyin_official";
  if (value === "wechat_channels" || value === "微信视频号") return "wechat_channels_official";
  if (value === "tiktok") return "tiktok_official";
  return "approved_other";
}

function platformAdapterMatches(item: ShortVideo) {
  const platform = item.platform.toLowerCase();
  if (platform === "douyin" || platform === "抖音") return item.platformAdapter === "douyin_official";
  if (platform === "wechat_channels" || platform === "微信视频号") return item.platformAdapter === "wechat_channels_official";
  if (platform === "tiktok") return item.platformAdapter === "tiktok_official";
  return item.platformAdapter === "approved_other";
}

export function filterAndSortShortVideos(items: ShortVideo[], input: { theme?: string; platform?: string; sort?: ShortVideoSort }) {
  const theme = input.theme?.trim().toLowerCase();
  const platform = input.platform?.trim().toLowerCase();
  const filtered = items.filter((item) => (!theme || item.themes.some((value) => value.toLowerCase() === theme)) && (!platform || item.platform.toLowerCase() === platform));
  return [...filtered].sort((a, b) => score(b, input.sort) - score(a, input.sort));
}

function policyReasons(item: ShortVideo, raw: ProviderItem) {
  const reasons: string[] = [];
  if (!item.evidence.length) reasons.push("缺少官方证据");
  if (!item.jurisdiction || !item.effectiveAt) reasons.push("缺少适用地区或生效时间");
  if (item.factStatus !== "human_verified" || !item.reviewedAt || !item.reviewerId) reasons.push("事实尚未完成人工核验");
  if (item.absoluteLanguage || raw.absolute_language === true || ABSOLUTE_LANGUAGE.test(`${item.title} ${item.factClaims.join(" ")}`)) reasons.push("含绝对化或承诺性话术");
  if (item.sensitiveInformation || raw.sensitive_information === true || SENSITIVE_INFORMATION.test(`${item.title} ${item.factClaims.join(" ")}`)) reasons.push("含敏感个人信息");
  if (!reasons.length) reasons.push("来源、权利、事实和平台策略已满足展示门禁");
  return reasons;
}

function score(item: ShortVideo, sort: ShortVideoSort = "relevance") {
  if (sort === "published_at") return dateValue(item.publishedAt);
  if (sort === "views") return item.metrics.views ?? 0;
  if (sort === "engagement") return (item.metrics.likes ?? 0) + (item.metrics.comments ?? 0) * 2 + (item.metrics.shares ?? 0) * 3;
  return (item.metrics.views ?? 0) + (item.metrics.shares ?? 0) * 3 + item.themes.length * 100;
}

function normalizeMetrics(metrics?: Partial<ShortVideoMetric> & { statistics_at?: string }): ShortVideoMetric {
  return {
    views: numberMetric(metrics?.views), likes: numberMetric(metrics?.likes), comments: numberMetric(metrics?.comments), shares: numberMetric(metrics?.shares),
    statisticsAt: parseDate(metrics?.statisticsAt ?? metrics?.statistics_at) ?? "",
  };
}

function normalizeEvidence(values?: ShortVideoEvidence[]) {
  return (values ?? []).map((value) => ({ ...value, officialUrl: value.officialUrl?.trim() ?? "", institution: value.institution?.trim() ?? "", excerpt: value.excerpt?.trim() ?? "", publishedAt: parseDate(value.publishedAt) })).filter((value) => /^https:\/\//i.test(value.officialUrl) && value.institution && value.excerpt && value.publishedAt);
}

function numberMetric(value?: number) { return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : undefined; }
function cleanLabels(values?: string[]) { return [...new Set((values ?? []).map((value) => value.trim()).filter((value) => value.length > 0 && value.length <= 200))].slice(0, 20); }
function parseDate(value?: string) { if (!value || Number.isNaN(Date.parse(value))) return undefined; return new Date(value).toISOString(); }
function dateValue(value?: string) { return value ? new Date(value).getTime() : 0; }
function clampLimit(value?: number) { return Math.min(Math.max(value ?? DEFAULT_LIMIT, 1), 50); }
