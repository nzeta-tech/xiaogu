import { getEntryAdjustedApp } from "@/lib/apps/entry-app";
import { requireSessionUser } from "@/lib/auth/session";
import { requireQuota } from "@/lib/billing/enforce";
import { startBackgroundWorkRun, waitForBackgroundWorkRunStart } from "@/lib/creation/background-run-registry";
import { checkLinkRemixDependencies, formatDependencyFailure } from "@/lib/creation/dependency-health";
import { buildWorkTitle } from "@/lib/creation/work-title";
import { query } from "@/lib/db/client";
import { isEmptyCreationFieldValue } from "@/lib/creation/output";
import { isSupportedLinkRemixUrl } from "@/lib/creation/link-remix-source";
import { tryCreateWork, tryGetCreationAppBySlug, tryGetLatestThinkingProfileSnapshot, tryGetSystemSettings, trySyncCreationCatalog } from "@/lib/db/repositories";
import { getLinkRemixAvailability } from "@/lib/local-agent/repository";

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

  if (app.slug === "link-remix") {
    const availability = await getLinkRemixAvailability();
    if (!availability.available) {
      return Response.json({ error: availability.reason, code: "LOCAL_AGENT_OFFLINE" }, { status: 503 });
    }
    const dependencies = await checkLinkRemixDependencies();
    const failure = formatDependencyFailure(dependencies);
    if (failure) {
      return Response.json({
        error: `二创不能继续：${failure}。请先恢复依赖服务后再重试。`,
        dependencies,
      }, { status: 503 });
    }
  }

  const quota = await requireQuota(user, "write_script", app.points);
  if (!quota.ok) return quota.response;

  const body = (await request.json().catch(() => ({}))) as { values?: Record<string, string | string[]> };
  const values = body.values ?? {};
  if (app.slug === "link-remix" && !isSupportedLinkRemixUrl(typeof values.source_url === "string" ? values.source_url : "")) {
    return Response.json({ error: "爆款二创目前仅支持抖音和微信视频号作品链接。" }, { status: 400 });
  }

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

  const pendingTitle = buildWorkTitle({
    appName: effectiveApp.name,
    appSlug: app.slug,
    values,
    result: null,
  });

  const work = await tryCreateWork({
    userId: user.id,
    appCode: app.slug,
    title: pendingTitle,
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
          ? "作品记录没有成功保存，可能是数据库暂时繁忙。你的填写内容仍在当前页面，请稍后重试。"
          : "预创建作品失败：当前数据库未连接，请先启动本地 Postgres/Redis 服务。",
      },
      { status: 500 },
    );
  }

  startBackgroundWorkRun({
    workId: work.id,
    slug: app.slug,
    userId: user.id,
    values,
    quotaCost: quota.quotaCost,
  });
  // Persist the app run before the request returns. Otherwise a serverless-like
  // runtime can discard the detached task before the work page reconnects.
  await waitForBackgroundWorkRunStart(work.id);

  return Response.json({
    ok: true,
    work: {
      id: work.id,
      title: work.title,
    },
  });
}
