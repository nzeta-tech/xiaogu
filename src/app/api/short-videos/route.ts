import { requireSessionUser } from "@/lib/auth/session";
import { getMeteringMode, reportUsage } from "@/lib/billing/openmeter";
import { requireQuota } from "@/lib/billing/enforce";
import { trySaveUsageLog } from "@/lib/db/repositories";
import { getShortVideoFeed } from "@/lib/short-videos/catalog";
import type { ShortVideoSort } from "@/lib/short-videos/types";

const sortValues = new Set<ShortVideoSort>(["relevance", "published_at", "views", "engagement"]);

export async function GET(request: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  const quota = await requireQuota(user, "short_videos");
  if (!quota.ok) return quota.response;

  const params = new URL(request.url).searchParams;
  const requestedSort = params.get("sort") as ShortVideoSort | null;
  const sort = requestedSort && sortValues.has(requestedSort) ? requestedSort : "relevance";
  const rawLimit = Number(params.get("limit") ?? 20);
  const limit = Number.isFinite(rawLimit) ? rawLimit : 20;

  const feed = await getShortVideoFeed({
    refresh: params.get("refresh") === "1",
    theme: params.get("theme") ?? undefined,
    platform: params.get("platform") ?? undefined,
    sort,
    limit,
  });
  await reportUsage({
    customerId: user.id,
    action: "short_videos",
    amount: quota.quotaCost,
    metadata: { itemCount: feed.items.length, source: feed.source, degraded: feed.degraded },
  });
  await trySaveUsageLog({
    userId: user.id,
    actionType: "short_videos",
    quotaCost: quota.quotaCost,
    metadata: { itemCount: feed.items.length, source: feed.source, degraded: feed.degraded, meteringMode: getMeteringMode() },
  });

  return Response.json({
    ...feed,
    policy: {
      source: "仅接入已配置且明确提供授权标记的供应商 API，不抓取登录态或绕过平台限制",
      review: "条款事实、版权/转载范围、个人信息和平台发布规则须由产品与领域顾问确认",
    },
    usage: { action: "short_videos", quotaCost: quota.quotaCost, meteringMode: getMeteringMode() },
  });
}
