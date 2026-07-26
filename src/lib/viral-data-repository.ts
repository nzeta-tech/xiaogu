import type { PoolClient } from "pg";
import { getPool, query } from "@/lib/db/client";
import type { ViralExample } from "@/lib/viral-examples";
import type { ViralCreatorCandidate, ViralWorkCandidate } from "@/lib/viral-examples";
import { createHash } from "node:crypto";
import { calculateViralScore, isInsuranceFinanceRelevant, type ViralScoreBreakdown } from "@/lib/viral-scoring";

export type ViralDataRun = {
  id: string;
  trigger_type: string;
  status: "running" | "succeeded" | "failed";
  started_at: string;
  completed_at: string | null;
  discovered_count: number;
  published_count: number;
  error_message: string | null;
  diagnostics: unknown;
};

export type PreparedViralItem = {
  automaticKey: string;
  item: ViralExample;
};

export async function createViralDataRun(triggerType: string) {
  const result = await query<ViralDataRun>(
    `insert into viral_data_runs(trigger_type, status)
     values ($1, 'running')
     returning *`,
    [triggerType],
  );
  return result.rows[0];
}

export async function failViralDataRun(runId: string, errorMessage: string, diagnostics: Record<string, unknown> = {}) {
  await query(
    `update viral_data_runs
     set status = 'failed', completed_at = now(), error_message = $2, diagnostics = $3::jsonb
     where id = $1`,
    [runId, errorMessage.slice(0, 2000), JSON.stringify(diagnostics)],
  );
}

export async function getLatestViralDataRun(status?: ViralDataRun["status"]) {
  const result = await query<ViralDataRun>(
    `select * from viral_data_runs
     where ($1::text is null or status = $1)
     order by started_at desc
     limit 1`,
    [status ?? null],
  );
  return result.rows[0] ?? null;
}

export async function completeViralDataRunWithoutChanges(runId: string, discoveredCount: number, diagnostics: Record<string, unknown>) {
  const result = await query<{ published_count: number }>(
    `update viral_data_runs
     set status = 'succeeded', completed_at = now(), discovered_count = $2,
         published_count = (select count(*) from viral_contents where source_type = 'automatic' and status = 'published'),
         diagnostics = $3::jsonb
     where id = $1
     returning published_count`,
    [runId, discoveredCount, JSON.stringify(diagnostics)],
  );
  return Number(result.rows[0]?.published_count ?? 0);
}

