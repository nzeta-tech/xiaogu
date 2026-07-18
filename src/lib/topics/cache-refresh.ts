import { getPool } from "@/lib/db/client";
import { tryGetSystemSettings, tryListLatestTopicSnapshots, trySaveTopicSnapshots } from "@/lib/db/repositories";
import { getHotTopics } from "@/lib/topics/hot-topics";

const topicRefreshLockId = 1_846_201_417;

export async function refreshTopicCache(options: { force?: boolean } = {}) {
  const settings = await tryGetSystemSettings();
  if (!settings.features.hotTopicsEnabled) return { refreshed: false, reason: "disabled" as const };

  if (!options.force) {
    const cached = await tryListLatestTopicSnapshots({ limit: 1, maxAgeMinutes: 1440 });
    if (cached.topics.length > 0) return { refreshed: false, reason: "fresh" as const };
  }

  const client = await getPool().connect();
  let locked = false;
  try {
    const lock = await client.query<{ locked: boolean }>("select pg_try_advisory_lock($1) as locked", [topicRefreshLockId]);
    locked = lock.rows[0]?.locked ?? false;
    if (!locked) return { refreshed: false, reason: "in_progress" as const };

    if (!options.force) {
      const rechecked = await tryListLatestTopicSnapshots({ limit: 1, maxAgeMinutes: 1440 });
      if (rechecked.topics.length > 0) return { refreshed: false, reason: "fresh" as const };
    }

    const topics = await getHotTopics({ refresh: true });
    await trySaveTopicSnapshots({ userId: null, topics });
    return { refreshed: true, topicCount: topics.length };
  } finally {
    if (locked) await client.query("select pg_advisory_unlock($1)", [topicRefreshLockId]).catch(() => undefined);
    client.release();
  }
}

export function refreshTopicCacheIfStale() {
  return refreshTopicCache();
}
