import { z } from "zod";
import { requireSessionUser } from "@/lib/auth/session";
import { createProviderVideo, getProviderVideo, listProviderLooks, providerAvailability, publicDigitalHumanError } from "@/lib/digital-human/providers";
import { tryGetSystemSettings } from "@/lib/db/repositories";
import { getDigitalHumanAsset, getDigitalHumanVideoJob, insertDigitalHumanVideoJob, listDigitalHumanAssets, listDigitalHumanVideoJobs, listReadyDigitalHumanBindings, updateDigitalHumanVideoJob } from "@/lib/digital-human/store";
import { enqueueLocalAgentTask, getHeygenAgentAvailability } from "@/lib/local-agent/repository";
import { archiveRemoteVideo } from "@/lib/digital-human/media-assets";
import { requiresXiaoguPostProduction, validateLockedCreativePlan, type DigitalHumanCreativePlan } from "@/lib/digital-human/creative-plan";

const sceneReferenceSchema = z.object({ id: z.string().max(100), name: z.string().max(100), category: z.string().max(60), aspectRatio: z.enum(["9:16", "16:9"]), kind: z.enum(["composition", "visual-style"]), providerStyleId: z.string().max(100).optional() });
const videoTemplateSchema = z.object({ id: z.string().max(100), collection: z.enum(["expressive", "production"]), name: z.string().max(120), category: z.string().max(60), aspectRatio: z.enum(["9:16", "16:9"]), structure: z.array(z.string().max(100)).max(12) });
const creativeSceneSchema = z.object({ id: z.string(), spokenText: z.string(), displayText: z.string(), sourceStart: z.number().int().nonnegative(), sourceEnd: z.number().int().positive(), durationHint: z.number().positive(), presentation: z.enum(["presenter", "presenter-keypoint", "presenter-example"]), overlayText: z.string(), visualDirection: z.string() });
const creativePlanSchema = z.object({ version: z.literal(1), mode: z.literal("smart"), sourceText: z.string(), sourceTextLocked: z.literal(true), sourceTextFingerprint: z.string(), estimatedDuration: z.number().positive(), aspectRatio: z.enum(["9:16", "16:9"]), templateName: z.string(), scenes: z.array(creativeSceneSchema).min(1).max(80) });
const createSchema = z.object({ creationMode: z.enum(["quick", "smart"]).default("quick"), creativePlan: creativePlanSchema.optional(), assetId: z.string().uuid(), edition: z.enum(["standard","pro"]), lookId: z.string().max(200).optional(), title: z.string().trim().min(2).max(100), script: z.string().trim().min(5).max(5000), aspectRatio: z.enum(["9:16", "16:9"]), subtitleEnabled: z.boolean(), voiceId: z.string().max(200).optional(), voiceName: z.string().max(100).optional(), voiceSource: z.enum(["avatar", "public", "creator"]).optional(), backgroundType: z.enum(["original", "color", "url"]).optional(), backgroundColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional(), backgroundUrl: z.string().url().optional().or(z.literal("")), videoTemplate: videoTemplateSchema.optional(), compositionReference: sceneReferenceSchema.extend({ kind: z.literal("composition") }).optional(), visualStyleReference: sceneReferenceSchema.extend({ kind: z.literal("visual-style") }).optional() });

function isPortableBackgroundUrl(value: string) {
  try {
    return /\.(?:jpe?g|png|heic|mp4|mov)$/.test(new URL(value).pathname.toLowerCase());
  } catch {
    return false;
  }
}

const archivingVideoJobs = new Set<string>();

function scheduleVideoArchive(input: { userId: string; assetId: string; jobId: string; url: string; title: string }) {
  if (archivingVideoJobs.has(input.jobId)) return;
  archivingVideoJobs.add(input.jobId);
  void archiveRemoteVideo({ userId: input.userId, digitalHumanId: input.assetId, videoJobId: input.jobId, url: input.url, title: input.title })
    .then((localUrl) => updateDigitalHumanVideoJob(input.userId, input.jobId, { videoUrl: localUrl, request: { archived_by_xiaogu: true, stage: "completed" } }))
    .catch((error) => console.error("[digital-human-video] background archive failed", { jobId: input.jobId, error: error instanceof Error ? error.message : String(error) }))
    .finally(() => archivingVideoJobs.delete(input.jobId));
}

