import type { ViralExample } from "./viral-examples";

export function parseValuefocusDouyinPayload(input: unknown): ViralExample[] {
  const payload = asRecord(input);
  const videos = Array.isArray(payload.videos) ? payload.videos : [];
  const fetchedAt = stringValue(payload.asOf) || new Date().toISOString();
  return videos.slice(0, 100).flatMap((raw, index) => {
    const video = asRecord(raw);
    const sourceUrl = stringValue(video.url);
    const description = cleanText(stringValue(video.desc));
    if (!sourceUrl || !description || !isDouyinDetailUrl(sourceUrl)) return [];
    const heat = numericValue(video.heat);
    const authorName = cleanText(stringValue(video.author));
    return [{
      id: `valuefocus-douyin-${stringValue(video.id) || index}`,
      title: description,
      platform: "抖音" as const,
      type: "短视频" as const,
      sourceUrl,
      sourceTitle: "Valuefocus 抖音财经趋势",
      authorName: authorName || undefined,
      authorKey: stringValue(video.handle) || undefined,
      fetchedAt,
      metricLabel: "综合互动",
      metricValue: heat || undefined,
      metricUnit: "互动量",
      category: "财经",
      contentType: "Valuefocus 财经爆款",
      tags: ["财经", "财经爆款", "Valuefocus"],
      insight: `来自 Valuefocus 财经作品榜，综合互动 ${heat.toLocaleString("zh-CN")}。可拆解观点、案例与表达结构；不构成投资建议。`,
      status: "needs-review" as const,
      statusNote: "来源：Valuefocus 抖音财经趋势。发布前请核验内容合规，避免荐股、带单与收益承诺。",
      rawData: { source: "valuefocus", likes: numericValue(video.likes), comments: numericValue(video.comments), shares: numericValue(video.shares), collects: numericValue(video.collects), sentiment: stringValue(video.sentiment) },
    } satisfies ViralExample];
  });
}

export function parseTopHubDouyinRankingHtml(html: string): ViralExample[] {
  const items: ViralExample[] = [];
  const seen = new Set<string>();
  const rowPattern = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  for (const row of html.matchAll(rowPattern)) {
    const markup = row[1];
    const match = markup.match(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!match) continue;
    const sourceUrl = decodeHtml(match[1]).trim();
    const title = cleanText(stripMarkup(decodeHtml(match[2])));
    if (!sourceUrl || !title || seen.has(sourceUrl) || !isDouyinDetailUrl(sourceUrl)) continue;
    seen.add(sourceUrl);
    const authorName = cleanText(stripMarkup(decodeHtml(markup.match(/<div\b[^>]*class=["'][^"']*item-desc[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? "")));
    const playText = cleanText(stripMarkup(decodeHtml(markup.match(/<div\b[^>]*class=["'][^"']*item-extra[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? "")));
    const thumbnailUrl = decodeHtml(markup.match(/<img\b[^>]*src=["']([^"']+)["']/i)?.[1] ?? "").trim();
    const playCount = parseChineseMetric(playText.replace(/次播放/g, ""));
    items.push({
      id: `tophub-douyin-${items.length}-${encodeURIComponent(title).slice(0, 20)}`,
      title,
      platform: "抖音",
      type: "短视频",
      sourceUrl,
      sourceTitle: "TopHub 抖音财经榜",
      authorName: authorName || undefined,
      thumbnailUrl: thumbnailUrl || undefined,
      fetchedAt: new Date().toISOString(),
      metricLabel: "播放量",
      metricValue: playCount || undefined,
      metricUnit: "次播放",
      category: "财经",
      contentType: "TopHub 财经爆款",
      tags: ["财经", "财经爆款", "TopHub"],
      insight: `来自 TopHub 抖音财经榜${playCount ? `，播放 ${playCount.toLocaleString("zh-CN")}` : ""}。可拆解热点、标题钩子与表达结构。`,
      status: "needs-review",
      statusNote: "来源：TopHub 抖音财经榜。发布前请核验原视频仍可访问及内容合规。",
      rawData: { source: "tophub", rank: items.length + 1, playCount },
    });
    if (items.length >= 100) break;
  }
  return items;
}

function isDouyinDetailUrl(input: string) {
  try {
    const url = new URL(input);
    return /(^|\.)douyin\.com$/i.test(url.hostname) && /\/(?:video|note)\/\d+/i.test(url.pathname);
  } catch {
    return false;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numericValue(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseChineseMetric(value: string) {
  const match = value.replace(/,/g, "").match(/([\d.]+)\s*(万|亿)?/);
  if (!match) return 0;
  const multiplier = match[2] === "亿" ? 100_000_000 : match[2] === "万" ? 10_000 : 1;
  return Math.round(Number(match[1]) * multiplier);
}

function cleanText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function stripMarkup(value: string) {
  return value.replace(/<[^>]+>/g, " ");
}

function decodeHtml(value: string) {
  return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}
