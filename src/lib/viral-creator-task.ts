import type { PoolClient } from "pg";
import { getPool, query } from "@/lib/db/client";
import { discoverViralCreatorsAtScale, type ViralCreatorCandidate } from "@/lib/viral-examples";
import { calculateCreatorQuality } from "@/lib/viral-scoring";

const creatorDiscoveryLockId = 2_025_072_601;
const defaultIntervalMs = 24 * 60 * 60 * 1000;

export async function runViralCreatorDiscovery(options: { force?: boolean; trigger?: string } = {}) {
  await query(
    `update viral_creator_discovery_runs set status='failed',completed_at=now(),
       error_message=coalesce(error_message,'Creator discovery process was interrupted')
     where status='running' and started_at < now()-interval '10 minutes'`,
  );
  if (!options.force) {
    const latest = await query<{ id: string; completed_at: string }>(
      `select id, completed_at from viral_creator_discovery_runs
       where status='succeeded' order by started_at desc limit 1`,
    );
    const completedAt = latest.rows[0]?.completed_at;
    if (completedAt && Date.parse(completedAt) > Date.now() - discoveryIntervalMs()) {
      return { started: false as const, reason: "fresh" as const, runId: latest.rows[0].id };
    }
  }

  let lockClient: PoolClient | null = null;
  let locked = false;
  let runId: string | null = null;
  try {
    lockClient = await getPool().connect();
    const lock = await lockClient.query<{ locked: boolean }>("select pg_try_advisory_lock($1) locked", [creatorDiscoveryLockId]);
    locked = lock.rows[0]?.locked ?? false;
    if (!locked) return { started: false as const, reason: "in_progress" as const };

    const targetPerPlatform = boundedInteger(process.env.VIRAL_CREATOR_TARGET_PER_PLATFORM, 100, 10, 500);
    const run = await query<{ id: string }>(
      `insert into viral_creator_discovery_runs(trigger_type,target_per_platform)
       values($1,$2) returning id`,
      [options.trigger?.trim().slice(0, 80) || "scheduled", targetPerPlatform],
    );
    runId = run.rows[0].id;
    const discovery = await discoverViralCreatorsAtScale({ refresh: true, targetPerPlatform });
    const upsertedCount = await persistCreatorDiscovery(runId, discovery.creators);
    const coverage = Object.fromEntries(discovery.diagnostics.map((item) => [item.platform, item.creatorCount]));
    const gaps = discovery.diagnostics.filter((item) => item.creatorCount < targetPerPlatform)
      .map((item) => ({ platform: item.platform, actual: item.creatorCount, target: targetPerPlatform, errors: item.errors }));
    await query(
      `update viral_creator_discovery_runs set status='succeeded',completed_at=now(),
         discovered_count=$2,upserted_count=$3,diagnostics=$4::jsonb where id=$1`,
      [runId, discovery.creators.length, upsertedCount, JSON.stringify({ coverage, gaps, platforms: discovery.diagnostics })],
    );
    return { started: true as const, succeeded: true as const, runId, discoveredCount: discovery.creators.length, upsertedCount, targetPerPlatform, coverage, gaps };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown creator discovery failure";
    if (runId) {
      await query(
        `update viral_creator_discovery_runs set status='failed',completed_at=now(),error_message=$2 where id=$1`,
        [runId, message.slice(0, 2000)],
      ).catch(() => undefined);
    }
    return { started: Boolean(runId), succeeded: false as const, runId, reason: "failed" as const, error: message };
  } finally {
    if (lockClient && locked) await lockClient.query("select pg_advisory_unlock($1)", [creatorDiscoveryLockId]).catch(() => undefined);
    lockClient?.release();
  }
}