async function refreshJobs(userId: string) {
  const jobs = await listDigitalHumanVideoJobs(userId);
  await Promise.all(jobs.filter((job) => job.status === "processing").map(async (job) => {
    const full = await getDigitalHumanVideoJob(userId, job.id); if (!full?.provider_job_id) return;
    try {
      const remote = await getProviderVideo({ provider: full.provider, jobId: full.provider_job_id });
      const needsPostProduction = full.request_json?.creation_mode === "smart" && requiresXiaoguPostProduction(full.request_json?.creative_plan as DigitalHumanCreativePlan | undefined, { videoTemplate: full.request_json?.video_template, compositionReference: full.request_json?.composition_reference, visualStyleReference: full.request_json?.visual_style_reference });
      if (remote.status === "completed" && remote.videoUrl && needsPostProduction) {
        const task=await enqueueLocalAgentTask({taskType:"xiaogu.video.compose",ownerUserId:userId,dedupeKey:full.id,priority:90,maxAttempts:3,payload:{jobId:full.id,title:full.title,sourceUrl:remote.videoUrl,aspectRatio:full.aspect_ratio,creativePlan:full.request_json?.creative_plan,compositionReference:full.request_json?.composition_reference,visualStyleReference:full.request_json?.visual_style_reference,videoTemplate:full.request_json?.video_template}});
        await updateDigitalHumanVideoJob(userId, full.id, { status: "processing", progress: 72, previewImageUrl: remote.previewImageUrl || undefined, durationSeconds: remote.duration || undefined, errorMessage: null, request: { stage: "composition_queued", presenter_master_ready: true, local_task_id:task.id,smart_execution:"local-agent-worker" } });
      } else {
        await updateDigitalHumanVideoJob(userId, full.id, { status: remote.status, progress: remote.progress, videoUrl: remote.videoUrl || undefined, previewImageUrl: remote.previewImageUrl || undefined, durationSeconds: remote.duration || undefined, errorMessage: remote.error || null, request: remote.status === "completed" ? { archived_by_xiaogu: false, stage: "completed" } : {} });
        if (remote.status === "completed" && remote.videoUrl) scheduleVideoArchive({ userId, assetId: full.asset_id, jobId: full.id, url: remote.videoUrl, title: full.title });
      }
    } catch { /* Retry on next refresh. */ }
  }));
  jobs.filter((job) => job.status === "completed" && /^https?:\/\//.test(job.video_url || "")).forEach((job) => scheduleVideoArchive({ userId, assetId: job.asset_id, jobId: job.id, url: job.video_url!, title: job.title }));
  return listDigitalHumanVideoJobs(userId);
}

export async function GET() {
  const user = await requireSessionUser(); if (user instanceof Response) return user;
  const [assets, jobs, heygenAgent] = await Promise.all([listDigitalHumanAssets(user.id), refreshJobs(user.id), getHeygenAgentAvailability()]);
  const providers = await providerAvailability();
  const publicJobs = jobs.map((job) => ({
    ...job,
    video_url: job.video_url ? `/api/digital-human-videos/${job.id}/media` : null,
    preview_image_url: job.preview_image_url ? `/api/digital-human-videos/${job.id}/media?asset=poster` : null,
  }));
  return Response.json({ assets: assets.filter((asset) => asset.status === "ready"), jobs: publicJobs, providers: { ...providers, heygen: providers.heygen || heygenAgent.available } });
}

export async function POST(request: Request) {
  const user = await requireSessionUser(); if (user instanceof Response) return user;
  const parsed = createSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message || "生成参数不完整" }, { status: 400 });
  if (parsed.data.creationMode === "smart" && (!parsed.data.creativePlan || !validateLockedCreativePlan(parsed.data.creativePlan as DigitalHumanCreativePlan, parsed.data.script))) return Response.json({ error: "视频分镜与锁定口播文案不一致，请重新生成分镜" }, { status: 400 });
  if (parsed.data.creativePlan && parsed.data.creativePlan.aspectRatio !== parsed.data.aspectRatio) return Response.json({ error: "分镜画幅已变化，请重新生成分镜" }, { status: 400 });
  if (parsed.data.backgroundType === "url" && (!parsed.data.backgroundUrl || !isPortableBackgroundUrl(parsed.data.backgroundUrl))) return Response.json({ error: "场景背景请使用 JPG、PNG、HEIC、MP4 或 MOV 的 HTTPS 直链" }, { status: 400 });
  const identity = await getDigitalHumanAsset(user.id, parsed.data.assetId); if (!identity || identity.status !== "ready") return Response.json({ error: "请选择一个已经就绪的数字人" }, { status: 400 });
  const availability=await providerAvailability(); const settings=await tryGetSystemSettings(); const bindings=await listReadyDigitalHumanBindings(user.id,identity.id); const editionBindings=bindings.filter(item=>item.edition===parsed.data.edition); const ordered=parsed.data.creationMode==="smart"&&availability.chanjing?[...editionBindings].sort((a,b)=>Number(b.provider==="chanjing")-Number(a.provider==="chanjing")):settings.digitalHuman.preferredProvider==="auto"?editionBindings:[...editionBindings].sort((a,b)=>Number(b.provider===settings.digitalHuman.preferredProvider)-Number(a.provider===settings.digitalHuman.preferredProvider)); const binding=parsed.data.lookId?ordered.find(item=>item.provider==="heygen"&&availability.heygen):ordered.find(item=>availability[item.provider]&&(item.provider!=="chanjing"||parsed.data.script.length<4000));
  if (!binding) return Response.json({ error: !editionBindings.length ? `这个数字人还没有已启用的${parsed.data.edition==="pro"?" Pro 版":"标准版"}` : editionBindings.some((item) => item.provider === "chanjing") && parsed.data.script.length >= 4000 ? "当前数字人单次口播最多支持 3999 个字符，请拆分后生成" : "所选数字人版本暂时不可用，请稍后再试" }, { status: !editionBindings.length ? 400 : editionBindings.some((item) => item.provider === "chanjing") && parsed.data.script.length >= 4000 ? 400 : 503 });
  const asset=binding?{...identity,provider:binding.provider,provider_avatar_id:binding.remote_avatar_id,provider_group_id:binding.remote_group_id,provider_voice_id:binding.remote_voice_id}:identity;
  if (asset.provider === "chanjing" && parsed.data.backgroundType === "url" && parsed.data.backgroundUrl && !/\.(?:jpe?g|png)$/i.test(new URL(parsed.data.backgroundUrl).pathname)) return Response.json({ error: "当前数字人通道的自定义背景仅支持 JPG 或 PNG 图片" }, { status: 400 });
  if (parsed.data.lookId) { const allowedLooks = await listProviderLooks(asset).catch(() => []); if (!allowedLooks.some((look) => look.id === parsed.data.lookId && look.status === "completed")) return Response.json({ error: "所选人物造型不可用，请刷新后重试" }, { status: 400 }); }
  const job = await insertDigitalHumanVideoJob({ userId: user.id, asset, edition:parsed.data.edition, title: parsed.data.title, script: parsed.data.script, aspectRatio: parsed.data.aspectRatio, subtitleEnabled: parsed.data.subtitleEnabled, voiceId: parsed.data.voiceId, voiceName: parsed.data.voiceName, voiceSource: parsed.data.voiceSource });
  const background = { type: parsed.data.backgroundType || "color", color: parsed.data.backgroundColor || "#F5F2EC", url: parsed.data.backgroundUrl || "" } as const;
  if (asset.provider === "heygen" && parsed.data.creationMode === "quick") {
    const agent = await getHeygenAgentAvailability();
    if (agent.available) {
      const task = await enqueueLocalAgentTask({
        taskType: "heygen.video.generate", ownerUserId: user.id, priority: 80, maxAttempts: 1,
        dedupeKey: job.id,
        payload: { jobId: job.id, title: parsed.data.title, script: parsed.data.script, creationMode: parsed.data.creationMode, creativePlan: parsed.data.creativePlan, aspectRatio: parsed.data.aspectRatio, subtitleEnabled: parsed.data.subtitleEnabled, avatarGroupId: asset.provider_group_id, avatarId: parsed.data.lookId || asset.provider_avatar_id, selectedLookId: parsed.data.lookId, voiceId: parsed.data.voiceId || asset.provider_voice_id, background, compositionReference: parsed.data.compositionReference, visualStyleReference: parsed.data.visualStyleReference, videoTemplate: parsed.data.videoTemplate },
      });
      const updated = await updateDigitalHumanVideoJob(user.id, job.id, { status: "processing", progress: 2, request: { creation_mode: "quick", creative_plan: parsed.data.creativePlan, source_text_locked: false, execution_channel: "codex_subscription", local_task_id: task.id, stage: "queued", background, composition_reference: parsed.data.compositionReference, visual_style_reference: parsed.data.visualStyleReference, video_template: parsed.data.videoTemplate, creative_summary: ["已读取口播文案与数字人资产", parsed.data.videoTemplate ? `已参考「${parsed.data.videoTemplate.name}」的内容结构与画面方向` : "本次采用自由创作", `按${parsed.data.aspectRatio === "9:16" ? "竖屏" : "横屏"}成片规划画面`, parsed.data.compositionReference ? `人物采用「${parsed.data.compositionReference.name}」构图` : "使用自然口播构图", parsed.data.visualStyleReference ? `成片采用「${parsed.data.visualStyleReference.name}」视觉包装` : "不添加额外视觉风格", "已自动选择当前可用生成通道"] } });
      return Response.json({ job: updated }, { status: 202 });
    }
  }
  try { const needsPostProduction=parsed.data.creationMode==="smart"&&requiresXiaoguPostProduction(parsed.data.creativePlan as DigitalHumanCreativePlan|undefined,{videoTemplate:parsed.data.videoTemplate,compositionReference:parsed.data.compositionReference,visualStyleReference:parsed.data.visualStyleReference}); const remote = await createProviderVideo({ asset, title: parsed.data.title, script: parsed.data.script, aspectRatio: parsed.data.aspectRatio, subtitleEnabled: parsed.data.subtitleEnabled, voiceId: parsed.data.voiceId, preferredLookId: parsed.data.lookId, background }); const updated = await updateDigitalHumanVideoJob(user.id, job.id, { status: "processing", progress: 5, providerJobId: remote.jobId, providerSessionId: remote.sessionId || undefined, request: { ...remote.request, creation_mode: parsed.data.creationMode, creative_plan: parsed.data.creativePlan, source_text_locked: parsed.data.creationMode === "smart", render_strategy:needsPostProduction?"provider_plus_xiaogu":"provider_native", smart_execution: needsPostProduction ? "xiaogu-compositor" : undefined, execution_channel: "api", stage: "submitted", selected_look_id: parsed.data.lookId, background, composition_reference: parsed.data.compositionReference, visual_style_reference: parsed.data.visualStyleReference, video_template: parsed.data.videoTemplate, creative_summary: [parsed.data.creationMode === "smart" ? `已锁定原始口播文案，并设计 ${parsed.data.creativePlan?.scenes.length || 0} 个画面段落` : "已读取口播文案与数字人资产", parsed.data.lookId ? "已采用本次选择的人物造型" : "使用数字人默认造型", `按${parsed.data.aspectRatio === "9:16" ? "竖屏" : "横屏"}提交数字人视频`, needsPostProduction ? "原生口播完成后追加分镜与视觉包装" : "由生成通道原生完成，不进行二次转码"] } }); return Response.json({ job: updated }, { status: 202 }); }
  catch (error) {
    const rawMessage = error instanceof Error ? error.message : String(error || "unknown");
    console.error("[digital-human-video] provider submission failed", { jobId: job.id, provider: asset.provider, error: rawMessage.slice(0, 500) });
    const message = publicDigitalHumanError(error,"视频任务提交失败，请稍后重试");
    await updateDigitalHumanVideoJob(user.id, job.id, { status: "failed", errorMessage: message, request: { stage: "submit_failed", failure_category: /鉴权|access.?token|尚未配置/i.test(rawMessage) ? "authentication" : /参数|40000/i.test(rawMessage) ? "invalid_request" : "provider_error" } });
    return Response.json({ error: message, jobId: job.id }, { status: 502 });
  }
}
