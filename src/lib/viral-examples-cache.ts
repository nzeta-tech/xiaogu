import { getPool } from "@/lib/db/client";
import { tryGetViralExampleCache, trySaveViralExampleCache } from "@/lib/db/repositories";
import { canonicalizeViralSourceUrl, discoverPlatformViralExamples, enrichViralExampleMetadata, isViralPlatformDetailUrl } from "@/lib/viral-examples";
import type { ViralExample } from "@/lib/viral-examples";
import type { PoolClient } from "pg";

const viralRefreshLockId = 2_018_072_500;
const configuredRefreshIntervalMs = Number(process.env.VIRAL_EXAMPLES_REFRESH_INTERVAL_MS ?? 6 * 60 * 60 * 1000);
const refreshIntervalMs = Number.isFinite(configuredRefreshIntervalMs)
  ? Math.min(Math.max(configuredRefreshIntervalMs, 60 * 60 * 1000), 24 * 60 * 60 * 1000)
  : 6 * 60 * 60 * 1000;

export async function refreshViralExamples(options: { force?: boolean } = {}) {
  const cached = await tryGetViralExampleCache();
  if (!options.force && cached?.items && hasFreshNativeSearchCache(cached.items, cached.fetched_at)) {
    return { refreshed: false as const, reason: "fresh" as const };
  }

  let client: PoolClient | null = null;
  let locked = false;
  try {
    client = await getPool().connect();
    const lock = await client.query<{ locked: boolean }>("select pg_try_advisory_lock($1) as locked", [viralRefreshLockId]);
    locked = lock.rows[0]?.locked ?? false;
    if (!locked) return { refreshed: false as const, reason: "in_progress" as const };

    if (!options.force) {
      const rechecked = await tryGetViralExampleCache();
      if (rechecked?.items && hasFreshNativeSearchCache(rechecked.items, rechecked.fetched_at)) {
        return { refreshed: false as const, reason: "fresh" as const };
      }
    }

    // Legacy caches can contain Video Channels policy/dashboard links. Sanitize
    // retained rows on every refresh so a platform that returns no replacement
    // cannot keep reporting those links as collected works.
    const rawPrevious = Array.isArray(cached?.items) ? cached.items : [];
    const previous = rawPrevious.filter(isValidCachedItem) as ViralExample[];
    const [items, enrichedPrevious] = await Promise.all([
      discoverPlatformViralExamples({ refresh: true }),
      enrichViralExampleMetadata(previous),
    ]);
    const coverage = items.reduce<Record<string, number>>((counts, item) => {
      counts[item.platform] = (counts[item.platform] ?? 0) + 1;
      return counts;
    }, {});
    console.info("[viral-examples] refresh discovery completed", { itemCount: items.length, coverage });
    if (items.length === 0) {
      const preserved = limitAndDeduplicateCache(enrichedPrevious);
      if (preserved.length === 0) return { refreshed: false as const, reason: "empty" as const };
      const saved = await trySaveViralExampleCache(preserved);
      return saved ? { refreshed: true as const, itemCount: preserved.length } : { refreshed: false as const, reason: "save_failed" as const };
    }
    const refreshedPlatforms = new Set<string>(items.map((item) => item.platform));
    // Keep a platform's previous result until that platform has produced a replacement.
    const retained = enrichedPrevious.filter((item) => !refreshedPlatforms.has(item.platform));
    const saved = await trySaveViralExampleCache(limitAndDeduplicateCache([...retained, ...items]));
    return saved ? { refreshed: true as const, itemCount: items.length } : { refreshed: false as const, reason: "save_failed" as const };
  } catch (error) {
    console.error("[viral-examples] refresh failed", error);
    return { refreshed: false as const, reason: "failed" as const, error: error instanceof Error ? error.message : "unknown" };
  } finally {
    if (client && locked) await client.query("select pg_advisory_unlock($1)", [viralRefreshLockId]).catch(() => undefined);
    client?.release();
  }
}

function limitAndDeduplicateCache(items: Array<{ platform?: string; sourceUrl?: string; title?: string }>) {
  const perPlatform = new Map<string, number>();
  const seen = new Set<string>();
  return items.filter((item) => {
    if (!isValidCachedItem(item)) return false;
    const sourceUrl = item.sourceUrl as string;
    const platform = item.platform as string;
    const title = item.title as string;
    const key = canonicalizeViralSourceUrl(sourceUrl) || `${platform}:${title.replace(/\s+/g, "").toLowerCase()}`;
    const count = perPlatform.get(platform) ?? 0;
    if (seen.has(key) || count >= 3) return false;
    seen.add(key);
    perPlatform.set(platform, count + 1);
    return true;
  });
}

function isValidCachedItem(item: { platform?: string; sourceUrl?: string; title?: string; thumbnailUrl?: string }) {
  const isPlaceholder = item.platform === "小红书"
    && (/· 小红书作品$/.test(item.title ?? "") || /picasso-static\.xiaohongshu\.com\/fe-platform\//i.test(item.thumbnailUrl ?? ""));
  return Boolean(!isPlaceholder && item.platform && item.sourceUrl && item.title
    && ["抖音", "视频号", "公众号", "小红书"].includes(item.platform)
    && isViralPlatformDetailUrl(item.sourceUrl, item.platform as "抖音" | "视频号" | "公众号" | "小红书"));
}

function hasNativeSearchMarker(items: unknown) {
  return Array.isArray(items) && items.some((item) => item && typeof item === "object" && Array.isArray((item as { tags?: unknown }).tags) && (item as { tags: unknown[] }).tags.some((tag) => tag === "平台搜索" || tag === "实时搜索"));
}

function hasFreshNativeSearchCache(items: unknown, fetchedAt: string) {
  if (!hasNativeSearchMarker(items) || new Date(fetchedAt).getTime() <= Date.now() - refreshIntervalMs || !Array.isArray(items)) return false;
  return items.every((item) => {
    if (!item || typeof item !== "object") return false;
    const itemFetchedAt = (item as { fetchedAt?: unknown }).fetchedAt;
    return typeof itemFetchedAt === "string" && new Date(itemFetchedAt).getTime() > Date.now() - refreshIntervalMs;
  });
}

export async function refreshViralExamplesIfStale() {
  return refreshViralExamples();
}

let schedulerStarted = false;

export function startViralExampleScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;
  void refreshViralExamples({ force: true }).catch(() => undefined);

  const scheduleNextMidnight = () => {
    const now = new Date();
    const next = new Date(now);
    next.setHours(24, 0, 0, 0);
    const delay = Math.max(next.getTime() - now.getTime(), 1_000);
    setTimeout(() => {
      void refreshViralExamples({ force: true }).finally(scheduleNextMidnight);
    }, delay);
  };
  scheduleNextMidnight();
}
