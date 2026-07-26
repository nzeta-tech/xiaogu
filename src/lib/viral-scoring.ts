export type ViralScoreInput = {
  metricValue?: number;
  previousMetricValue?: number;
  creatorMedianMetric?: number;
  publishedAt?: string;
  fetchedAt: string;
  hasAuthor: boolean;
  hasThumbnail: boolean;
  hasDetailUrl: boolean;
};

export type ViralScoreBreakdown = {
  total: number;
  relativePerformance: number;
  growthVelocity: number;
  engagementQuality: number;
  freshness: number;
  dataConfidence: number;
};

const insuranceFinancePattern = /保险|理赔|投保|保单|核保|健康告知|重疾(?:险)?|医疗险|寿险|年金险|车险|意外险|养老金|养老规划|退休金|资产配置|家庭保障|财务规划|社保|医保/;

export function isInsuranceFinanceRelevant(input: { title: string; category?: string; tags?: string[] }) {
  return insuranceFinancePattern.test(`${input.title} ${input.category ?? ""} ${(input.tags ?? []).join(" ")}`);
}

export function calculateCreatorQuality(input: {
  displayName: string;
  discoveryQuery?: string;
  evidenceCount?: number;
  hasProfile: boolean;
  followerCount?: number;
  platformWorkCount?: number;
  isVerified?: boolean;
}) {
  const topicText = `${input.displayName} ${input.discoveryQuery ?? ""}`;
  const topicMatches = topicText.match(/保险|理赔|医疗|重疾|寿险|养老|年金|保障|资产|理财|基金|财务|退休/g)?.length ?? 0;
  const relevance = clamp(45 + topicMatches * 12, 0, 100);
  const evidence = clamp(Math.log2(Math.max(1, input.evidenceCount ?? 1) + 1) * 22, 0, 100);
  const authority = clamp(
    (input.isVerified ? 30 : 0)
      + Math.log10(Math.max(0, input.followerCount ?? 0) + 1) * 10
      + Math.log10(Math.max(0, input.platformWorkCount ?? 0) + 1) * 8,
    0,
    100,
  );
  const completeness = input.hasProfile ? 100 : 35;
  return {
    total: round(relevance * 0.45 + evidence * 0.20 + authority * 0.20 + completeness * 0.15),
    relevance: round(relevance),
    evidence: round(evidence),
    authority: round(authority),
    completeness: round(completeness),
  };
}

export function buildViralSourceIdentity(input: { platform: string; title: string; authorName?: string; canonicalUrl: string }) {
  if (input.platform !== "公众号") return input.canonicalUrl;
  try {
    const url = new URL(input.canonicalUrl);
    if (!/(^|\.)mp\.weixin\.qq\.com$/i.test(url.hostname) || !/^\/s(?:\/|$)/.test(url.pathname)) return input.canonicalUrl;
    const stableParams = ["__biz", "mid", "idx", "sn"]
      .map((key) => [key, url.searchParams.get(key)] as const)
      .filter((entry): entry is readonly [string, string] => Boolean(entry[1]));
    if (stableParams.length > 0) {
      const stable = new URL("https://mp.weixin.qq.com/s");
      stableParams.forEach(([key, value]) => stable.searchParams.set(key, value));
      return stable.toString();
    }
  } catch {
    // Fall through to a content identity when the temporary URL is malformed.
  }
  const normalize = (value: string) => value.normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
  return `公众号:${normalize(input.authorName ?? "未知作者")}:${normalize(input.title)}`;
}

export function calculateViralScore(input: ViralScoreInput): ViralScoreBreakdown {
  const metric = nonNegative(input.metricValue);
  const previous = nonNegative(input.previousMetricValue);
  const median = nonNegative(input.creatorMedianMetric);

  const relativePerformance = median > 0
    ? clamp((metric / median) * 50, 0, 100)
    : metric > 0 ? 45 : 15;
  const growthVelocity = previous > 0
    ? clamp(((metric - previous) / previous) * 50, 0, 100)
    : metric > 0 ? 35 : 10;
  const engagementQuality = metric > 0
    ? clamp(Math.log10(metric + 1) * 20, 0, 100)
    : 10;

  const referenceTime = Date.parse(input.publishedAt ?? input.fetchedAt);
  const ageDays = Number.isFinite(referenceTime) ? Math.max(0, (Date.now() - referenceTime) / 86_400_000) : 30;
  const freshness = clamp(100 * Math.exp(-ageDays / 14), 0, 100);
  const dataConfidence = clamp(
    25
      + (input.hasDetailUrl ? 25 : 0)
      + (input.hasAuthor ? 20 : 0)
      + (input.hasThumbnail ? 10 : 0)
      + (input.metricValue !== undefined ? 20 : 0),
    0,
    100,
  );

  return {
    total: round(
      relativePerformance * 0.30
        + growthVelocity * 0.25
        + engagementQuality * 0.20
        + freshness * 0.15
        + dataConfidence * 0.10,
    ),
    relativePerformance: round(relativePerformance),
    growthVelocity: round(growthVelocity),
    engagementQuality: round(engagementQuality),
    freshness: round(freshness),
    dataConfidence: round(dataConfidence),
  };
}

function nonNegative(value?: number) {
  return Number.isFinite(value) ? Math.max(0, value ?? 0) : 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}
