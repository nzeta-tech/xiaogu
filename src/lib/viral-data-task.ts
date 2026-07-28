import type { PoolClient } from "pg";
import { createHash } from "node:crypto";
import { getPool } from "@/lib/db/client";
import { canonicalizeViralSourceUrl, discoverPlatformViralData, discoverPlatformViralExamples } from "@/lib/viral-examples";
import { completeViralDataRunWithoutChanges, createViralDataRun, failViralDataRun, getLatestViralDataRun, listTopDouyinDeepVerificationCandidates, publishViralDataRun, recordViralDiscovery } from "@/lib/viral-data-repository";
import { enqueueLocalAgentTask, isDouyinDeepVerificationAvailable } from "@/lib/local-agent/repository";
import { buildViralSourceIdentity, isInsuranceFinanceRelevant } from "@/lib/viral-scoring";

const viralPreparationLockId = 2_023_072_600;
const defaultIntervalMs = 6 * 60 * 60 * 1000;

export async function runViralDataPreparation(options: { force?: boolean; trigger?: string } = {}) {
  const trigger = options.trigger?.trim().slice(0, 80) || "scheduled";
  if (!options.force) {
    const latest = await getLatestViralDataRun("succeeded");
    if (latest?.completed_at && Date.parse(latest.completed_at) > Date.now() - preparationIntervalMs()) {
      return { started: false as const, reason: "fresh" as const, runId: latest.id };
    }
  }

  let lockClient: PoolClient | null = null;
  let locked = false;
  let runId: string | null = null;
  try {
    lockClient = await getPool().connect();
    const lock = await lockClient.query<{ locked: boolean }>("select pg_try_advisory_lock($1) as locked", [viralPreparationLockId]);
    locked = lock.rows[0]?.locked ?? false;
    if (!locked) return { started: false as const, reason: "in_progress" as const };

    const run = await createViralDataRun(trigger);
    runId = run.id;
    const discovery = await discoverPlatformViralData({ refresh: true });
    const prepared = deduplicatePreparedItems(discovery.items);
    const publishedSourceUrls = new Set(prepared.map(({ item }) => `${item.platform}:${canonicalizeViralSourceUrl(item.sourceUrl)}`));
    await recordViralDiscovery({ runId, creators: discovery.creators, candidates: discovery.candidates, publishedSourceUrls });
    if (discovery.candidates.length === 0) {
      await failViralDataRun(runId, "No platform work candidates were discovered", { discoveredCount: 0, creatorDiscoveredCount: discovery.creators.length });
      return { started: true as const, succeeded: false as const, runId, reason: "empty" as const };
    }

    if (prepared.length === 0) {
      const publishedCount = await completeViralDataRunWithoutChanges(runId, discovery.candidates.length, { reason: "no_relevant_items", creatorDiscoveredCount: discovery.creators.length });
      return {
        started: true as const,
        succeeded: true as const,
        runId,
        reason: "no_relevant_items" as const,
        discoveredCount: discovery.candidates.length,
        creatorDiscoveredCount: discovery.creators.length,
        eligibleCount: 0,
        publishedCount,
      };
    }

    const evaluatedPlatforms = [...new Set(discovery.candidates.map((item) => item.platform))];
    const published = await publishViralDataRun(runId, prepared, evaluatedPlatforms, discovery.candidates.length);
    const deepVerificationQueued = await queueTopDouyinDeepVerifications(runId);
    return {
      started: true as const,
      succeeded: true as const,
      runId,
      discoveredCount: discovery.candidates.length,
      creatorDiscoveredCount: discovery.creators.length,
      eligibleCount: prepared.length,
      deepVerificationQueued,
      ...published,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown viral data preparation failure";
    if (runId) await failViralDataRun(runId, message).catch(() => undefined);
    return { started: Boolean(runId), succeeded: false as const, runId, reason: "failed" as const, error: message };
  } finally {
    if (lockClient && locked) await lockClient.query("select pg_advisory_unlock($1)", [viralPreparationLockId]).catch(() => undefined);
    lockClient?.release();
  }
}

async function queueTopDouyinDeepVerifications(runId: string) {
  if (!await isDouyinDeepVerificationAvailable()) return 0;
  const configured = Number(process.env.VIRAL_DOUYIN_DEEP_VERIFY_LIMIT ?? 3);
  const candidates = await listTopDouyinDeepVerificationCandidates(runId, Number.isFinite(configured) ? configured : 3);
  await Promise.all(candidates.map((candidate, index) => enqueueLocalAgentTask({
    taskType: "douyin.deep_verify",
    payload: { workId: candidate.work_id, url: candidate.source_url },
    dedupeKey: candidate.work_id,
    priority: 80 - index,
    maxAttempts: 1,
  })));
  return candidates.length;
}

export function deduplicatePreparedItems(items: Awaited<ReturnType<typeof discoverPlatformViralExamples>>) {
  const seen = new Set<string>();
  const perPlatform = new Map<string, number>();
  return items
    .filter((item) => isInsuranceFinanceRelevant(item))
    .map((item) => {
      const canonicalUrl = canonicalizeViralSourceUrl(item.sourceUrl);
      const identity = buildViralSourceIdentity({ platform: item.platform, title: item.title, authorName: item.authorName, canonicalUrl });
      return { item, identity, automaticKey: createHash("sha256").update(identity).digest("hex") };
    })
    .filter(({ item, identity }) => {
      const count = perPlatform.get(item.platform) ?? 0;
      if (!identity || seen.has(identity) || count >= 3) return false;
      seen.add(identity);
      perPlatform.set(item.platform, count + 1);
      return true;
    })
    .map(({ item, automaticKey }) => ({ item, automaticKey }));
}

function preparationIntervalMs() {
  const configured = Number(process.env.VIRAL_PREPARATION_INTERVAL_MS ?? process.env.VIRAL_EXAMPLES_REFRESH_INTERVAL_MS ?? defaultIntervalMs);
  return Number.isFinite(configured) ? Math.min(Math.max(configured, 60 * 60 * 1000), 24 * 60 * 60 * 1000) : defaultIntervalMs;
}
