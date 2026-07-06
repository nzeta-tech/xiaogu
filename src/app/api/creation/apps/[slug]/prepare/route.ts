import { getCreationAppBySlug } from "@/lib/apps/catalog";
import { requireSessionUser } from "@/lib/auth/session";
import { requireQuota } from "@/lib/billing/enforce";
import { startBackgroundWorkRun } from "@/lib/creation/background-run-registry";
import { query } from "@/lib/db/client";
import { tryCreateWork, tryGetCreationAppBySlug, trySyncCreationCatalog } from "@/lib/db/repositories";

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  await trySyncCreationCatalog();
  const app = (await tryGetCreationAppBySlug(slug)) ?? getCreationAppBySlug(slug);
  if (!app) {
    return Response.json({ error: "应用不存在" }, { status: 404 });
  }

  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const quota = await requireQuota(user, "write_script");
  if (!quota.ok) return quota.response;

  const body = (await request.json().catch(() => ({}))) as { values?: Record<string, string | string[]> };
  const values = body.values ?? {};

  const work = await tryCreateWork({
    userId: user.id,
    appCode: app.slug,
    title: `${app.name}｜正在生成`,
    content: "",
    contentJson: { batches: [] },
    sourceChannel: app.slug,
    complianceRisk: "unchecked",
  });

  if (!work) {
    const databaseReachable = await query("select 1").then(() => true).catch(() => false);
    return Response.json(
      {
        error: databaseReachable
          ? "预创建作品失败，请稍后再试。"
          : "预创建作品失败：当前数据库未连接，请先启动本地 Postgres/Redis 服务。",
      },
      { status: 500 },
    );
  }

  void startBackgroundWorkRun({
    workId: work.id,
    slug: app.slug,
    userId: user.id,
    values,
    quotaCost: quota.quotaCost,
  });

  return Response.json({
    ok: true,
    work: {
      id: work.id,
      title: work.title,
    },
  });
}
