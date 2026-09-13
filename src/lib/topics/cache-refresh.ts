import { getPool } from "@/lib/db/client";
import { tryGetSystemSettings, tryListLatestTopicIngestionBatch, trySaveTopicIngestionBatch } from "@/lib/db/repositories";
import { collectHotTopicCandidates } from "@/lib/topics/hot-topics";
import { prepareTopicIngestion } from "@/lib/topics/ingestion";

const topicRefreshLockId = 1_846_201_417;

export async function refreshTopicCache(options: { force?: boolean } = {}) {
  const settings = await tryGetSystemSettings();
  if (!settings.features.hotTopicsEnabled) return { refreshed: false, reason: "disabled" as const };

  if (!options.force) {
    const cached = await tryListLatestTopicIngestionBatch({ perTabLimit: 1, maxAgeMinutes: 1440 });
    if (cached.topics.length > 0) return { refreshed: false, reason: "fresh" as const };
  }

  const client = await getPool().connect();
  let locked = false;
  try {
    const lock = await client.query<{ locked: boolean }>("select pg_try_advisory_lock($1) as locked", [topicRefreshLockId]);
    locked = lock.rows[0]?.locked ?? false;
    if (!locked) return { refreshed: false, reason: "in_progress" as const };

    if (!options.force) {
      const rechecked = await tryListLatestTopicIngestionBatch({ perTabLimit: 1, maxAgeMinutes: 1440 });
      if (rechecked.topics.length > 0) return { refreshed: false, reason: "fresh" as const };
    }

    const candidates = await collectHotTopicCandidates({ refresh: true });
    const topics = prepareTopicIngestion(candidates, 200);
    const sourceSummary = topics.reduce<Record<string, number>>((summary, topic) => {
      summary[topic.source] = (summary[topic.source] ?? 0) + 1;
      return summary;
    }, {});
    const saved = await trySaveTopicIngestionBatch({ topics, sourceSummary });
    if (!saved) throw new Error("热点入库失败");
    return { refreshed: true, topicCount: saved.topicCount, ingestionRunId: saved.id };
  } finally {
    if (locked) await client.query("select pg_advisory_unlock($1)", [topicRefreshLockId]).catch(() => undefined);
    client.release();
  }
}

export function refreshTopicCacheIfStale() {
  return refreshTopicCache();
}
