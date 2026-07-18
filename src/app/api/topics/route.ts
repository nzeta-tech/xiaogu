import { getHotTopics } from "@/lib/topics/hot-topics";
import { requireSessionUser } from "@/lib/auth/session";
import { getMeteringMode, reportUsage } from "@/lib/billing/openmeter";
import { requireQuota } from "@/lib/billing/enforce";
import { tryGetLatestThinkingProfileSnapshot, tryGetSystemSettings, tryListLatestTopicSnapshots, trySaveTopicSnapshots, trySaveUsageLog } from "@/lib/db/repositories";
import { extractTopicPreferenceFromSnapshot } from "@/lib/thinking/profile-snapshot";

export async function GET(request: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  if (!(await tryGetSystemSettings()).features.hotTopicsEnabled) return Response.json({ error: "热点服务当前已关闭" }, { status: 403 });

  const quota = await requireQuota(user, "hot_topics");
  if (!quota.ok) return quota.response;

  let topics;
  let refreshedAt: string | null = null;
  let loadedFromCache = false;
  try {
    const { searchParams } = new URL(request.url);
    const refresh = searchParams.get("refresh") === "1";
    const cached = refresh
      ? { topics: [], refreshedAt: null }
      : await tryListLatestTopicSnapshots({ limit: 12, maxAgeMinutes: 1440 });
    topics = cached.topics;
    refreshedAt = cached.refreshedAt;
    loadedFromCache = topics.length > 0;
    if (topics.length === 0) {
      const thinkingSnapshot = await tryGetLatestThinkingProfileSnapshot(user.id);
      const topicPreference = thinkingSnapshot?.snapshot_json
        ? extractTopicPreferenceFromSnapshot(thinkingSnapshot.snapshot_json)
        : "";
      topics = await getHotTopics({ refresh, topicPreference });
      refreshedAt = new Date().toISOString();
    }
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "话题发现服务暂不可用" }, { status: 503 });
  }

  await reportUsage({
    customerId: user.id,
    action: "hot_topics",
    amount: quota.quotaCost,
    metadata: { topicCount: topics.length },
  });
  if (!loadedFromCache) await trySaveTopicSnapshots({ userId: user.id, topics });
  await trySaveUsageLog({
    userId: user.id,
    actionType: "hot_topics",
    quotaCost: quota.quotaCost,
    metadata: { topicCount: topics.length, meteringMode: getMeteringMode() },
  });

  return Response.json({
    topics,
    refreshedAt,
    cache: loadedFromCache ? "hit" : "miss",
    usage: {
      action: "hot_topics",
      quotaCost: quota.quotaCost,
      meteringMode: getMeteringMode(),
    },
  });
}
