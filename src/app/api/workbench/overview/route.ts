import { after } from "next/server";
import { requireSessionUser } from "@/lib/auth/session";
import { tryGetWorkbenchOverview } from "@/lib/db/repositories";
import { refreshTopicCacheIfStale } from "@/lib/topics/cache-refresh";
import { configureTopicRefreshScheduler } from "@/lib/topics/topic-scheduler";
import { waitForTopicRefresh } from "@/lib/topics/refresh-warmup";

export async function GET() {
  configureTopicRefreshScheduler();
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  let overview = await tryGetWorkbenchOverview(user.id);
  if (!overview) {
    return Response.json({ error: "工作台数据暂不可用" }, { status: 503 });
  }

  // Empty boards should be filled before responding. Stale boards remain fast and refresh in background.
  if (!overview.topicsIngestionReady) {
    const refresh = refreshTopicCacheIfStale().catch(() => undefined);
    const warmup = await waitForTopicRefresh(refresh, Number(process.env.TOPIC_INITIAL_WARMUP_TIMEOUT_MS ?? 8_000));
    if (warmup.timedOut) after(() => refresh);
    else overview = await tryGetWorkbenchOverview(user.id) ?? overview;
  } else if (overview.topicsStale) {
    after(() => refreshTopicCacheIfStale().catch(() => undefined));
  }

  return Response.json({ overview, mode: "server" }, { headers: { "cache-control": "private, no-store" } });
}
