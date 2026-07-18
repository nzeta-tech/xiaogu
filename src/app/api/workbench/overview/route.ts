import { after } from "next/server";
import { requireSessionUser } from "@/lib/auth/session";
import { tryGetWorkbenchOverview } from "@/lib/db/repositories";
import { refreshTopicCacheIfStale } from "@/lib/topics/cache-refresh";

export async function GET() {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const overview = await tryGetWorkbenchOverview(user.id);
  if (!overview) {
    return Response.json({ error: "工作台数据暂不可用" }, { status: 503 });
  }

  if (overview.topicsStale || overview.topics.length === 0) {
    after(() => refreshTopicCacheIfStale().catch(() => undefined));
  }

  return Response.json({ overview, mode: "server" }, { headers: { "cache-control": "private, no-store" } });
}
