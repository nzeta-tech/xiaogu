import { getEntryAdjustedApp } from "@/lib/apps/entry-app";
import { requireSessionUser } from "@/lib/auth/session";
import { requireQuota } from "@/lib/billing/enforce";
import { startBackgroundWorkRun, waitForBackgroundWorkRunStart } from "@/lib/creation/background-run-registry";
import { checkLinkRemixDependencies, formatDependencyFailure } from "@/lib/creation/dependency-health";
import { buildWorkTitle } from "@/lib/creation/work-title";
import { query } from "@/lib/db/client";
import { isEmptyCreationFieldValue } from "@/lib/creation/output";
import { isSupportedLinkRemixUrl, isWechatArticleUrl } from "@/lib/creation/link-remix-source";
import { creationRequestId, normalizeCreationTraceId, trySaveCreationDiagnostic } from "@/lib/creation/diagnostics";
import { tryCreateCreationTask, tryCreateWork, tryGetCreationAppBySlug, tryGetLatestThinkingProfileSnapshot, tryGetSystemSettings, trySyncCreationCatalog } from "@/lib/db/repositories";
import { remixCapabilityLabel } from "@/lib/creation/capabilities";
import { getLinkRemixAvailability } from "@/lib/local-agent/repository";
import { validateCreationFieldLengths } from "@/lib/creation/input-validation";
import { buildPendingRemixContentJson, getRemixCapabilitySettings } from "@/lib/creation/remix-capability-registry";

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const traceId = normalizeCreationTraceId(request.headers.get("x-creation-trace-id"));
  const requestId = creationRequestId();
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  if (traceId) await trySaveCreationDiagnostic({ userId: user.id, userEmail: user.email, traceId, requestId, appSlug: slug, eventType: "prepare_received", outcome: "arrived" });
  await trySyncCreationCatalog();
  const app = await tryGetCreationAppBySlug(slug);
  if (!app) {
    return Response.json({ error: "应用不存在" }, { status: 404 });
  }
  const settings = await tryGetSystemSettings();
  if (!settings.features.imageGenerationEnabled && (app.resultType === "image" || app.resultType === "image-plan")) return Response.json({ error: "图片生成功能当前已关闭" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { values?: Record<string, string | string[]> };
  const values = body.values ?? {};
  const linkRemixSourceUrl = typeof values.source_url === "string" ? values.source_url : "";
  const isServerInspectableWechatArticle = app.slug === "link-remix" && isWechatArticleUrl(linkRemixSourceUrl);

  if (app.slug === "link-remix" && !isServerInspectableWechatArticle && !(typeof values.source_transcript === "string" && values.source_transcript.trim())) {
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

  if (app.slug === "link-remix" && !isSupportedLinkRemixUrl(typeof values.source_url === "string" ? values.source_url : "")) {
    return Response.json({ error: "爆款话题二创目前仅支持抖音、微信视频号和公众号文章链接。" }, { status: 400 });
  }

  const entry = typeof values.app_entry === "string" ? values.app_entry.trim() : "";
  const effectiveApp = getEntryAdjustedApp(app, entry);
  const lengthError = validateCreationFieldLengths(effectiveApp.fields, values);
  if (lengthError) return Response.json({ error: lengthError, code: "INPUT_TOO_LONG" }, { status: 400 });
  const isImageCardRemix = app.slug === "image-card" && values.creation_mode === "image_remix";
  const missingField = effectiveApp.fields.find((field) => {
    if (isImageCardRemix && field.id === "draw_portrait") return false;
    return field.required && isEmptyCreationFieldValue(values[field.id]);
  });
  if (missingField) {
    return Response.json({ error: `${missingField.label}还没有填写。` }, { status: 400 });
  }
  if (app.slug === "link-remix") {
    const targetFields = getRemixCapabilitySettings(values.remix_target);
    const targetLengthError = validateCreationFieldLengths(targetFields, values);
    if (targetLengthError) return Response.json({ error: targetLengthError, code: "INPUT_TOO_LONG" }, { status: 400 });
    const missingTargetField = targetFields.find((field) => field.required && isEmptyCreationFieldValue(values[field.id]));
    if (missingTargetField) {
      return Response.json({ error: `${missingTargetField.label}还没有填写。` }, { status: 400 });
    }
  }
  if (app.slug === "image-card" && !isImageCardRemix && isEmptyCreationFieldValue(values.source)) {
    return Response.json({ error: "请填写卡片内容，或切换为上传图片进行二创。" }, { status: 400 });
  }
  if (isImageCardRemix && isEmptyCreationFieldValue(values.reference_image)) {
    return Response.json({ error: "二创模式需要先上传一张原图。" }, { status: 400 });
  }
  const visualAssetIds = Array.isArray(values.avatar_visual_asset_ids) ? values.avatar_visual_asset_ids.filter(Boolean) : [];
  const needsAvatarPhoto = entry === "personality-card" || app.slug === "image-card" && values.draw_portrait === "yes" || (app.slug === "wechat-images" || app.slug === "policy-renewal-card") && values.avatar_visual_mode === "yes";
  if (needsAvatarPhoto && visualAssetIds.length === 0 && (isImageCardRemix ? isEmptyCreationFieldValue(values.portrait_reference_image) : isEmptyCreationFieldValue(values.reference_image))) {
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

  const creationTask = app.slug === "link-remix"
    ? await tryCreateCreationTask({
        userId: user.id,
        taskType: "link-remix",
        title: `${typeof values.source_title === "string" && values.source_title.trim() ? values.source_title.trim().slice(0, 80) : "爆款内容"} · 二创任务`,
        sourceSnapshot: {
          ...values,
          targetLabel: remixCapabilityLabel(values.remix_target),
        },
      })
    : null;

  if (app.slug === "link-remix" && !creationTask) {
    return Response.json({ error: "二创任务没有成功保存，请稍后重试。" }, { status: 500 });
  }

  const work = await tryCreateWork({
    userId: user.id,
    appCode: app.slug,
    title: pendingTitle,
    content: "",
    contentJson: app.slug === "link-remix"
      ? buildPendingRemixContentJson(values)
      : { batches: [] },
    sourceChannel: app.slug,
    complianceRisk: "unchecked",
    creationTaskId: creationTask?.id ?? null,
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

  if (traceId) await trySaveCreationDiagnostic({ userId: user.id, userEmail: user.email, traceId, requestId, appSlug: slug, eventType: "prepare_finished", outcome: "201", detail: { workId: work.id } });
  return Response.json({
    ok: true,
    work: {
      id: work.id,
      title: work.title,
    },
  }, { headers: { "x-request-id": requestId } });
}
