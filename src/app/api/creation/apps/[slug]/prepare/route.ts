import { getEntryAdjustedApp } from "@/lib/apps/entry-app";
import { requireSessionUser } from "@/lib/auth/session";
import { requireQuota } from "@/lib/billing/enforce";
import { startBackgroundWorkRun } from "@/lib/creation/background-run-registry";
import { query } from "@/lib/db/client";
import { isEmptyCreationFieldValue } from "@/lib/creation/output";
import { tryCreateWork, tryGetCreationAppBySlug, tryGetLatestThinkingProfileSnapshot, tryGetSystemSettings, trySyncCreationCatalog } from "@/lib/db/repositories";

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  await trySyncCreationCatalog();
  const app = await tryGetCreationAppBySlug(slug);
  if (!app) {
    return Response.json({ error: "应用不存在" }, { status: 404 });
  }
  const settings = await tryGetSystemSettings();
  if (!settings.features.imageGenerationEnabled && (app.resultType === "image" || app.resultType === "image-plan")) return Response.json({ error: "图片生成功能当前已关闭" }, { status: 403 });

  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const quota = await requireQuota(user, "write_script", app.points);
  if (!quota.ok) return quota.response;

  const body = (await request.json().catch(() => ({}))) as { values?: Record<string, string | string[]> };
  const values = body.values ?? {};

  const entry = typeof values.app_entry === "string" ? values.app_entry.trim() : "";
  const effectiveApp = getEntryAdjustedApp(app, entry);
  const missingField = effectiveApp.fields.find((field) => field.required && isEmptyCreationFieldValue(values[field.id]));
  if (missingField) {
    return Response.json({ error: `${missingField.label}还没有填写。` }, { status: 400 });
  }
  const visualAssetIds = Array.isArray(values.avatar_visual_asset_ids) ? values.avatar_visual_asset_ids.filter(Boolean) : [];
  const needsAvatarPhoto = entry === "personality-card" || app.slug === "image-card" && values.draw_portrait === "yes" || (app.slug === "wechat-images" || app.slug === "policy-renewal-card") && values.avatar_visual_mode === "yes";
  if (needsAvatarPhoto && visualAssetIds.length === 0 && isEmptyCreationFieldValue(values.reference_image)) {
    return Response.json({ error: "请选择数字分身形象照，或临时上传一张形象照。" }, { status: 400 });
  }

  if (effectiveApp.requiresThinking) {
    const thinkingSnapshot = await tryGetLatestThinkingProfileSnapshot(user.id);
    if (!thinkingSnapshot) {
      return Response.json({ error: "请先完成思维问卷，再使用这个应用。" }, { status: 409 });
    }
  }

  const work = await tryCreateWork({
    userId: user.id,
    appCode: app.slug,
    title: `${effectiveApp.name}｜正在生成`,
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