export async function recordViralDiscovery(input: {
  runId: string;
  creators: ViralCreatorCandidate[];
  candidates: ViralWorkCandidate[];
  publishedSourceUrls: Set<string>;
}) {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    for (const creator of input.creators) {
      const creatorKey = normalizeCreatorKey(creator.displayName);
      const creatorWorks = input.candidates.filter((candidate) => candidate.platform === creator.platform
        && ((candidate.authorKey && candidate.authorKey === creator.creatorKey) || candidate.authorName === creator.displayName));
      const profileWorkCount = creatorWorks.filter((candidate) => candidate.discoveryQuery?.startsWith("作者主页:")).length;
      const refreshStatus = profileWorkCount > 0 ? "succeeded" : creator.profileUrl ? "pending" : "unavailable";
      await client.query(
        `insert into viral_creators
          (platform, creator_key, platform_creator_key, display_name, profile_url, bio, relevance_score,
           follower_count, platform_work_count, is_verified, source_kind, discovery_query, refresh_status,
           last_refreshed_at, discovered_work_count, metadata)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb)
         on conflict (platform, creator_key) do update set
           platform_creator_key = coalesce(excluded.platform_creator_key, viral_creators.platform_creator_key),
           display_name = excluded.display_name,
           profile_url = coalesce(excluded.profile_url, viral_creators.profile_url),
           bio = case when excluded.bio <> '' then excluded.bio else viral_creators.bio end,
           relevance_score = greatest(viral_creators.relevance_score, excluded.relevance_score),
           follower_count = greatest(coalesce(viral_creators.follower_count, 0), coalesce(excluded.follower_count, 0)),
           platform_work_count = coalesce(excluded.platform_work_count, viral_creators.platform_work_count),
           is_verified = viral_creators.is_verified or excluded.is_verified,
           source_kind = excluded.source_kind,
           discovery_query = coalesce(excluded.discovery_query, viral_creators.discovery_query),
           refresh_status = excluded.refresh_status,
           last_refreshed_at = coalesce(excluded.last_refreshed_at, viral_creators.last_refreshed_at),
           discovered_work_count = greatest(viral_creators.discovered_work_count, excluded.discovered_work_count),
           last_discovered_at = now(), updated_at = now(),
           metadata = viral_creators.metadata || excluded.metadata`,
        [creator.platform, creatorKey, creator.creatorKey || null, creator.displayName, creator.profileUrl ?? null, creator.bio ?? "",
          inferCreatorRelevance(creator), creator.followerCount ?? null, creator.platformWorkCount ?? null, Boolean(creator.isVerified), creator.sourceKind, creator.discoveryQuery ?? null, refreshStatus,
          profileWorkCount > 0 ? new Date().toISOString() : null, creatorWorks.length,
          JSON.stringify({ lastDiscoveryQuery: creator.discoveryQuery ?? null, profileWorkCount,
            profileStatsSource: creator.profileStatsSource ?? null,
            ...(typeof creator.followerCount === "number" ? { followerCount: creator.followerCount } : {}),
            ...(typeof creator.platformWorkCount === "number" ? { platformWorkCount: creator.platformWorkCount } : {}),
            ...(typeof creator.isVerified === "boolean" ? { isVerified: creator.isVerified } : {}) })],
      );
    }

    for (const candidate of input.candidates) {
      const canonicalUrl = normalizeCandidateUrl(candidate.sourceUrl);
      const sourceKey = createHash("sha256").update(`${candidate.platform}:${canonicalUrl}`).digest("hex");
      const relevant = isInsuranceFinanceRelevant(candidate);
      const published = input.publishedSourceUrls.has(`${candidate.platform}:${canonicalUrl}`);
      const disposition = published ? "published" : "rejected";
      const rejectionReason = published ? null : relevant ? "platform_publish_limit" : "insurance_finance_relevance";
      await client.query(
        `insert into viral_work_candidates
          (data_run_id, platform, source_key, source_url, title, author_name, platform_creator_key,
           author_profile_url, discovery_query, relevance_score, disposition, rejection_reason, raw_data)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)
         on conflict (data_run_id, platform, source_key) do update set
           disposition = excluded.disposition, rejection_reason = excluded.rejection_reason,
           raw_data = viral_work_candidates.raw_data || excluded.raw_data`,
        [input.runId, candidate.platform, sourceKey, candidate.sourceUrl, candidate.title,
          candidate.authorName ?? null, candidate.authorKey ?? null, candidate.authorProfileUrl ?? null,
          candidate.discoveryQuery ?? null, relevant ? 100 : 0, disposition, rejectionReason,
          JSON.stringify(candidate.rawData ?? {})],
      );
    }
    await client.query(
      `update viral_data_runs set creator_discovered_count=$2, candidate_count=$3,
         eligible_count=$4, discovered_count=$3 where id=$1`,
      [input.runId, input.creators.length, input.candidates.length, input.publishedSourceUrls.size],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function publishViralDataRun(runId: string, preparedItems: PreparedViralItem[], evaluatedPlatforms?: string[], discoveredCount = preparedItems.length) {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const scoreDiagnostics: Array<{ key: string; score: ViralScoreBreakdown }> = [];
    const refreshedPlatforms = [...new Set(evaluatedPlatforms?.length ? evaluatedPlatforms : preparedItems.map(({ item }) => item.platform))];
    const platformOrder = new Map<string, number>();

    for (const prepared of preparedItems) {
      const { item, automaticKey } = prepared;
      const creatorId = await upsertCreator(client, item);
      const workId = await upsertWork(client, item, automaticKey, creatorId);
      const context = await getWorkScoreContext(client, workId, creatorId, item.metricLabel);
      const score = calculateViralScore({
        metricValue: item.metricValue,
        previousMetricValue: context.previousMetricValue,
        creatorMedianMetric: context.creatorMedianMetric,
        publishedAt: item.publishedAt,
        fetchedAt: item.fetchedAt,
        hasAuthor: Boolean(item.authorName),
        hasThumbnail: Boolean(item.thumbnailUrl),
        hasDetailUrl: Boolean(item.sourceUrl),
      });

      if (item.metricValue !== undefined && Number.isFinite(item.metricValue)) {
        await client.query(
          `insert into viral_work_metric_snapshots(work_id, captured_at, metric_label, metric_value, metric_unit)
           values ($1, $2, $3, $4, $5)
           on conflict (work_id, captured_at, metric_label)
           do update set metric_value = excluded.metric_value, metric_unit = excluded.metric_unit`,
          [workId, validDate(item.fetchedAt), item.metricLabel, toPgInteger(item.metricValue), item.metricUnit ?? ""],
        );
      }

      const sortOrder = platformOrder.get(item.platform) ?? 0;
      platformOrder.set(item.platform, sortOrder + 1);
      await upsertPublishedContent(client, {
        item,
        automaticKey,
        creatorId,
        workId,
        runId,
        score: score.total,
        sortOrder,
      });
      scoreDiagnostics.push({ key: automaticKey, score });
    }

    if (refreshedPlatforms.length > 0) {
      await client.query(
        `update viral_contents
         set status = 'offline', updated_at = now()
         where source_type = 'automatic'
           and platform = any($1::text[])
           and data_run_id is distinct from $2::uuid`,
        [refreshedPlatforms, runId],
      );
    }

    const countResult = await client.query<{ count: string }>(
      "select count(*)::text as count from viral_contents where source_type = 'automatic' and status = 'published'",
    );
    const publishedCount = Number(countResult.rows[0]?.count ?? 0);
    await client.query(
      `update viral_data_runs
       set status = 'succeeded', completed_at = now(), discovered_count = $2,
           published_count = $3, diagnostics = $4::jsonb
       where id = $1`,
      [runId, discoveredCount, publishedCount, JSON.stringify({ refreshedPlatforms, scores: scoreDiagnostics })],
    );
    await client.query("commit");
    return { publishedCount, refreshedPlatforms, scoreDiagnostics };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function upsertCreator(client: PoolClient, item: ViralExample) {
  const displayName = item.authorName?.trim();
  if (!displayName) return null;
  const creatorKey = normalizeCreatorKey(displayName);
  const result = await client.query<{ id: string }>(
    `insert into viral_creators(platform, creator_key, platform_creator_key, display_name, profile_url, relevance_score, source_kind, discovery_query, metadata)
     values ($1, $2, $3, $4, $5, $6, 'platform_search', $7, $8::jsonb)
     on conflict (platform, creator_key) do update set
       platform_creator_key = coalesce(excluded.platform_creator_key, viral_creators.platform_creator_key),
       display_name = excluded.display_name,
       profile_url = coalesce(excluded.profile_url, viral_creators.profile_url),
       relevance_score = greatest(viral_creators.relevance_score, excluded.relevance_score),
       last_discovered_at = now(), updated_at = now(), metadata = viral_creators.metadata || excluded.metadata
     returning id`,
    [item.platform, creatorKey, item.authorKey ?? null, displayName, item.authorProfileUrl ?? null,
      inferRelevanceScore(item), item.discoveryQuery ?? null, JSON.stringify({ lastSourceUrl: item.sourceUrl })],
  );
  return result.rows[0]?.id ?? null;
}

async function upsertWork(client: PoolClient, item: ViralExample, sourceKey: string, creatorId: string | null) {
  const result = await client.query<{ id: string }>(
    `insert into viral_works
      (creator_id, platform, source_key, source_url, title, excerpt, thumbnail_url, example_type,
       content_type, category, tags, relevance_score, published_at, first_seen_at, last_seen_at, metadata)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13, $14, $14, $15::jsonb)
     on conflict (source_key) do update set
       creator_id = coalesce(excluded.creator_id, viral_works.creator_id),
       source_url = excluded.source_url, title = excluded.title, excerpt = excluded.excerpt,
       thumbnail_url = coalesce(excluded.thumbnail_url, viral_works.thumbnail_url),
       example_type = excluded.example_type, content_type = excluded.content_type,
       category = excluded.category, tags = excluded.tags,
       relevance_score = greatest(viral_works.relevance_score, excluded.relevance_score),
       published_at = coalesce(excluded.published_at, viral_works.published_at),
       last_seen_at = excluded.last_seen_at, updated_at = now(), metadata = viral_works.metadata || excluded.metadata
     returning id`,
    [creatorId, item.platform, sourceKey, item.sourceUrl, item.title, item.excerpt ?? "", item.thumbnailUrl ?? null,
      item.type, item.contentType, item.category, JSON.stringify(item.tags), inferRelevanceScore(item),
      validDateOrNull(item.publishedAt), validDate(item.fetchedAt), JSON.stringify({ sourceTitle: item.sourceTitle ?? item.title })],
  );
  return result.rows[0].id;
}

async function getWorkScoreContext(client: PoolClient, workId: string, creatorId: string | null, metricLabel: string) {
  const previous = await client.query<{ metric_value: number }>(
    `select metric_value from viral_work_metric_snapshots
     where work_id = $1 and metric_label = $2
     order by captured_at desc limit 1`,
    [workId, metricLabel],
  );
  let creatorMedianMetric: number | undefined;
  if (creatorId) {
    const baseline = await client.query<{ median: number | null }>(
      `select percentile_cont(0.5) within group (order by latest.metric_value)::double precision as median
       from viral_works vw
       join lateral (
         select metric_value from viral_work_metric_snapshots snapshots
         where snapshots.work_id = vw.id and snapshots.metric_label = $2
         order by captured_at desc limit 1
       ) latest on true
       where vw.creator_id = $1`,
      [creatorId, metricLabel],
    );
    creatorMedianMetric = baseline.rows[0]?.median ?? undefined;
  }
  return { previousMetricValue: previous.rows[0]?.metric_value, creatorMedianMetric };
}

async function upsertPublishedContent(client: PoolClient, input: {
  item: ViralExample;
  automaticKey: string;
  creatorId: string | null;
  workId: string;
  runId: string;
  score: number;
  sortOrder: number;
}) {
  const { item } = input;
  await client.query(
    `insert into viral_contents
      (title, platform, content_type, category, tags, source_url, source_title, source_author,
       thumbnail_url, media_url, embed_url, article_body, summary, metric_label, metric_value,
       metric_unit, insight, risk_note, source_type, status, is_featured, sort_order, publish_at,
       automatic_key, creator_id, work_id, data_run_id, example_type, viral_score, fetched_at)
     values ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
       $16, $17, $18, 'automatic', 'published', $19, $20, $21, $22, $23, $24, $25, $26, $27, $28)
     on conflict (automatic_key) where source_type = 'automatic' and automatic_key is not null
     do update set
       title = excluded.title, platform = excluded.platform, content_type = excluded.content_type,
       category = excluded.category, tags = excluded.tags, source_url = excluded.source_url,
       source_title = excluded.source_title, source_author = excluded.source_author,
       thumbnail_url = coalesce(excluded.thumbnail_url, viral_contents.thumbnail_url),
       media_url = coalesce(excluded.media_url, viral_contents.media_url),
       embed_url = coalesce(excluded.embed_url, viral_contents.embed_url),
       article_body = case when excluded.article_body <> '' then excluded.article_body else viral_contents.article_body end,
       summary = excluded.summary, metric_label = excluded.metric_label, metric_value = excluded.metric_value,
       metric_unit = excluded.metric_unit, insight = excluded.insight, risk_note = excluded.risk_note,
       status = 'published', is_featured = excluded.is_featured, sort_order = excluded.sort_order,
       publish_at = coalesce(excluded.publish_at, viral_contents.publish_at),
       creator_id = excluded.creator_id, work_id = excluded.work_id, data_run_id = excluded.data_run_id,
       example_type = excluded.example_type, viral_score = excluded.viral_score,
       fetched_at = excluded.fetched_at, updated_at = now()`,
    [item.title, item.platform, item.contentType, item.category, JSON.stringify(item.tags), item.sourceUrl,
      item.sourceTitle ?? item.title, item.authorName ?? "", item.thumbnailUrl ?? null, item.mediaUrl ?? null,
      item.embedUrl ?? null, item.articleBody ?? "", item.excerpt ?? "", item.metricLabel,
      item.metricValue === undefined ? null : toPgInteger(item.metricValue), item.metricUnit ?? "",
      item.insight, item.statusNote, input.score >= 70, input.sortOrder, validDateOrNull(item.publishedAt),
      input.automaticKey, input.creatorId, input.workId, input.runId, item.type, input.score, validDate(item.fetchedAt)],
  );
}

function normalizeCreatorKey(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "").slice(0, 200) || value.slice(0, 200);
}

function normalizeCandidateUrl(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    ["_from", "from", "share_source", "share_token", "timestamp", "sec_uid", "mid", "source"].forEach((key) => url.searchParams.delete(key));
    return url.toString();
  } catch {
    return value.trim();
  }
}

function inferCreatorRelevance(creator: ViralCreatorCandidate) {
  const matches = `${creator.displayName} ${creator.discoveryQuery ?? ""}`.match(/保险|理赔|医疗|重疾|养老|退休|健康|社保|保障|保单|年金|财务/g)?.length ?? 0;
  return Math.min(100, 50 + matches * 10);
}

function inferRelevanceScore(item: ViralExample) {
  const text = `${item.title} ${item.category} ${item.tags.join(" ")}`;
  const matches = text.match(/保险|理赔|医疗|重疾|养老|退休|健康|社保|保障|保单|年金|家庭|财务|现金流/g)?.length ?? 0;
  return Math.min(100, 55 + matches * 8);
}

function validDate(value: string) {
  return Number.isFinite(Date.parse(value)) ? value : new Date().toISOString();
}

function validDateOrNull(value?: string) {
  return value && Number.isFinite(Date.parse(value)) ? value : null;
}

function toPgInteger(value: number) {
  return Math.min(Math.max(Math.round(value), 0), 2_147_483_647);
}