export async function persistCreatorDiscovery(runId: string, creators: ViralCreatorCandidate[]) {
  const client = await getPool().connect();
  let upserted = 0;
  try {
    await client.query("begin");
    for (const creator of creators) {
      const creatorKey = creator.creatorKey?.trim().slice(0, 200) || normalizeCreatorKey(creator.displayName);
      const quality = calculateCreatorQuality({
        displayName: creator.displayName,
        discoveryQuery: creator.discoveryQuery,
        evidenceCount: creator.evidenceCount,
        hasProfile: Boolean(creator.profileUrl),
        followerCount: creator.followerCount,
        platformWorkCount: creator.platformWorkCount,
        isVerified: creator.isVerified,
      });
      const existing = await client.query<{ id: string }>(
        `select id from viral_creators where platform=$1 and
         (($3::text is not null and platform_creator_key=$3) or ($3::text is null and creator_key=$2)) limit 1`,
        [creator.platform, creatorKey, creator.creatorKey || null],
      );
      let creatorId = existing.rows[0]?.id;
      if (creatorId) {
        await client.query(
          `update viral_creators set platform_creator_key=coalesce($2,platform_creator_key),display_name=$3,
             profile_url=coalesce($4,profile_url),bio=case when $5 <> '' then $5 else bio end,relevance_score=greatest(relevance_score,$6),
             quality_score=greatest(quality_score,$7),discovery_evidence_count=greatest(discovery_evidence_count,$8),
             follower_count=greatest(coalesce(follower_count,0),coalesce($9,0)),
             platform_work_count=case when $10::integer is null then platform_work_count else $10::integer end,
             is_verified=is_verified or $11,source_kind=$12,discovery_query=$13,
             last_discovered_at=now(),updated_at=now(),metadata=metadata||$14::jsonb where id=$1`,
          [creatorId, creator.creatorKey || null, creator.displayName, creator.profileUrl ?? null, creator.bio ?? "",
            quality.relevance, quality.total, creator.evidenceCount ?? 1, creator.followerCount ?? null,
            creator.platformWorkCount ?? null, Boolean(creator.isVerified), creator.sourceKind,
            creator.discoveryQuery ?? null, JSON.stringify({ creatorQuality: quality, discoverySource: creator.sourceKind,
              profileStatsSource: creator.profileStatsSource ?? null })],
        );
      } else {
        const inserted = await client.query<{ id: string }>(
          `insert into viral_creators
            (platform,creator_key,platform_creator_key,display_name,profile_url,bio,status,relevance_score,
             quality_score,discovery_evidence_count,follower_count,platform_work_count,is_verified,
             source_kind,discovery_query,refresh_status,metadata)
           values($1,$2,$3,$4,$5,$6,'paused',$7,$8,$9,$10,$11,$12,$13,$14,'pending',$15::jsonb) returning id`,
          [creator.platform, creatorKey, creator.creatorKey || null, creator.displayName, creator.profileUrl ?? null, creator.bio ?? "",
            quality.relevance, quality.total, creator.evidenceCount ?? 1, creator.followerCount ?? null,
            creator.platformWorkCount ?? null, Boolean(creator.isVerified), creator.sourceKind,
            creator.discoveryQuery ?? null, JSON.stringify({ creatorQuality: quality, discoverySource: creator.sourceKind,
              profileStatsSource: creator.profileStatsSource ?? null })],
        );
        creatorId = inserted.rows[0].id;
      }
      upserted += 1;
      for (const evidence of creator.evidence ?? []) {
        if (!evidence.query) continue;
        await client.query(
          `insert into viral_creator_discovery_sightings
            (run_id,creator_id,platform,discovery_query,source_url,evidence_title)
           values($1,$2,$3,$4,$5,$6) on conflict do nothing`,
          [runId, creatorId, creator.platform, evidence.query, evidence.url ?? null, evidence.title ?? null],
        );
      }
    }
    await client.query("commit");
    return upserted;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

function normalizeCreatorKey(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "").slice(0, 200) || value.slice(0, 200);
}

function discoveryIntervalMs() {
  return boundedInteger(process.env.VIRAL_CREATOR_DISCOVERY_INTERVAL_MS, defaultIntervalMs, 60 * 60 * 1000, 7 * defaultIntervalMs);
}

function boundedInteger(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(Math.max(Math.floor(parsed), min), max) : fallback;
}
