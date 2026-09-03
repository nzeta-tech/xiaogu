import { generateImageSet } from "@/lib/agent/image-generator";
import { extractKnowledgeFromReferenceImage } from "@/lib/agent/image-knowledge-extractor";
import { runInsuranceContentAgent, streamInsuranceContentAgent } from "@/lib/agent/insurance-agent";
import { resolveConfiguredTextModel } from "@/lib/agent/model-config";
import { type CreationField } from "@/lib/apps/catalog";
import { getCreationAppBySlug } from "@/lib/apps/catalog";
import { getEntryAdjustedApp } from "@/lib/apps/entry-app";
import { reportUsage } from "@/lib/billing/openmeter";
import { checkCompliance } from "@/lib/compliance/check";
import {
  buildCreationOutputJson,
  isEmptyCreationFieldValue,
  stringifyCreationFieldValue,
  type CreationFieldValue,
} from "@/lib/creation/output";
import { buildWorkTitle } from "@/lib/creation/work-title";
import { buildCreationPromptContext } from "@/lib/creation/prompt-context";
import { buildPolicyRenewalImagePrompt } from "@/lib/creation/policy-renewal-card";
import {
  buildLeadCopyPrompt,
  getMultiChannelCopyStyleMode,
  getMultiChannelCopyVariant,
  isMultiChannelCopyAppSlug,
} from "@/lib/creation/lead-copy";
import { buildXiaohongshuCheckPrompt } from "@/lib/creation/xiaohongshu-check";
import { buildWechatSectionImagePrompts } from "@/lib/creation/wechat-article-images";
import {
  tryCompleteAppRun,
  tryCreateAppRun,
  tryAttachWorkAppRun,
  tryGetCreationAppBySlug,
  tryGetWorkDetail,
  tryGetLatestThinkingProfileSnapshot,
  tryMergeWechatStudioAssets,
  tryMergeXiaohongshuStudioAssets,
  trySaveUsageLog,
  tryUpdateWorkContent,
} from "@/lib/db/repositories";
import { buildThinkingProfileBrief, type ThinkingProfileSnapshot, type ThinkingProfileSummary } from "@/lib/thinking/profile-snapshot";
import { logAvatarVisualUsage, resolveAvatarVisualReferences } from "@/lib/avatar/visual-assets";
import { buildCreativeCoachSkillRoutePrompt, parseCreativeCoachSkillRoute, renderCreativeCoachPersona, renderCreativeCoachSkill, renderProgressivelyLoadedCreativeCoachSkills, renderSelectedCreativeCoachMethods, resolveCreativeCoachRuntime, type CreativeCoachRuntime } from "@/lib/avatar/creative-coach-runtime";
import { getCreationUserError, isRetryableCreationError } from "@/lib/creation/errors";
import { creationNeedsAvatarPhoto } from "@/lib/creation/avatar-visual-input";
import { buildLinkRemixResearchContext } from "@/lib/creation/link-remix-research";
import { buildTrafficEvidencePackFromFastResearch, buildTrafficMaterialBriefPrompt, formatTrafficEvidencePack, formatTrafficMaterialBrief, parseTrafficMaterialBrief, type TrafficEvidencePack } from "@/lib/creation/traffic-copy-evidence";
import { runFastResearch } from "@/lib/workbuddy/fast-research";
import { isTrafficCoverParentWork } from "@/lib/creation/traffic-cover-parent";
import { buildPersistedCreatorStyleText, type CreatorStyleResult } from "@/lib/creation/creator-style-result";
import {
  authorityForTrafficTask,
  buildTrafficCopyAuditPrompt,
  buildTrafficCopyCreativeBriefPrompt,
  buildTrafficCopyRevisionPrompt,
  buildTrafficCopyWritingPrompt,
  buildTrafficSourceBlueprintPrompt,
  estimateTrafficSpeakingRate,
  fallbackTrafficSourceBlueprint,
  fallbackTrafficCopyCreativeBrief,
  parseTrafficCopyAudit,
  parseTrafficCopyCreativeBrief,
  parseTrafficSourceBlueprint,
  measureTrafficExpressionSimilarity,
  normalizeTrafficBriefForSource,
  sanitizeTrafficNarrativeIdentity,
  mergeTrafficSourceBlueprint,
  type TrafficAuthority,
  type TrafficCopyAudit,
  type TrafficCopyCreativeBrief,
  type TrafficSourceBlueprint,
} from "@/lib/creation/traffic-copy-architecture";
import { buildRemixStudioSource } from "@/lib/creation/remix-studio-source";
import { normalizeImageCardStyles } from "@/lib/creation/image-card-styles";
import { normalizeRemixCapability, remixCapabilityLabel } from "@/lib/creation/capabilities";
import { adaptRemixCapabilityInput, buildPendingRemixContentJson, getRemixCapabilityDefinition, getRemixResultMeta } from "@/lib/creation/remix-capability-registry";
import { parseSelectedTrafficTopics, trafficTopicGenerationContext, type TrafficTopicCandidate } from "@/lib/creation/traffic-topic-arena";
import { runTrafficTopicAnalysis } from "@/lib/creation/traffic-topic-analysis";
import { applyPortfolioDuration, buildTrafficPortfolioPlanPrompt, parseTrafficPortfolioPlan, portfolioUnitContext, type TrafficPortfolioPlan } from "@/lib/creation/traffic-copy-portfolio";

type FieldValue = CreationFieldValue;

export class RetryableCreationRunError extends Error {
  readonly retryable = true;

  constructor(message: string) {
    super(message);
    this.name = "RetryableCreationRunError";
  }
}

export async function executeCreationAppRun(input: {
  slug: string;
  userId: string;
  values: Record<string, FieldValue>;
  workId?: string | null;
  quotaCost: number;
  existingRunId?: string | null;
  onEvent?: (payload: {
    type: "meta" | "progress" | "delta" | "images" | "done" | "error";
    runId?: string | null;
    content?: string;
    work?: { id?: string; title?: string } | null;
    images?: Array<{ id: string; url: string }>;
    imageMode?: string | null;
    retryable?: boolean;
    phase?: string;
    status?: "active" | "completed";
    label?: string;
    detail?: string;
    coachId?: string | null;
    coachLabel?: string | null;
  }) => void | Promise<void>;
}) {
  // The request has already resolved the catalog entry. Do not reconcile the
  // entire catalog again before emitting the app-run id and first progress
  // event; that turns background startup into a long synchronous DB migration.
  const app = (await tryGetCreationAppBySlug(input.slug)) ?? getCreationAppBySlug(input.slug);
  if (!app) {
    throw new Error("应用不存在");
  }
  const entry = typeof input.values?.app_entry === "string" ? input.values.app_entry.trim() : "";
  const effectiveApp = getEntryAdjustedApp(app, entry);
  const values = input.values ?? {};

  const needsThinkingSnapshot = effectiveApp.requiresThinking || app.slug === "link-remix" && normalizeRemixCapability(values.remix_target) === "moments";
  const thinkingSnapshot = needsThinkingSnapshot ? await tryGetLatestThinkingProfileSnapshot(input.userId) : null;
  if (effectiveApp.requiresThinking && !thinkingSnapshot) {
    throw new Error("这个应用需要先完成思维问卷，再生成更像你的内容。");
  }

  const studioParent = stringifyCreationFieldValue(values.studio_parent);
  const isWechatStudioAssetStep = studioParent === "wechat-studio" && (app.slug === "wechat-images" || app.slug === "wechat-cover");
  const isXiaohongshuStudioAssetStep = studioParent === "xiaohongshu-studio" && (app.slug === "wechat-images" || app.slug === "wechat-cover");
  const isPolicyRenewalCard = app.slug === "policy-renewal-card";
  const missingField = effectiveApp.fields.find((field) => field.required && isEmptyCreationFieldValue(values[field.id]));
  if (missingField) {
    throw new Error(`${missingField.label}还没有填写。`);
  }
  if (isPolicyRenewalCard && stringifyCreationFieldValue(values.confirmation) !== "confirmed") {
    throw new Error("请先确认已经核对日期、金额、币种和保单号。");
  }
  const visualAssetIds = Array.isArray(values.avatar_visual_asset_ids) ? values.avatar_visual_asset_ids.filter(Boolean).slice(0, isPolicyRenewalCard ? 1 : 4) : [];
  const needsAvatarPhoto = creationNeedsAvatarPhoto({ appSlug: app.slug, entry, values, isXiaohongshuStudioAssetStep });
  const isImageCardRemix = app.slug === "image-card" && stringifyCreationFieldValue(values.creation_mode) === "image_remix";
  if (needsAvatarPhoto && visualAssetIds.length === 0 && (isImageCardRemix ? isEmptyCreationFieldValue(values.portrait_reference_image) : isEmptyCreationFieldValue(values.reference_image))) {
    throw new Error("请选择数字分身形象照，或临时上传一张形象照。");
  }

  const caseContext = buildCreationPromptContext(app, entry);
  const linkRemixResearch = app.slug === "link-remix" ? await buildLinkRemixResearchContext(values) : "";
  const remixDefinition = app.slug === "link-remix" ? getRemixCapabilityDefinition(values.remix_target) : null;
  const remixTargetApp = remixDefinition ? await tryGetCreationAppBySlug(remixDefinition.appSlug) : null;
  const remixTargetContext = remixDefinition ? buildCreationPromptContext(remixDefinition.appSlug) : caseContext;

  const basePrompt = isPolicyRenewalCard
    ? "保单续费提醒卡使用服务端模板精确排版，客户与保单字段不发送给图片模型。"
    : app.slug === "write-copy"
    ? buildWriteCopyPrompt(values, caseContext, thinkingSnapshot?.snapshot_json ?? null, thinkingSnapshot?.summary_json ?? null)
    : isMultiChannelCopyAppSlug(app.slug)
      ? buildLeadCopyPrompt(effectiveApp.fields, values, effectiveApp.promptHint, caseContext, getMultiChannelCopyVariant(app.slug))
    : app.slug === "general-content"
      ? buildGeneralContentPrompt(values, caseContext, effectiveApp.promptHint)
    : app.slug === "link-remix"
      ? buildLinkRemixPrompt(values, remixTargetContext, remixTargetApp?.promptHint ?? "", linkRemixResearch, thinkingSnapshot?.snapshot_json ?? null, thinkingSnapshot?.summary_json ?? null)
    : app.slug === "traffic-copy"
      ? buildTrafficCopyPrompt(values, caseContext, effectiveApp.promptHint)
    : app.slug === "xiaohongshu-check"
      ? buildXiaohongshuCheckPrompt(values, caseContext, effectiveApp.promptHint)
    : app.slug === "video-script-polish"
      ? buildVideoScriptPolishPrompt(values, caseContext, effectiveApp.promptHint)
    : app.slug === "live-script"
      ? buildLiveScriptPrompt(values, caseContext, effectiveApp.promptHint)
    : app.slug === "letter"
      ? buildLetterPrompt(values, caseContext, effectiveApp.promptHint)
      : app.slug === "wechat-studio"
        ? buildWechatStudioPrompt(values, caseContext)
      : app.slug === "xiaohongshu-studio"
        ? buildXiaohongshuStudioPrompt(values, caseContext)
      : app.slug === "topic-picker"
        ? buildTopicPickerPrompt(values, caseContext, effectiveApp.promptHint, thinkingSnapshot?.snapshot_json ?? null, thinkingSnapshot?.summary_json ?? null)
      : values.source && typeof values.source === "string"
        ? [
            ...caseContext,
            effectiveApp.promptHint,
            values.source,
          ].filter(Boolean).join("\n\n")
        : `${effectiveApp.name}\n${caseContext.join("\n")}${caseContext.length > 0 ? "\n" : ""}${effectiveApp.promptHint}\n${effectiveApp.fields.map((field) => `${field.label}：${stringifyCreationFieldValue(values[field.id])}`).join("\n")}`;
  const isTrafficRequested = app.slug === "traffic-copy" || app.slug === "link-remix" && normalizeRemixCapability(values.remix_target) === "traffic-copy";
  const isTrafficTopicOnly = isTrafficRequested && stringifyCreationFieldValue(values.traffic_topic_only) === "yes";
  const selectedCreativeCoachIds = isTrafficRequested
    ? [...new Set((Array.isArray(values.creative_coach_version_ids) ? values.creative_coach_version_ids : [stringifyCreationFieldValue(values.creative_coach_version_id)]).filter((id): id is string => typeof id === "string" && Boolean(id)))].slice(0, 3)
    : [];
  const requestedCreativeCoachIds = selectedCreativeCoachIds.filter((id) => id !== "default");
  const creativeCoachRuntimes = await Promise.all(requestedCreativeCoachIds.map((id) => resolveCreativeCoachRuntime(input.userId, id)));
  const runtimeById = new Map(creativeCoachRuntimes.filter((runtime): runtime is NonNullable<typeof runtime> => Boolean(runtime)).map((runtime) => [runtime.id, runtime]));
  type SelectedCreativeCoachStyle = { id: string; label: string; researchSkill: string; briefSkill: string; writingSkill: string; runtime: CreativeCoachRuntime | null };
  const creatorStyles: SelectedCreativeCoachStyle[] = selectedCreativeCoachIds.length
    ? selectedCreativeCoachIds.flatMap<SelectedCreativeCoachStyle>((id) => {
        if (id === "default") return [{ id: "default", label: "小谷教练", researchSkill: "", briefSkill: "", writingSkill: "", runtime: null }];
        const runtime = runtimeById.get(id);
        return runtime ? [{ id: runtime.id, label: runtime.label, researchSkill: renderCreativeCoachSkill(runtime, "research"), briefSkill: renderCreativeCoachSkill(runtime, "brief"), writingSkill: [renderCreativeCoachSkill(runtime, "writing"),renderCreativeCoachPersona(runtime) ? `【Persona参考】\n${renderCreativeCoachPersona(runtime)}` : "",`【创作者称谓参考】${runtime.skillModules.persona?.identity || runtime.label.replace(/教练.*$/u, "")}`].filter(Boolean).join("\n\n"), runtime }] : [];
      })
    : [{ id: "default", label: "小谷教练", researchSkill: "", briefSkill: "", writingSkill: "", runtime: null }];
  const buildCreatorStylePrompt = (style: { writingSkill: string }) => style.writingSkill
    ? isTrafficRequested
      ? `${basePrompt}\n\n【本次选用的创作教练】\n${style.writingSkill}\n\n由教练结合搜索素材自然决定切口、结构、判断和表达。`
      : `${basePrompt}\n\n【本次选用的创作教练】\n${style.writingSkill}\n\n【执行优先级】\n1. 事实准确性、素材边界与合规要求最高。\n2. 教练的内容创作能力决定主要创作结构、句式、节奏和表达气质。\n不得照抄训练作品中的具体句子、案例或事实。`
    : basePrompt;
  const prompt = buildCreatorStylePrompt(creatorStyles[0]);
  const referenceKnowledge = app.slug === "image-card" && stringifyCreationFieldValue(values.creation_mode) === "image_remix"
    ? await extractKnowledgeFromReferenceImage(values.reference_image)
    : "";
  const imageCardStyles = app.slug === "image-card" ? normalizeImageCardStyles(values.style) : [];
  const buildImageCardStylePrompt = (style: string) => buildImagePrompt(
    effectiveApp.name,
    effectiveApp.fields,
    { ...values, style },
    caseContext,
    effectiveApp.promptHint,
    referenceKnowledge,
  );
  const imagePrompt = effectiveApp.resultType === "image" || effectiveApp.resultType === "image-plan"
    ? isPolicyRenewalCard
      ? buildPolicyRenewalImagePrompt(values)
      : app.slug === "video-cover"
        ? buildVideoCoverPrompt(values, caseContext, effectiveApp.promptHint)
      : imageCardStyles.length
        ? buildImageCardStylePrompt(imageCardStyles[0])
        : buildImagePrompt(effectiveApp.name, effectiveApp.fields, values, caseContext, effectiveApp.promptHint, referenceKnowledge)
    : null;
  const imageCardVariantPrompts = imageCardStyles.length ? imageCardStyles.map(buildImageCardStylePrompt) : undefined;
  // `wechat-images` also powers the Xiaohongshu studio's chapter cards.  A
  // shared prompt produces near-duplicate variations, so derive one prompt
  // per section before asking the image model for a set.
  const sectionImagePlan = app.slug === "wechat-images"
    ? buildWechatSectionImagePrompts(stringifyCreationFieldValue(values.article), imagePrompt ?? "", 5)
    : null;
  const resolvedPrompt = imagePrompt ?? prompt;
  const topicSourceTitle = stringifyCreationFieldValue(values.source).replace(/\s+/g, " ").trim().slice(0, 32) || "新素材";
  const pendingTitle = isTrafficTopicOnly
    ? `选题分析｜${topicSourceTitle}`
    : buildWorkTitle({
    appName: effectiveApp.name,
    appSlug: app.slug,
    values,
    result: null,
  });

  const run = input.existingRunId
    ? { id: input.existingRunId, created_at: "" }
    : await tryCreateAppRun({
        userId: input.userId,
        appCode: app.slug,
        tone: app.slug === "write-copy"
          ? stringifyCreationFieldValue(values.tone) || "self"
          : isMultiChannelCopyAppSlug(app.slug)
            ? stringifyCreationFieldValue(values.tone)
            : "",
        targetChannels: Array.isArray(values.targets) ? values.targets : [],
        inputPayload: values,
        resolvedPrompt,
        quotaCost: input.quotaCost,
        model: isPolicyRenewalCard
          ? process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1"
          : effectiveApp.resultType === "image"
          ? process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1"
          : resolveConfiguredTextModel(),
      });

  if (!input.existingRunId && input.workId && run?.id) {
    if (isWechatStudioAssetStep || isXiaohongshuStudioAssetStep) {
      // Asset runs are children of the article. They must never become the
      // work's primary run or replace the durable article draft.
    } else if (app.slug === "wechat-studio") {
      await tryAttachWorkAppRun({ userId: input.userId, workId: input.workId, appRunId: run.id });
    } else {
      await tryUpdateWorkContent({
        userId: input.userId,
        workId: input.workId,
        appRunId: run.id,
        title: pendingTitle,
        content: "",
        contentJson: app.slug === "link-remix"
          ? buildPendingRemixContentJson(values)
          : app.slug === "xiaohongshu-studio"
            ? { batches: [], xiaohongshuStudioState: { topic: stringifyCreationFieldValue(values.topic), creationMode: stringifyCreationFieldValue(values.creation_mode), lengthMode: stringifyCreationFieldValue(values.length_mode), content: "" } }
            : { batches: [] },
      });
    }
  }

  await input.onEvent?.({ type: "meta", runId: run?.id ?? null });
  if (app.slug === "traffic-copy") {
    await input.onEvent?.({
      type: "progress",
      phase: "task_started",
      status: "active",
      label: "任务已启动",
      detail: "正在读取素材并准备教练创作流程。",
    });
  }

  let result = "";
  let resultJson: Record<string, unknown> | undefined;

  try {
    if (isTrafficTopicOnly) {
      const analysis = await runTrafficTopicAnalysis({
        slug: app.slug,
        userId: input.userId,
        values,
        onProgress: (event) => input.onEvent?.({ type:"progress",...event }),
      });
      result = ["选题分析完成",...analysis.topics.map((topic,index)=>`${index+1}. ${topic.title}`)].join("\n\n");
      resultJson = {
        trafficTopicArena: analysis,
        contentJson: { plainText:result,batches:[] },
      };
      await input.onEvent?.({type:"delta",content:result});
    } else if (effectiveApp.resultType === "image" || effectiveApp.resultType === "image-plan") {
      const visualReferences = await resolveAvatarVisualReferences({
        userId: input.userId,
        assetIds: visualAssetIds,
        appSlug: entry === "personality-card" ? "personality-card" : isXiaohongshuStudioAssetStep ? "image-card" : app.slug,
      });
      if (needsAvatarPhoto && visualAssetIds.length > 0 && visualReferences.length === 0) {
        throw new Error("数字分身形象照当前不可用，请检查隐私设置、照片状态和使用范围。");
      }
      const imageResult =
        effectiveApp.resultType === "image"
          ? await generateImageSet({
              prompt: imagePrompt ?? "",
              style: imageCardStyles.length ? imageCardStyles.join("、") : stringifyCreationFieldValue(values.style) || app.name,
              ratio: stringifyCreationFieldValue(values.ratio) || (app.slug === "wechat-images" ? "3:4" : "1:1"),
              count: sectionImagePlan?.prompts.length ?? (imageCardStyles.length || (isPolicyRenewalCard || app.slug !== "wechat-images" ? 1 : 4)),
              variantPrompts: sectionImagePlan?.prompts ?? imageCardVariantPrompts,
              // For image remix, the source card must stay the primary image;
              // avatar references only define the optional inserted person.
              referenceImages: isImageCardRemix
                ? [...extractReferenceImages(values), ...visualReferences.map((item) => item.dataUrl)].slice(0, 4)
                : [...visualReferences.map((item) => item.dataUrl), ...extractReferenceImages(values)].slice(0, 4),
            })
          : null;

      result =
        effectiveApp.resultType === "image"
          ? imageResult?.summary ?? buildImagePlan(app.name, app.fields, values, caseContext, app.promptHint)
          : buildImagePlan(app.name, app.fields, values, caseContext, app.promptHint);
      resultJson = {
        contentJson: buildCreationOutputJson(result, []),
        images: imageResult?.images ?? [],
        imageMode: imageResult?.mode ?? null,
        imageStyles: imageCardStyles,
        retryable: imageResult?.retryable ?? false,
        avatarVisualAssetIds: visualReferences.map((item) => item.id),
      };

      await input.onEvent?.({ type: "delta", content: result });
      await input.onEvent?.({
        type: "images",
        images: imageResult?.images ?? [],
        imageMode: imageResult?.mode ?? null,
        retryable: imageResult?.retryable ?? false,
      });

      if (effectiveApp.resultType === "image" && imageResult?.mode !== "image" && (imageResult?.images?.length ?? 0) === 0) {
        const errorMessage = imageResult?.retryable
          ? "图片生成失败，当前上游服务繁忙或超时，请稍后重试。"
          : "图片生成失败，请稍后重试。";
        throw imageResult?.retryable ? new RetryableCreationRunError(errorMessage) : new Error(errorMessage);
      }
    } else {
      const styleMode = app.slug === "write-copy" || remixDefinition?.id === "moments"
        ? "general"
        : getMultiChannelCopyStyleMode(remixDefinition?.appSlug ?? app.slug);
      const creatorStyleResults: CreatorStyleResult[] = [];
      // A full multi-channel run can contain ten publishable pieces, including
      // two long-form articles. Generate each channel separately so a model's
      // per-response output cap cannot leave the result at only the first
      // channel (normally the video scripts).
      const isTrafficExecution = app.slug === "traffic-copy" || remixDefinition?.id === "traffic-copy";
      const trafficCreativeBriefs: TrafficCopyCreativeBrief[] = [];
      const trafficEvidencePacks: TrafficEvidencePack[] = [];
      let sharedTrafficEvidencePack: TrafficEvidencePack | null = null;
      const trafficContexts: string[][] = [];
      const trafficSkillRoutes: Array<ReturnType<typeof parseCreativeCoachSkillRoute> | null> = [];
      const trafficAudits: Array<{ first: TrafficCopyAudit; final: TrafficCopyAudit; revised: boolean }> = [];
      const trafficExecutions: Array<Record<string, unknown>> = [];
      const selectedTrafficTopics = isTrafficExecution ? parseSelectedTrafficTopics(values.traffic_selected_topics) : [];
      const precomputedTrafficResearch = isTrafficExecution
        ? stringifyCreationFieldValue(values.traffic_shared_research).trim().slice(0, 60_000)
        : "";
      const precomputedTrafficEvidencePack = isTrafficExecution
        ? parseSharedTrafficEvidencePack(stringifyCreationFieldValue(values.traffic_shared_evidence_pack))
        : null;
      const precomputedTrafficTopicProcess = isTrafficExecution
        ? parseTrafficTopicProcess(stringifyCreationFieldValue(values.traffic_topic_process))
        : null;
      let trafficPortfolioPlan: TrafficPortfolioPlan | null = null;
      const trafficBlueprints: TrafficSourceBlueprint[] = [];
      const trafficPromptStyles: typeof creatorStyles = [];
      const trafficPromptTopics: Array<TrafficTopicCandidate | null> = [];
      let trafficSourceBlueprint: TrafficSourceBlueprint | null = null;
      let trafficAuthority: TrafficAuthority | null = null;
      let prompts: string[];
      if (app.slug === "write-copy") {
        prompts = buildWriteCopyChannelPrompts(values, caseContext, thinkingSnapshot?.snapshot_json ?? null, thinkingSnapshot?.summary_json ?? null);
      } else if (isTrafficExecution) {
        const source = app.slug === "link-remix"
          ? buildRemixStudioSource(values)
          : stringifyCreationFieldValue(values.source);
        if (app.slug === "traffic-copy") {
          await input.onEvent?.({ type:"progress",phase:"task_started",status:"completed",label:"任务准备完成",detail:"素材和所选教练已经就绪。" });
        }
        await input.onEvent?.({ type:"progress",phase:"source_understanding",status:"active",label:"正在理解素材",detail:"识别主题、人物、事件、矛盾和可展开的内容方向。" });
        trafficSourceBlueprint = fallbackTrafficSourceBlueprint(source);
        try {
          const rawBlueprint = await runInsuranceContentAgent(
            [{ role: "user", content: buildTrafficSourceBlueprintPrompt(source) }],
            input.userId,
            "traffic",
            { creatorContextMode:"none" },
          );
          trafficSourceBlueprint = parseTrafficSourceBlueprint(rawBlueprint, source);
        } catch {
          // The deterministic fallback still preserves an explicit task mode and source boundary.
        }
        trafficAuthority = authorityForTrafficTask(trafficSourceBlueprint.taskMode);
        await input.onEvent?.({ type:"progress",phase:"source_understanding",status:"completed",label:"素材理解完成",detail:"已经整理核心观点、必要论据和发布边界。" });
        let sharedTrafficResearch = "";
        try {
          let rawSearchMaterials = precomputedTrafficResearch;
          if (rawSearchMaterials) {
            sharedTrafficEvidencePack = precomputedTrafficEvidencePack;
            await input.onEvent?.({ type:"progress",phase:"fast_research",status:"completed",label:"选题资料已复用",detail:"正在复用选题阶段集中搜索形成的素材池，不再重复联网检索。" });
          } else {
            await input.onEvent?.({ type:"progress",phase:"fast_research",status:"active",label:"正在集中搜索资料",detail:"本次没有选题研究包，将执行一次最多 6 个问题的兜底搜索。" });
            const fastResearch = await runFastResearch({
              objective: `为口播创作补充公开事实、争议和创作判断：${trafficSourceBlueprint.originalThesis || source.slice(0, 180)}`,
              context: [
                `【来源内容蓝图】\n${JSON.stringify(trafficSourceBlueprint)}`,
                `【原始素材】\n${source}`,
                "按相关性覆盖当前事件、历史背景、具体安排、人物说法或动机、争议观点、结果影响；不要重复搜索。",
              ].join("\n\n"),
              userId: input.userId,
              maxQueries: 6,
            });
            sharedTrafficEvidencePack = await buildTrafficEvidencePackFromFastResearch(source, fastResearch);
            rawSearchMaterials = formatTrafficEvidencePack(sharedTrafficEvidencePack);
            await input.onEvent?.({ type:"progress",phase:"fast_research",status:"completed",label:"资料搜索完成",detail:`已完成 ${fastResearch.trace.queries.length} 个检索问题，形成统一创作素材池。` });
          }
          sharedTrafficResearch = rawSearchMaterials;
          await input.onEvent?.({ type:"progress",phase:"material_synthesis",status:"active",label:"正在整理创作材料",detail:"把核验结果压缩成可用于写作的事实、背景和边界。" });
          try {
            const rawBrief = await runInsuranceContentAgent([{ role: "user", content: buildTrafficMaterialBriefPrompt(source, rawSearchMaterials) }], input.userId, "traffic", { creatorContextMode:"none" });
            sharedTrafficResearch = formatTrafficMaterialBrief(parseTrafficMaterialBrief(rawBrief), sharedTrafficEvidencePack?.topicMaterials ?? []);
          } catch {
            // The structured evidence pack remains usable if material editing fails.
          }
          await input.onEvent?.({ type:"progress",phase:"material_synthesis",status:"completed",label:"创作材料整理完成",detail:"已整理事件背景、人物关系、争议、细节和可展开方向。" });
          // Broad topic requests only become a stable content blueprint after
          // research has selected one concrete angle. Rebuild the blueprint so
          // the selected mechanism is a required asset, not optional context.
          await input.onEvent?.({ type:"progress",phase:"angle_refinement",status:"active",label:"正在确定核心切入角度",detail:"结合最新材料确认这篇内容必须回答的问题和叙事主线。" });
          try {
            const researchedBlueprint = await runInsuranceContentAgent(
              [{ role: "user", content: buildTrafficSourceBlueprintPrompt(source, sharedTrafficResearch) }],
              input.userId,
              "traffic",
              { creatorContextMode:"none" },
            );
            trafficSourceBlueprint = mergeTrafficSourceBlueprint(trafficSourceBlueprint, parseTrafficSourceBlueprint(researchedBlueprint, source));
            trafficAuthority = authorityForTrafficTask(trafficSourceBlueprint.taskMode);
          } catch {
            // Keep the source-only blueprint if the researched rebuild fails.
          }
          await input.onEvent?.({ type:"progress",phase:"angle_refinement",status:"completed",label:"核心切入角度已确定",detail:"事件背景、核心问题和创作主线已经就绪。" });
        } catch {
          // Search is supplemental. Creation can continue from the source blueprint.
          await input.onEvent?.({ type:"progress",phase:"fast_research",status:"completed",label:"资料准备完成",detail:"公开搜索暂未返回补充材料，将根据现有素材继续创作。" });
        }
        if (selectedTrafficTopics.length > 1) {
          await input.onEvent?.({type:"progress",phase:"portfolio_planning",status:"active",label:"正在规划多选题分工",detail:"为每篇确定独家任务、内容形式和自然时长，避免重复讲同一套背景。"});
          try {
            const rawPlan=await runInsuranceContentAgent([{role:"user",content:buildTrafficPortfolioPlanPrompt(selectedTrafficTopics)}],input.userId,"traffic",{creatorContextMode:"positioning"});
            trafficPortfolioPlan=parseTrafficPortfolioPlan(rawPlan,selectedTrafficTopics);
          } catch {
            trafficPortfolioPlan=parseTrafficPortfolioPlan("",selectedTrafficTopics);
          }
          await input.onEvent?.({type:"progress",phase:"portfolio_planning",status:"completed",label:"多选题分工完成",detail:trafficPortfolioPlan.overlapWarnings.length?`发现 ${trafficPortfolioPlan.overlapWarnings.length} 处潜在重复，已写入各篇分工。`:"每篇已经获得不同的内容任务。"});
        }
        prompts = [];
        const topicUnits: Array<TrafficTopicCandidate | null> = selectedTrafficTopics.length ? selectedTrafficTopics : [null];
        for (const topic of topicUnits) for (const style of topic?.assignedCoachId ? creatorStyles.filter((candidate)=>candidate.id===topic.assignedCoachId) : creatorStyles) {
          const topicContext = topic ? [trafficTopicGenerationContext(topic),portfolioUnitContext(trafficPortfolioPlan,topic.id)].filter(Boolean).join("\n\n") : "";
          const unitSource = topic ? `${source}\n\n${topicContext}` : source;
          const unitBlueprint = topic ? parseTrafficSourceBlueprint(JSON.stringify({
            ...trafficSourceBlueprint,
            originalThesis: topic.workingThesis,
            attentionReason: topic.humanTension,
            entryMode: "反差",
            entryContent: topic.hookPromise,
            intendedMindShift: topic.workingThesis,
            contentAssets: [
              { id: `selected-${topic.id}`, kind: "thesis", meaning: topic.workingThesis, function: `回答：${topic.coreQuestion}`, importance: "required", sourceStatus: "source", mayReframe: false },
              ...trafficSourceBlueprint.contentAssets.filter((item) => item.kind !== "thesis"),
            ],
          }), unitSource) : trafficSourceBlueprint;
          await input.onEvent?.({ type:"progress",phase:`coach_decision:${style.id}`,status:"active",label:`${style.label}正在确定表达方向`,detail:"判断受众入口、核心观点和本题真正需要的方法。",coachId:style.id,coachLabel:style.label });
          const trafficContext = [
            ...(remixDefinition ? remixTargetContext : caseContext),
            app.slug === "link-remix" ? linkRemixResearch : "",
            sharedTrafficResearch,
            topicContext,
          ].filter(Boolean);
          trafficContexts.push(trafficContext);
          trafficBlueprints.push(unitBlueprint);
          trafficPromptStyles.push(style);
          trafficPromptTopics.push(topic);
          let progressivelyLoadedSkills = "";
          let skillRoute: ReturnType<typeof parseCreativeCoachSkillRoute> | null = null;
          if (style.runtime) {
            try {
              const rawRoute = await runInsuranceContentAgent([{ role: "user", content: buildCreativeCoachSkillRoutePrompt(style.runtime, unitBlueprint.taskProfile) }], input.userId, "traffic", { creatorContextMode:"none" });
              skillRoute = parseCreativeCoachSkillRoute(rawRoute, style.runtime);
              progressivelyLoadedSkills = renderProgressivelyLoadedCreativeCoachSkills(style.runtime, skillRoute);
            } catch { /* Zero-method fallback is valid and safer than loading the entire library. */ }
          }
          trafficSkillRoutes.push(skillRoute);
          const briefPrompt = buildTrafficCopyCreativeBriefPrompt({
            source: unitSource,
            creatorSkill: [style.briefSkill, progressivelyLoadedSkills ? `【渐进加载的候选Skill｜候选不等于必须使用】\n${progressivelyLoadedSkills}` : "【渐进加载结果】本题没有需要展开的方法卡，允许零方法完成。"].filter(Boolean).join("\n\n"),
            context: trafficContext,
            promptHint: remixTargetApp?.promptHint ?? effectiveApp.promptHint,
            blueprint: unitBlueprint,
            authority: trafficAuthority,
          });
          let creativeBrief: TrafficCopyCreativeBrief;
          try {
            const rawBrief = await runInsuranceContentAgent([{ role: "user", content: briefPrompt }], input.userId, "traffic", { creatorContextMode:"writing" });
            creativeBrief = parseTrafficCopyCreativeBrief(rawBrief);
          } catch {
            creativeBrief = fallbackTrafficCopyCreativeBrief(unitSource);
          }
          const routedIds = skillRoute && style.runtime
            ? new Set([...skillRoute.strategySkillIds,...skillRoute.candidateMethodIds].flatMap((id) => {
                const method = style.runtime?.skillModules.discoveredMethods?.find((item) => item.key === id);
                return [id,method?.name ?? ""].filter(Boolean);
              }))
            : new Set<string>();
          creativeBrief = normalizeTrafficBriefForSource(creativeBrief, unitSource, routedIds);
          creativeBrief = applyPortfolioDuration(creativeBrief, topic ? trafficPortfolioPlan?.units.find((item)=>item.topicId===topic.id) : undefined);
          await input.onEvent?.({ type:"progress",phase:`coach_decision:${style.id}`,status:"completed",label:`${style.label}已确定创作方向`,detail:creativeBrief.workingThesis ? `核心方向：${creativeBrief.workingThesis.slice(0, 80)}` : "已确定内容入口、论证顺序和收束方式。",coachId:style.id,coachLabel:style.label });
          trafficCreativeBriefs.push(creativeBrief);
          const selectedMethodCards = style.runtime ? renderSelectedCreativeCoachMethods(style.runtime, creativeBrief.selectedMethods.map((item) => item.methodId)) : "";
          prompts.push(buildTrafficCopyWritingPrompt({
            source: unitSource,
            creatorSkill: [style.writingSkill, selectedMethodCards ? `【本题获准使用的方法卡】\n${selectedMethodCards}` : ""].filter(Boolean).join("\n\n"),
            context: trafficContext,
            promptHint: remixTargetApp?.promptHint ?? effectiveApp.promptHint,
            brief: creativeBrief,
            blueprint: unitBlueprint,
            authority: trafficAuthority,
          }));
        }
      } else {
        prompts = [prompt];
      }

      for (const [promptIndex, channelPrompt] of prompts.entries()) {
        let currentOutput = "";
        if (isTrafficExecution) {
          const baseSource = app.slug === "link-remix" ? buildRemixStudioSource(values) : stringifyCreationFieldValue(values.source);
          const topic = trafficPromptTopics[promptIndex];
          const source = topic ? `${baseSource}\n\n${trafficTopicGenerationContext(topic)}` : baseSource;
          const blueprint = trafficBlueprints[promptIndex] ?? trafficSourceBlueprint ?? fallbackTrafficSourceBlueprint(source);
          const brief = trafficCreativeBriefs[promptIndex] ?? fallbackTrafficCopyCreativeBrief(source);
          const auditAuthority = trafficAuthority ?? authorityForTrafficTask(blueprint.taskMode);
          const style = trafficPromptStyles[promptIndex] ?? creatorStyles[promptIndex];
          await input.onEvent?.({ type:"progress",phase:`writing:${style?.id ?? promptIndex}`,status:"active",label:`${style?.label ?? "教练"}正在生成正文`,detail:"正在把创作决策写成完整、可独立录制的口播。",coachId:style?.id,coachLabel:style?.label });
          const draftV1 = sanitizeTrafficNarrativeIdentity((await runInsuranceContentAgent([{ role: "user", content: channelPrompt }], input.userId, "traffic", { creatorContextMode:"writing" })).trim());
          await input.onEvent?.({ type:"progress",phase:`writing:${style?.id ?? promptIndex}`,status:"completed",label:`${style?.label ?? "教练"}正文已完成`,detail:"正在整理成稿和展示结果。",coachId:style?.id,coachLabel:style?.label });
          let finalDraft = draftV1;
          let firstAudit: TrafficCopyAudit;
          try {
            const rawAudit=await runInsuranceContentAgent([{role:"user",content:buildTrafficCopyAuditPrompt({source,draft:draftV1,blueprint,authority:auditAuthority,brief,context:trafficContexts[promptIndex]??[]})}],input.userId,"traffic",{creatorContextMode:"none"});
            firstAudit=parseTrafficCopyAudit(rawAudit);
          } catch {
            firstAudit=parseTrafficCopyAudit(JSON.stringify({status:"pass",issues:[{severity:"warning",type:"editorial_review_unavailable",location:"全文",reason:"本次独立成稿复审暂未返回",allowedFix:"保留教练原稿供创作者判断"}],semanticCoverage:0,expressionSimilarity:0,topicFulfillment:{score:0}}));
          }
          let finalAudit = firstAudit;
          let revised = false;
          const revisionDrafts: string[] = [];
          if(firstAudit.status==="revise"){
            try{
              finalDraft=sanitizeTrafficNarrativeIdentity((await runInsuranceContentAgent([{role:"user",content:buildTrafficCopyRevisionPrompt({source,draft:draftV1,blueprint,authority:auditAuthority,brief,audit:firstAudit,context:trafficContexts[promptIndex]??[],creatorSkill:style?.writingSkill})}],input.userId,"traffic",{creatorContextMode:"writing"})).trim());
              revisionDrafts.push(finalDraft);revised=true;
              const rawFinalAudit=await runInsuranceContentAgent([{role:"user",content:buildTrafficCopyAuditPrompt({source,draft:finalDraft,blueprint,authority:auditAuthority,brief,context:trafficContexts[promptIndex]??[]})}],input.userId,"traffic",{creatorContextMode:"none"});
              finalAudit=parseTrafficCopyAudit(rawFinalAudit);
            }catch{finalDraft=draftV1;revised=false;revisionDrafts.length=0;finalAudit=firstAudit;}
          }
          await input.onEvent?.({ type:"progress",phase:`audit:${style?.id ?? promptIndex}`,status:"completed",label:`${style?.label ?? "教练"}版本完成`,detail:revised?"独立编辑已完成一次局部精简或增强。":"独立编辑已完成选题兑现、专业增量和口播效率复审。",coachId:style?.id,coachLabel:style?.label });
          currentOutput = finalDraft;
          result += currentOutput;
          if (prompts.length > 1) await input.onEvent?.({ type: "delta", content: `## ${topic ? `${topic.title} · ` : ""}${style?.label ?? `版本${promptIndex + 1}`}版\n\n` });
          await input.onEvent?.({ type: "delta", content: currentOutput });
          trafficAudits.push({ first: firstAudit, final: finalAudit, revised });
          const actualCharacters = currentOutput.replace(/\s/g, "").length;
          const estimatedSpeakingRate = estimateTrafficSpeakingRate({ characters: actualCharacters, reasoningSteps: brief.durationBasis.reasoningSteps, evidenceUnits: brief.durationBasis.evidenceUnits, tension: brief.voicePlan.tension });
          trafficExecutions.push({ creatorStyleId: style?.id ?? "default", taskMode: blueprint.taskMode, taskProfile: blueprint.taskProfile, skillRoute: trafficSkillRoutes[promptIndex], contentGaps: brief.contentGaps, selectedMethods: brief.selectedMethods, stoppingRule: brief.stoppingRule, structureBudget: brief.structureBudget, durationRange: brief.durationRange, durationBasis: brief.durationBasis, actualCharacters, estimatedSpeakingRate, estimatedSeconds: Math.round(actualCharacters / estimatedSpeakingRate * 60), expressionOverlap: measureTrafficExpressionSimilarity(source, currentOutput), draftV1, draftV2: revised ? finalDraft : null, revisionDrafts, finalStatus: finalAudit.status });
        } else {
          for await (const chunk of streamInsuranceContentAgent([{ role: "user", content: channelPrompt }], input.userId, styleMode)) {
            result += chunk;
            currentOutput += chunk;
            await input.onEvent?.({ type: "delta", content: chunk });
          }
        }
        if (isTrafficExecution) {
          const style = trafficPromptStyles[promptIndex] ?? creatorStyles[promptIndex];
          const topic = trafficPromptTopics[promptIndex];
          creatorStyleResults.push({ id: `${style.id}:${topic?.id ?? "single"}`, label: topic ? `${topic.title} · ${style.label}` : style.label, content: currentOutput.trim() });
        }
        if (result.trim() && !result.endsWith("\n")) {
          result += "\n\n";
          await input.onEvent?.({ type: "delta", content: "\n\n" });
        }
      }

      if (!result.trim()) {
        const fallbackPrompt = isTrafficExecution ? prompts[0] ?? prompt : prompt;
        const fallback = await runInsuranceContentAgent([{ role: "user", content: fallbackPrompt }], input.userId, styleMode);
        result = fallback.trim();
        if (isTrafficExecution && result) {
          const style = creatorStyles[0];
          creatorStyleResults.push({ id: style?.id ?? "default", label: style?.label ?? "默认的我", content: result });
        }
        if (result) {
          await input.onEvent?.({ type: "delta", content: result });
        }
      }

      // Style labels are useful as transient progress notices in the SSE
      // stream, but they are not publishable copy. Rebuild the completed
      // result from the generated bodies before persistence and the done
      // event so app_runs, works and plainText never retain those notices.
      if (isTrafficExecution && creatorStyleResults.length > 0) {
        const originalStyleIndexes = new Map(creatorStyleResults.map((style, index) => [style.id, index]));
        const publishableResults = creatorStyleResults.filter((_, index) => trafficAudits[index]?.final.status === "pass");
        if (publishableResults.length === 0) {
          const reasons = [...new Set(trafficAudits.flatMap((item) => item.final.issues.filter((issue) => issue.severity === "blocking").map((issue) => issue.reason)).filter(Boolean))].slice(0, 3);
          throw new Error(`成稿检查未通过，待人工复核草稿未发布${reasons.length ? `：${reasons.join("；")}` : "。请补充更具体的事实来源或核心问题后重试。"}`);
        }
        creatorStyleResults.splice(0, creatorStyleResults.length, ...publishableResults);
        await input.onEvent?.({ type:"progress",phase:"result_packaging",status:"active",label:"正在整理最终结果",detail:"整理教练版本和可用标题，马上完成。" });
        const titleSets = await Promise.all(creatorStyleResults.map(async (style) => ({
          id: style.id,
          titles: await buildTrafficCopyTitles(style.content, trafficCreativeBriefs[originalStyleIndexes.get(style.id) ?? 0]?.content ?? "", input.userId),
        })));
        const titlesByStyleId = new Map(titleSets.map((item) => [item.id, item.titles]));
        creatorStyleResults.forEach((style) => { style.titles = titlesByStyleId.get(style.id) ?? []; });
        result = buildPersistedCreatorStyleText(creatorStyleResults);
        await input.onEvent?.({ type:"progress",phase:"result_packaging",status:"completed",label:"结果整理完成",detail:publishableResults.length === trafficAudits.length ? "所有教练版本已经生成并通过检查。" : `已发布 ${publishableResults.length} 个通过检查的版本；未通过事实或核心问题检查的草稿未发布。` });
      }

      if (app.slug === "xiaohongshu-studio" || remixDefinition?.id === "xiaohongshu-studio") result = limitXiaohongshuTitle(result);

      resultJson = {
        ...(isTrafficExecution ? { trafficCopyArchitecture: {
          version: 8,
          topicProcess: precomputedTrafficTopicProcess,
          portfolioPlan: trafficPortfolioPlan,
          sourceBlueprint: trafficBlueprints[0] ?? trafficSourceBlueprint,
          sourceBlueprints: trafficBlueprints,
          selectedTopics: selectedTrafficTopics,
          authority: trafficAuthority,
          // Keep the singular field for existing readers; every selected
          // coach now owns its own research pack and creative brief.
          evidencePack: sharedTrafficEvidencePack ?? trafficEvidencePacks[0] ?? null,
          evidencePacks: sharedTrafficEvidencePack ? [sharedTrafficEvidencePack] : trafficEvidencePacks,
          audits: trafficAudits,
          executions: trafficExecutions,
          briefs: trafficCreativeBriefs.map((brief, index) => ({
            creatorStyleId: trafficPromptStyles[index]?.id ?? creatorStyles[index]?.id ?? "default",
            creatorStyleLabel: trafficPromptStyles[index]?.label ?? creatorStyles[index]?.label ?? "默认的我",
            selectedTopic: trafficPromptTopics[index],
            creativeBrief: brief,
            coachSkillId: (trafficPromptStyles[index] ?? creatorStyles[index])?.id === "default" ? null : (trafficPromptStyles[index] ?? creatorStyles[index])?.id ?? null,
            coachSkillLabel: (trafficPromptStyles[index] ?? creatorStyles[index])?.id === "default" ? null : (trafficPromptStyles[index] ?? creatorStyles[index])?.label ?? null,
            selectedMaterialContext: trafficContexts[index] ?? [],
            writerContext: {
              source: app.slug === "link-remix" ? buildRemixStudioSource(values) : stringifyCreationFieldValue(values.source),
              creatorRuntimeSkill: (trafficPromptStyles[index] ?? creatorStyles[index])?.writingSkill ?? "",
              coachRuntimeSkill: (trafficPromptStyles[index] ?? creatorStyles[index])?.researchSkill ?? "",
              creativeBrief: brief.content,
              selectedMaterials: trafficContexts[index] ?? [],
            },
          })),
          headlines: creatorStyleResults.map((style, index) => ({
            batchId: `creator-style-${style.id}-${index + 1}`,
            creatorStyleId: style.id,
            creatorStyleLabel: style.label,
            titles: style.titles ?? [],
          })),
        } } : {}),
        contentJson: app.slug === "link-remix"
          ? buildLinkRemixResultJson(result, values, creatorStyleResults)
          : app.slug === "traffic-copy" && creatorStyleResults.length > 0
          ? {
              plainText: result,
              batches: creatorStyleResults.map((style, index) => ({
                id: `creator-style-${style.id}-${index + 1}`,
                label: style.label,
                items: [{ id: `creator-style-${style.id}-${index + 1}-item`, title: style.label, body: style.content, viewMode: "plain", summary: style.content.slice(0, 120) }],
              })),
            }
          : buildCreationOutputJson(result, Array.isArray(values.targets) ? values.targets : []),
      };
    }
  } catch (error) {
    const userError = getCreationUserError(error);
    const retryable = isTrafficRequested && isRetryableCreationError(error);
    await tryCompleteAppRun({
      runId: run?.id ?? null,
      status: "failed",
      resultText: result,
      resultJson,
      errorMessage: error instanceof Error ? error.message : userError,
    });
    // The background runner owns retries. Do not close the SSE stream with an
    // error before it has exhausted transient network/model recovery attempts.
    if (!retryable) await input.onEvent?.({ type: "error", content: userError });
    throw retryable ? new RetryableCreationRunError(userError) : error;
  }

  if (!result.trim()) {
    await tryCompleteAppRun({
      runId: run?.id ?? null,
      status: "failed",
      resultText: "",
      errorMessage: "本次生成没有返回有效内容，请稍后重试。",
    });
    await input.onEvent?.({ type: "error", content: "本次生成没有返回有效内容，请稍后重试。" });
    throw new Error("本次生成没有返回有效内容，请稍后重试。");
  }

  const title = isTrafficTopicOnly
    ? `选题分析｜${topicSourceTitle}`
    : buildWorkTitle({
    appName: effectiveApp.name,
    appSlug: app.slug,
    values,
    result: effectiveApp.resultType === "text" ? result : null,
  });
  const contentJson =
    (resultJson?.contentJson as Record<string, unknown> | undefined) ??
    buildCreationOutputJson(result, Array.isArray(values.targets) ? values.targets : []);
  const complianceRisk = checkCompliance(result).riskLevel;

  const completedRun = await tryCompleteAppRun({
    runId: run?.id ?? null,
    status: "succeeded",
    resultText: result,
    resultJson,
  });

  // Another worker may have completed the same recovered run first. In that
  // case its persisted result and usage record are authoritative.
  if (run?.id && !completedRun) {
    await input.onEvent?.({
      type: "done",
      work: input.workId ? { id: input.workId, title } : null,
      content: result,
      images: Array.isArray(resultJson?.images) ? resultJson.images as Array<{ id: string; url: string }> : [],
      imageMode: typeof resultJson?.imageMode === "string" ? resultJson.imageMode : null,
      retryable: Boolean(resultJson?.retryable),
    });
    return { runId: run.id, work: null, result, resultJson, title };
  }

  const studioAssets = Array.isArray(resultJson?.images) ? resultJson.images as Array<{ id: string; url: string }> : [];
  const work = isWechatStudioAssetStep
    ? await tryMergeWechatStudioAssets({
        userId: input.userId,
        workId: input.workId ?? "",
        kind: app.slug === "wechat-cover" ? "cover" : "images",
        images: studioAssets,
      })
    : isXiaohongshuStudioAssetStep
    ? await tryMergeXiaohongshuStudioAssets({
        userId: input.userId,
        workId: input.workId ?? "",
        kind: app.slug === "wechat-cover" ? "cover" : "images",
        images: studioAssets,
      })
    : input.workId
    ? await tryUpdateWorkContent({
        userId: input.userId,
        workId: input.workId,
        appRunId: run?.id ?? null,
        title,
        content: result,
        contentJson: app.slug === "xiaohongshu-studio" ? { ...contentJson, xiaohongshuStudioState: { topic: stringifyCreationFieldValue(values.topic), creationMode: stringifyCreationFieldValue(values.creation_mode), lengthMode: stringifyCreationFieldValue(values.length_mode), content: result } } : contentJson,
        preserveWechatStudioState: app.slug === "wechat-studio",
        complianceRisk,
      })
    : null;

  if (app.slug === "video-cover") {
    await tryAttachTrafficCoverToParent({
      userId: input.userId,
      parentWorkId: stringifyCreationFieldValue(values.traffic_parent_work_id),
      coverWorkId: input.workId ?? "",
      platform: stringifyCreationFieldValue(values.platform),
      style: stringifyCreationFieldValue(values.style),
      sourceLabel: stringifyCreationFieldValue(values.traffic_source_label),
      sourceBatchId: stringifyCreationFieldValue(values.traffic_source_batch_id),
      images: studioAssets,
    });
  }

  await reportUsage({
    customerId: input.userId,
    action: "write_script",
    amount: input.quotaCost,
    metadata: {
      appId: app.id,
      appSlug: app.slug,
      resultType: effectiveApp.resultType,
      streamed: Boolean(input.onEvent),
    },
  });

  await trySaveUsageLog({
    userId: input.userId,
    actionType: "creation_app_run",
    quotaCost: input.quotaCost,
    model: isPolicyRenewalCard
      ? process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1"
      : effectiveApp.resultType === "image"
      ? process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1"
      : resolveConfiguredTextModel(),
    metadata: {
      appId: app.id,
      appSlug: app.slug,
      resultType: effectiveApp.resultType,
      streamed: Boolean(input.onEvent),
      workId: work?.id ?? input.workId ?? null,
      appRunId: run?.id ?? null,
    },
  });

  const usedVisualAssetIds = Array.isArray(resultJson?.avatarVisualAssetIds)
    ? resultJson.avatarVisualAssetIds.filter((item): item is string => typeof item === "string")
    : [];
  await logAvatarVisualUsage({
    userId: input.userId,
    assetIds: usedVisualAssetIds,
    workId: work?.id ?? input.workId ?? null,
    appRunId: run?.id ?? null,
    contextType: entry === "personality-card" ? "personality-card" : app.slug,
  });

  await input.onEvent?.({
    type: "done",
    work: work ? { id: work.id, title } : input.workId ? { id: input.workId, title } : null,
    content: result,
    images: Array.isArray(resultJson?.images) ? resultJson.images as Array<{ id: string; url: string }> : [],
    imageMode: typeof resultJson?.imageMode === "string" ? resultJson.imageMode : null,
    retryable: Boolean(resultJson?.retryable),
  });

  return {
    runId: run?.id ?? null,
    work,
    result,
    resultJson,
    title,
  };
}

async function buildTrafficCopyTitles(body: string, brief: string, userId: string) {
  if (!body.trim()) return [];
  try {
    const raw = await runInsuranceContentAgent([{
      role: "user",
      content: [
        "你是短视频口播的通用标题编辑。只基于最终正文提炼 3 条可发布标题，不重写正文、不补充事实、不制造恐慌或承诺。",
        "标题应具体、能体现正文中真实的冲突或判断；三条应有不同切口，单条不超过 24 个汉字或等效长度。",
        "严格只返回 JSON：{\"titles\":[\"标题1\",\"标题2\",\"标题3\"]}。",
        brief ? `【编辑简报】\n${brief}` : "",
        `【最终正文】\n${body}`,
      ].filter(Boolean).join("\n\n"),
    }], userId, "traffic", { creatorContextMode:"writing" });
    const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as { titles?: unknown };
    const titles = Array.isArray(parsed.titles)
      ? parsed.titles.filter((title): title is string => typeof title === "string").map((title) => title.replace(/\s+/g, " ").trim()).filter(Boolean)
      : [];
    return [...new Set(titles)].slice(0, 3);
  } catch {
    return [];
  }
}

function buildLinkRemixResultJson(result: string, values: Record<string, FieldValue>, creatorStyles: Array<{ id: string; label: string; content: string }> = []) {
  const capability = values.remix_target;
  const meta = getRemixResultMeta(capability);
  const normalizedCapability = normalizeRemixCapability(capability);
  const definition = getRemixCapabilityDefinition(capability);
  if (normalizedCapability === "moments") {
    return {
      ...buildCreationOutputJson(result, ["moments"]),
      capability: normalizedCapability,
      effectiveAppSlug: definition.appSlug,
      remixTarget: normalizedCapability,
    };
  }
  const body = result.trim();
  const firstLine = body.split("\n").find((line) => line.trim())?.replace(/^#{1,6}\s*/, "").trim();
  return {
    plainText: result,
    capability: normalizedCapability,
    effectiveAppSlug: definition.appSlug,
    remixTarget: normalizedCapability,
    ...(normalizedCapability === "wechat-studio" ? { wechatStudioState: {
      topic: buildRemixStudioSource(values),
      audience: stringifyCreationFieldValue(values.audience),
      tone: stringifyCreationFieldValue(values.tone),
      lengthMode: stringifyCreationFieldValue(values.lengthMode),
      title: firstLine || meta.label,
      content: body.replace(/^#\s+[^\n]+\n+/, "").trim(),
      activeTab: "article",
      generationPending: false,
    } } : {}),
    ...(normalizedCapability === "xiaohongshu-studio" ? { xiaohongshuStudioState: {
      topic: buildRemixStudioSource(values),
      creationMode: "rewrite",
      lengthMode: stringifyCreationFieldValue(values.length_mode) || "standard",
      content: body,
      tab: "note",
      generationPending: false,
    } } : {}),
    batches: creatorStyles.length > 0 ? creatorStyles.map((style, index) => ({
      id: `creator-style-${style.id}-${index + 1}`,
      label: style.label,
      items: [{ id: `creator-style-${style.id}-${index + 1}-item`, title: style.label, body: style.content, viewMode: meta.viewMode, summary: style.content.slice(0, 120) }],
    })) : body ? [{
      id: meta.id,
      label: meta.label,
      items: [{
        id: `${meta.id}-1`,
        title: firstLine || meta.label,
        body,
        viewMode: meta.viewMode,
        summary: body.replace(/\s+/g, " ").slice(0, 120),
      }],
    }] : [],
  };
}

function buildTopicPickerPrompt(
  values: Record<string, FieldValue>,
  caseContext: string[],
  promptHint: string,
  snapshot: ThinkingProfileSnapshot | null,
  summary: ThinkingProfileSummary | null,
) {
  const specialRequirements = stringifyCreationFieldValue(values.special_requirements).trim();
  const brief = snapshot ? buildThinkingProfileBrief(snapshot, summary ?? undefined) : null;

  return [
    "你现在在执行小谷应用：找选题。",
    "这是小谷的多领域专业内容选题规划任务。保持用户指定的财经、财富、保险或通用领域，不复写任何示例内容。",
    ...caseContext,
    `应用提示：${promptHint}`,
    brief
      ? `长期人物底盘：人设底色=${brief.persona || "未提供"}；核心客群=${brief.targetAudience || "未提供"}；擅长主题=${brief.specialty || "未提供"}；表达偏好=${brief.topicPreference || "未提供"}。`
      : "长期人设底盘：用户未提供完整人设画像，请保持专业、理性和领域中立，不主动迁移到保险。",
    `特殊要求：${specialRequirements || "用户未填写，请根据个人定位和风格自动生成。"}`,
    "输出必须严格包含以下 4 个一级模块，标题必须完全一致：",
    "1)【一、人设提炼】",
    "2)【二、选题列表】",
    "3)【三、选题使用方法】",
    "4)【四、选题详细指导】",
    "具体要求：",
    "1. 人设提炼：用一段 180-260 字总结用户的内容定位、信任来源、表达气质和目标客户，不要写成简历。",
    "2. 选题列表：必须输出 6 个高质量选题，每个选题后用括号标明类型，只能使用：扩圈吸粉类、建立信任类、转化引流类。三类都必须覆盖。",
    "3. 选题使用方法：说明如何选择本周主题、补充事实来源并进入内容创作。",
    "4. 选题详细指导：必须逐条展开 6 个选题。每条都包含：选题N、备选标题A/B、怎么写、钩子设置、语气语调、结尾互动、千万别踩的坑。",
    "5. 整体语言要具体、可执行；事实、案例和数据必须来自用户输入或明确标注待核实。",
    "6. 不要输出 Markdown 表格符号 `|`。",
  ].filter(Boolean).join("\n\n");
}

function buildVideoScriptPolishPrompt(
  values: Record<string, FieldValue>,
  caseContext: string[],
  promptHint: string,
) {
  const draft = stringifyCreationFieldValue(values.draft).trim();
  return [
    "你是一位擅长短视频口播稿诊断与精修的资深内容顾问。",
    ...caseContext,
    `应用提示：${promptHint}`,
    "请按下述精修报告契约输出，不复写示例，不输出额外前言。",
    "输出必须严格使用以下 6 个一级模块，且标题必须完全一致：",
    "1)【博主风格画像】",
    "2)【第一部分：整体诊断与数据分析】",
    "3)【第二部分：逐句精细批改】",
    "4)【第三部分：系统提升方法论】",
    "5)【第四部分：完善后的文案】",
    "6)【推荐标题+标签】",
    "具体要求：",
    "1. 博主风格画像：用 3 个要点输出，分别是表达风格、专业程度、人设定位。",
    "2. 第一部分：整体诊断：按“观察 + 原文证据 + 修改建议”写法，至少覆盖开头、逻辑衔接、信息密度、口语节奏、行动召唤和合规风险；不要伪造数据或预测完播率。",
    "3. 第二部分：逐句精细批改：挑 2-4 段关键原文，按“原文 / 问题 / 修改 / 原理”格式展开。",
    "4. 第三部分：系统提升方法论：给 4-6 条可复用的方法论，适合以后写同类口播。",
    "5. 第四部分：完善后的文案：输出一版完整的精修口播成稿，可直接朗读。",
    "6. 推荐标题+标签：给 5 个标题建议，再给一组标签。",
    "7. 整体语气要专业、克制，每条判断都应能在用户原稿中找到依据。",
    "8. 不要输出 Markdown 表格符号 `|`，改用自然语言排版；可以使用项目符号和编号。",
    "待精修原稿：",
    draft,
  ].filter(Boolean).join("\n\n");
}

function buildLiveScriptPrompt(
  values: Record<string, FieldValue>,
  caseContext: string[],
  promptHint: string,
) {
  const livePoint = stringifyCreationFieldValue(values.live_point).trim();

  return [
    "你现在在执行小谷应用：写直播稿。",
    "你是一位服务财经、财富、保险及其他专业创作者的直播策划顾问；先识别用户原题领域。",
    "这是一篇可以直接阅读、复制和继续编辑的直播内容稿，不是问卷分析，也不是把提示词逐条回答的执行清单。",
    ...caseContext,
    `应用提示：${promptHint}`,
    "",
    "写作原则：",
    "1. 先提炼用户观点的核心矛盾、受众痛点和一句话主张，再展开直播内容。",
    "2. 语言像真人主播：短句、口语、自然停顿，有承接和互动，不写成论文或营销长文。",
    "3. 观点不明确的地方可以做合理结构化，但不得替用户编造产品、案例、数据、身份或承诺。",
    "4. 所有领域不得虚构事实；任务涉及保险时，不承诺收益、承保或理赔，不制造恐慌、不夸大产品；缺少事实时标注“待核实”。",
    "5. 转化要轻，以评论关键词、私信咨询、预约梳理和领取清单为主，不做强逼单。",
    "",
    "请只输出一篇完整内容，使用 Markdown 标题层级，不要使用【】作为章节标题，不要使用 Markdown 表格，不要输出“以下是”“好的”等前言：",
    "# 专业主题直播稿",
    "## 重要提醒",
    "用一段简短提醒说明：涉及产品、数据、案例、收益或理赔的内容须由主播在开播前核实；不要写泛泛的免责声明。",
    "## 直播主题",
    "提炼一句清楚的直播主题，并给出 3 个可发布的直播标题。标题要具体、有对象和冲突点，不夸大、不制造恐慌。",
    "## 引流方式说明",
    "给出 2-3 种低风险承接方式，例如评论关键词、私信咨询、预约梳理或资料领取；每种写一条可直接说的口播话术。不得建议规避平台审核或使用违规导流方式。",
    "## 人设内容",
    "只根据用户输入提炼 1 段可自然植入的专业背景；没有提供真实经历时，保留“请按真实情况补充”的占位，不得编造资历、服务人数或案例。",
    "## 预热话术",
    "写一段开播前或开场前可用的预热话术，交代对象、今天讲什么、为什么值得听完，并自然引导关注或预约。",
    "## 直播内容框架",
    "拆成 5-7 个“板块”，每个板块使用三级标题，并写明目的、关键内容点、互动动作和下一段钩子。框架要呈现从问题切入、认知建立、方法讲解、案例或场景、收尾承接的完整节奏。",
    "## 完整直播稿",
    "按上述每个板块逐段输出可直接念的完整口播稿。每段自然嵌入评论区互动、停顿或回应提示、留人钩子和轻承接动作；用“【互动】”“【随口】”“【钩子】”“【承接】”作短标签即可。案例、产品数据和结论没有输入依据时必须写“待核实”或“建议按真实情况替换”。",
    "## 金句总览",
    "提炼 6-10 句可单独传播的金句，围绕本场直播观点，不编造数据或绝对承诺。",
    "## 全场统计",
    "统计本稿的互动点、承接动作和留人钩子数量，给出概览即可。",
    "## 脚本使用建议",
    "给出 5-7 条开播前和直播中的实操提醒，覆盖熟悉框架、互动节奏、案例替换、数据核实、人设补充和临场调整。",
    "",
    "用户提供的直播观点：",
    livePoint || "未填写",
  ].filter(Boolean).join("\n\n");
}

function buildWechatStudioPrompt(values: Record<string, FieldValue>, caseContext: string[]) {
  const lengthMode = stringifyCreationFieldValue(values.lengthMode);
  const lengthBrief = lengthMode === "standard" ? "常规模式：约 1200 字，使用 3-4 个二级标题。" : lengthMode === "long" ? "长文模式：约 1800 字，使用 4-5 个二级标题。" : "极简模式：约 600 字，使用 2 个二级标题。";
  return [
    "你正在为微信公众号创作一篇完整长文，不是短视频口播稿、小红书笔记或销售话术。",
    ...caseContext,
    `第一行仅输出 Markdown 一级标题。随后以一个具体问题、场景或判断开篇。${lengthBrief}每段 2-4 句，字数允许上下浮动约 10%，不要为了凑字数重复观点。`,
    "语言自然、完整、有阅读节奏。禁止‘家人们’‘你知道吗’等口播表达，禁止表情、强推销、焦虑营销和编号清单堆砌。",
    "不得编造数据、案例、产品规则或经历；任务涉及保险时不承诺收益、承保或理赔。结尾给温和自然的行动建议。只输出可直接发布的文章，不解释过程或附配图建议。",
    `目标读者：${stringifyCreationFieldValue(values.audience) || "普通读者"}。`,
    `文章气质：${stringifyCreationFieldValue(values.tone) || "专业但易懂"}。`,
    "真实素材与要求：",
    stringifyCreationFieldValue(values.topic),
  ].filter(Boolean).join("\n\n");
}

function buildXiaohongshuStudioPrompt(values: Record<string, FieldValue>, caseContext: string[]) {
  const creationMode = stringifyCreationFieldValue(values.creation_mode) || "idea";
  const lengthMode = stringifyCreationFieldValue(values.length_mode) || "standard";
  const lengthBrief = lengthMode === "long" ? "长文模式：800-1000 字，绝不超过 1000 字，5-7 个短段落或清单节点。" : "常规模式：约 500 字（450-550 字），4-5 个短段落或清单节点。";
  return [
    "你正在为小红书创作一篇图文笔记，不是公众号长文、口播稿或直接成交话术。",
    ...caseContext,
    `第一行输出笔记标题：标题严格不超过 20 个字符（汉字、数字、英文和标点均计入），不要加“标题：”等前缀；随后直接输出可发布正文。${lengthBrief}正文用短段落和少量自然的 Emoji，先给具体场景或结论，再展开解释，结尾给克制的站内互动问题。正文必须至少包含 2-4 个简短子标题：每个子标题单独一行，用“## ”开头，像小红书图文卡片中的段落引导；子标题要具体、有信息量，不能是“正文”“总结”等空泛词。`,
    "读者沟通优先采用有生活感、能承接情绪的表达：从真实的日常时刻、家庭关系、预算取舍、照顾自己或未来安排等具体处境切入，让读者先感到“这和我有关”，再获得清晰判断。可以温和、有共鸣，但不煽情、不假设所有读者的性别或处境；尤其不要把女性读者刻板化为只关心颜值、家庭或情绪。涉及专业决策时，必须同时交代适合条件、不适合条件、限制和需核验处，让共情建立在信息透明上。",
    creationMode === "rewrite" ? "这是基于原文的正常创作，不是逐句改写、摘要或复述。输入原文是可靠素材和事实边界：先在内部列出不可遗漏的关键信息（产品/公司/人物名称、时间、数字、方案条件、保证与非保证口径、限制条件、案例结论），再重新选择更适合小红书读者的切入角度、标题、叙事顺序、子标题、场景化表达、观点推进和互动收尾。输出必须覆盖所有原文核心结论和支撑它们的关键事实；可压缩修辞、重复论述和次要背景，不能为了短而删去产品机制、关键差异、重要数字或风险边界。允许提炼原文隐含的生活问题和行动建议；不得捏造原文没有的具体数字、案例、政策、产品规则或亲身经历，也不得把推测写成事实。" : "这是基于想法创作：请先全网检索相关的公开、可信资料，再把能明确核验的事实自然融入笔记；如果无法检索或无法确认，不得声称已经查找，改用一般性表述或明确标注待核验，绝不补造数字、案例、政策或产品规则。",
    "以读者兴趣和创作者自然获客为目标动态组织内容，不使用机械固定模板：有真实场景、人物困境或冲突时，优先从读者可代入的场景切入；有复杂机制、数字或方案时，优先用对比、误区或判断顺序讲清楚；有产品或服务优势时，先解释它解决的具体问题和适用条件，再表达价值；有时效变化时，先说清它对读者意味着什么。优先产出可收藏的判断框架、清单或自检问题；信息密度高时减少套话，保留关键事实；结尾根据内容自然给出一个低压力、具体的核验动作、判断问题或讨论入口，而不是生硬求评论或私信。",
    "内容应真实、清晰、值得收藏；不得编造案例、数据、产品规则或个人经历，不承诺投保、理赔、收益或服务结果。不得出现电话、微信、二维码、站外链接、谐音/变体导流或规避审核说法；不得贬损竞品、诱导点击或用标题党。",
    "最后单独一行输出 3-6 个相关话题标签，使用 #标签 形式。只输出成稿，不解释创作过程、配图建议或合规说明。",
    "真实素材与要求：",
    stringifyCreationFieldValue(values.topic),
  ].filter(Boolean).join("\n\n");
}

function limitXiaohongshuTitle(result: string) {
  const lines = result.replace(/\r\n/g, "\n").split("\n");
  const titleIndex = lines.findIndex((line) => line.trim());
  if (titleIndex < 0) return result;
  const match = lines[titleIndex].match(/^(\s*#{0,6}\s*)(.*)$/);
  if (!match) return result;
  const [, prefix, rawTitle] = match;
  const title = rawTitle.trim();
  const characters = Array.from(title);
  if (characters.length <= 20) return result;
  lines[titleIndex] = `${prefix}${characters.slice(0, 20).join("")}`.trimEnd();
  return lines.join("\n");
}

function buildGeneralContentPrompt(
  values: Record<string, FieldValue>,
  caseContext: string[],
  promptHint: string,
) {
  const source = stringifyCreationFieldValue(values.source).trim();
  const targets = Array.isArray(values.targets) ? values.targets : ["video_script", "wechat_article"];
  const wantsVideo = targets.includes("video_script");
  const wantsWechat = targets.includes("wechat_article");
  const selectedTypes = [
    wantsVideo ? "口播稿x2" : "",
    wantsWechat ? "公众号x2" : "",
  ].filter(Boolean).join("、") || "口播稿x2、公众号x2";

  return [
    "你现在在执行小谷应用：泛内容创作。",
    "这是一个把实时热点、普通观点、分享型素材和非强销售内容，萃取成更有共鸣、更容易破圈的泛选题内容的应用。",
    ...caseContext,
    `应用提示：${promptHint}`,
    `本次用户选择的生成类型：${selectedTypes}。`,
    "请严格围绕用户原始内容，先从表象事件里挖掘更深的人性共鸣，再输出可以直接发布的泛内容成稿。",
    "输出必须是一个完整的“生成结果”报告，不要再按【短视频口播】、【公众号文章】分渠道标题切分。",
    "必须严格按下面顺序输出：",
    "1. 泛选题萃取逻辑说明：写 2 层深挖逻辑，每层都说明表象事件背后的人性焦虑、身份投射、关系处境或安全感问题。",
    "2. 泛选题萃取结果：给出标题1和标题2，把具体事件转化为生活议题，但不要夸大事件影响。",
    wantsVideo ? "3. 如果选择了口播稿x2：分别围绕标题1、标题2输出两条可直接口播的文案，每条以“标题1：...”或“标题2：...”开头，随后写“文案：”和“[创作说明]”。" : "",
    wantsWechat ? "4. 如果选择了公众号x2：在对应标题下写成更完整的公众号文章结构，仍保留“文案：”和“[创作说明]”，不要只列提纲。" : "",
    "5. 文案从已核实的新闻或用户观点切入，再连接到具体生活处境；区分事实与观点，不制造焦虑，不硬销售。",
    "6. 不要输出额外前言，不要解释你会怎么做，直接输出结果。",
    "7. 不要输出 Markdown 表格符号 `|`，不要使用代码块。",
    "原始内容：",
    source,
  ].filter(Boolean).join("\n\n");
}

function buildLinkRemixPrompt(
  values: Record<string, FieldValue>,
  caseContext: string[],
  promptHint: string,
  researchContext = "",
  thinkingSnapshot: ThinkingProfileSnapshot | null = null,
  thinkingSummary: ThinkingProfileSummary | null = null,
) {
  const platform = stringifyCreationFieldValue(values.source_platform).trim() || "未说明平台";
  const url = stringifyCreationFieldValue(values.source_url).trim();
  const sourceTitle = stringifyCreationFieldValue(values.source_title).trim();
  const sourceAuthor = stringifyCreationFieldValue(values.source_author).trim();
  const publishedAt = stringifyCreationFieldValue(values.source_published_at).trim();
  const likeCount = stringifyCreationFieldValue(values.source_like_count).trim();
  const contentType = stringifyCreationFieldValue(values.source_content_type).trim();
  const topic = stringifyCreationFieldValue(values.source_topic).trim();
  const tags = stringifyCreationFieldValue(values.source_tags).trim();
  const evidence = stringifyCreationFieldValue(values.source_evidence).trim();
  const sourceText = stringifyCreationFieldValue(values.source_text).trim();
  const transcript = stringifyCreationFieldValue(values.source_transcript).trim();
  const angle = stringifyCreationFieldValue(values.remix_angle).trim();
  const capability = normalizeRemixCapability(values.remix_target);
  const sourceMaterial = [
    `来源平台：${platform}`,
    `原作品链接：${url}`,
    `原作品标题或开头：${sourceTitle || "未提供"}`,
    `作者或账号：${sourceAuthor || "未提供"}`,
    `发布时间：${publishedAt || "未核验"}`,
    `点赞数：${likeCount || "未核验"}`,
    `内容形态：${contentType || "未确认"}`,
    `主题：${topic || "未确认"}`,
    `标签：${tags || "未确认"}`,
    `事实证据摘要：${evidence || "未提供"}`,
    sourceText ? `作品文字：\n${sourceText}` : "",
    transcript ? `语音转写：\n${transcript}` : "",
    researchContext,
    angle ? `用户补充想法：${angle}` : "",
  ].filter(Boolean).join("\n\n");
  const targetValues = adaptRemixCapabilityInput(capability, values, sourceMaterial);
  const targetPrompt = capability === "traffic-copy"
    ? buildTrafficCopyPrompt(targetValues, caseContext, promptHint)
    : capability === "xiaohongshu-studio"
      ? buildXiaohongshuStudioPrompt(targetValues, caseContext)
      : capability === "moments"
        ? buildWriteCopyPrompt(targetValues, caseContext, thinkingSnapshot, thinkingSummary)
        : buildWechatStudioPrompt(targetValues, caseContext);

  return [
    `你正在通过“爆款话题二创”使用小谷现有的“${remixCapabilityLabel(capability)}”正式创作能力。以下题材结构、交互语义和输出规则以该能力为准。`,
    "二创事实边界：保持原作品的话题、人物关系、时间、数据、案例、判断和行动建议，不得反转、泛化或虚构。不可核验或违规的表述只能删除或标记待核实；不得复刻原句、独特比喻或长段文字。不要在成稿中输出预检、评分、证据缺口或二创过程。",
    targetPrompt,
  ].join("\n\n");
}

function buildLetterPrompt(
  values: Record<string, FieldValue>,
  caseContext: string[],
  promptHint: string,
) {
  const theme = stringifyCreationFieldValue(values.theme).trim();

  return [
    "你现在在执行小谷应用：走心一封信。",
    "这是小谷的长信创作任务，根据用户提供的真实主题和背景生成完整版、精简版和补充建议。",
    ...caseContext,
    `应用提示：${promptHint}`,
    "输出只包含一个分段标题【公众号文章】，并按小谷格式输出：完整版（约1500字）、精简版（约800字）、可补充的真实材料。",
    "具体要求：",
    "1. 完整版要写成一篇约1500字的完整走心长信，不要写成提纲、模板、邮件格式或多个无关版本。",
    "2. 精简版要保留完整版的主线和情绪递进，压缩到约800字，适合直接作为短一点的公众号正文发布。",
    "3. 可添加内容建议要列出4-6条，每条都用【位置：...】开头，说明可以补充的数据、案例、功能预告、互动引导或情感强化点。",
    "4. 开头要自然进入主题，像真诚的人在认真表达，不要过度煽情或喊口号。",
    "5. 正文要围绕用户提供的背景推进，有回忆、理解、感谢、提醒或祝福的层次。",
    "6. 结尾要收束成温暖、有余味的一段话，适合直接发布到公众号。",
    "7. 不要输出额外解释，不要输出 Markdown 表格符号 `|`，不要使用代码块。",
    "用户提供的主题、背景信息和大体要求：",
    theme,
  ].filter(Boolean).join("\n\n");
}

function buildWriteCopyPrompt(
  values: Record<string, FieldValue>,
  caseContext: string[],
  snapshot: ThinkingProfileSnapshot | null,
  summary: ThinkingProfileSummary | null,
) {
  const tone = stringifyCreationFieldValue(values.tone) || "self";
  const source = stringifyCreationFieldValue(values.source) || "";
  const targets = Array.isArray(values.targets) ? values.targets.filter((item) => item.trim().length > 0) : [];
  const brief = snapshot ? buildThinkingProfileBrief(snapshot, summary ?? undefined) : null;
  const targetSpecs = targets
    .map((target) => getWriteCopyTargetSpec(target))
    .filter((item): item is NonNullable<ReturnType<typeof getWriteCopyTargetSpec>> => Boolean(item));

  const lines = [
    "你现在在执行小谷应用：写文案。",
    "请直接生成可以发布的成稿，并且当用户选择多个渠道时，必须严格按“【渠道名】”作为分段标题输出。",
    ...caseContext,
    caseContext.length > 0 ? "" : "",
    `本次语气偏好：${tone}`,
    ...(brief
      ? [
          `长期人物底盘：人设底色=${brief.persona || "未提供"}；核心客群=${brief.targetAudience || "未提供"}；擅长主题=${brief.specialty || "未提供"}；表达偏好=${brief.topicPreference || "未提供"}。`,
        ]
      : []),
    `本次目标渠道：${targetSpecs.map((item) => item.label).join("、") || "未指定"}`,
    "如果有多个渠道，必须先输出渠道标题，再在每个渠道内按要求输出多个副本。",
    "每个渠道的多副本必须显式编号，格式统一为“版本一｜...”“版本二｜...”“版本三｜...”，不要省略版本标记。",
    "",
    "各渠道副本要求：",
  ];

  for (const spec of targetSpecs) {
    lines.push(`【${spec.label}】`);
    lines.push(...spec.instructions);
    lines.push("");
  }

  lines.push("原始素材：");
  lines.push(source);

  return lines.join("\n");
}

function buildWriteCopyChannelPrompts(
  values: Record<string, FieldValue>,
  caseContext: string[],
  snapshot: ThinkingProfileSnapshot | null,
  summary: ThinkingProfileSummary | null,
) {
  const targets = Array.isArray(values.targets)
    ? values.targets.filter((target) => getWriteCopyTargetSpec(target))
    : [];

  if (targets.length <= 1) {
    return [buildWriteCopyPrompt(values, caseContext, snapshot, summary)];
  }

  return targets.map((target) => buildWriteCopyPrompt(
    { ...values, targets: [target] },
    caseContext,
    snapshot,
    summary,
  ));
}

function getWriteCopyTargetSpec(target: string) {
  if (target === "video_script") {
    return {
      label: "短视频口播",
      instructions: [
        "1. 输出 3 条口播稿，分别用不同切入角度，但核心观点要一致。",
        "2. 三条必须分别以“版本一｜直接口播版”“版本二｜故事带入版”“版本三｜观点强化版”开头。",
        "3. 每条都要像能直接录制的视频文案，节奏自然、句子可说。",
      ],
    };
  }

  if (target === "xiaohongshu") {
    return {
      label: "小红书笔记",
      instructions: [
        "1. 输出 2 篇小红书笔记，分别代表不同表达气质。",
        "2. 两篇必须分别以“版本一｜笔记正文”“版本二｜笔记正文”开头。",
        "3. 标题感要强，适合手机端阅读，段落要疏，句子要短。",
      ],
    };
  }

  if (target === "wechat_article") {
    return {
      label: "公众号文章",
      instructions: [
        "1. 输出 2 篇公众号文章，分别用不同结构与叙事方式展开。",
        "2. 两篇必须分别以“版本一｜文章成稿”“版本二｜文章成稿”开头。",
        "3. 每篇都要是完整长文，允许有自然小标题，但不能拆成零散片段。",
      ],
    };
  }

  if (target === "moments") {
    return {
      label: "朋友圈文案",
      instructions: [
        "1. 输出 3 条朋友圈文案，分别代表不同语气和长度。",
        "2. 三条必须分别以“版本一｜朋友圈正文”“版本二｜朋友圈正文”“版本三｜朋友圈正文”开头。",
        "3. 必须像真实顾问发的日常感悟，不像广告海报配文。",
      ],
    };
  }

  return null;
}

function buildImagePlan(appName: string, fields: CreationField[], values: Record<string, FieldValue>, caseContext: string[], hint: string) {
  const style = stringifyCreationFieldValue(values.style) || "默认风格";
  const ratio = stringifyCreationFieldValue(values.ratio) || (appName === "公众号配图" ? "3:4" : "1:1");
  const source = stringifyCreationFieldValue(values.article) || stringifyCreationFieldValue(values.source) || "未提供素材";
  const signature = stringifyCreationFieldValue(values.signature);
  const output = [
    `${appName}创作结果`,
    ...caseContext,
    caseContext.length > 0 ? "" : "",
    hint,
    `风格：${style}`,
    `比例：${ratio}`,
    signature ? `署名：${signature}` : "署名：无",
    "",
    appName === "公众号配图" ? "文章配图方案：" : "图片卡片方案：",
    appName === "公众号配图" ? "1. 开篇配图：承接标题和导语，先建立文章氛围。" : "1. 封面卡：用一句最容易传播的结论做标题。",
    appName === "公众号配图" ? "2. 观点配图：对应正文推进中的核心观点或转折段落。" : "2. 拆解卡：把核心观点拆成 3 个层次。",
    appName === "公众号配图" ? "3. 情绪配图：补一个读者最容易代入的情绪或场景节点。" : "3. 场景卡：补一个客户最容易代入的生活场景。",
    appName === "公众号配图" ? "4. 收束配图：服务结尾余韵或互动提问，不做强海报感。" : "4. 行动卡：给出互动提问或私信关键词。",
    "",
    "图片文案底稿：",
    source,
  ];

  const customFields = fields
    .filter((field) => !["style", "ratio", "source", "article", "signature"].includes(field.id))
    .map((field) => {
      const value = values[field.id];
      if (isEmptyCreationFieldValue(value)) return null;
      return `${field.label}：${Array.isArray(value) ? value.join("、") : value}`;
    })
    .filter((value): value is string => Boolean(value));

  if (customFields.length > 0) {
    output.push("", "补充设置：", ...customFields);
  }

  return output.join("\n");
}

async function tryAttachTrafficCoverToParent(input: {
  userId: string;
  parentWorkId: string;
  coverWorkId: string;
  platform: string;
  style: string;
  sourceLabel: string;
  sourceBatchId: string;
  images: Array<{ id: string; url: string }>;
}) {
  if (!input.parentWorkId || !input.coverWorkId || input.images.length === 0) return;
  const parent = await tryGetWorkDetail({ userId: input.userId, workId: input.parentWorkId, access: "own" });
  if (!parent || !isTrafficCoverParentWork(parent)) return;
  const existingState = parent.content_json?.trafficCopyState as { covers?: unknown[] } | undefined;
  const existingCovers = Array.isArray(existingState?.covers) ? existingState.covers : [];
  const nextCover = {
    workId: input.coverWorkId,
    platform: input.platform,
    style: input.style,
    sourceLabel: input.sourceLabel,
    sourceBatchId: input.sourceBatchId,
    createdAt: new Date().toISOString(),
    images: input.images,
  };
  const covers = [...existingCovers.filter((cover: unknown) => cover && typeof cover === "object" && (cover as { workId?: unknown }).workId !== input.coverWorkId), nextCover];
  await tryUpdateWorkContent({
    userId: input.userId,
    workId: parent.id,
    content: parent.content,
    contentJson: {
      ...(parent.content_json ?? {}),
      trafficCopyState: { covers },
    },
  });
}

function buildTrafficCopyPrompt(values: Record<string, FieldValue>, caseContext: string[], promptHint: string) {
  const tone = stringifyCreationFieldValue(values.tone) || "default";
  const toneGuidance: Record<string, string> = {
    default: "保持理性、有温度，并忠于用户原题所属领域。",
    sharp: "观点明确、有反差、有冲突感，保持自然口语。",
    empathetic: "从真实生活处境切入，表达温和，先理解读者情绪再给出判断。",
    analytical: "按事件、原因、影响和判断推进，表达清晰、自然、专业。",
  };
  return [
    ...caseContext,
    promptHint,
    `本次内容语气：${toneGuidance[tone] ?? toneGuidance.default}`,
    "结合用户素材、搜索结果和教练判断自然创作，可使用事件、说法、争议、推测、人性洞察和专业机制，不输出后台核验或风险说明。",
    "只输出可直接发布的完整口播文案（流量型），不解释创作过程。",
    "用户素材：",
    stringifyCreationFieldValue(values.source),
  ].filter(Boolean).join("\n\n");
}

function buildVideoCoverPrompt(values: Record<string, FieldValue>, caseContext: string[], promptHint: string) {
  const platform = stringifyCreationFieldValue(values.platform);
  const platformGuidance = platform === "douyin"
    ? "抖音：首屏冲击力更强，标题控制在 8-14 个字，突出一个冲突或判断。"
    : "微信视频号：可信、克制，标题控制在 12-16 个字，突出一个清晰判断或生活场景。";
  return [
    "你正在为短视频制作一张竖版中文视频封面。",
    ...caseContext,
    promptHint,
    `发布平台：${platform === "douyin" ? "抖音" : "微信视频号"}。${platformGuidance}`,
    `封面风格：${stringifyCreationFieldValue(values.style)}。`,
    stringifyCreationFieldValue(values.avatar_visual_mode) === "yes"
      ? "人物形象要求：画面必须使用所提供形象参考图中的同一个人，保持可识别的脸部、发型、肤色、年龄与整体气质；可按封面主题调整姿态、服装和背景，但不要生成无关人物，也不要把参考照中的背景和构图当作硬约束。"
      : "人物形象要求：本次不使用用户本人形象；除非主题确有必要，否则优先使用场景、物件或抽象视觉表达。",
    "先从文案中提炼唯一的核心冲突或判断，作为封面主标题。主标题必须是清晰、可读的简体中文，不要编造文案中没有的事实；副标题可选且简短。",
    "画面必须预留足够文字留白，标题占画面视觉中心；不要包含二维码、联系方式、平台 Logo、复杂小字、收益承诺、理赔承诺、绝对化用语或恐吓式画面。",
    "文案内容：",
    stringifyCreationFieldValue(values.source),
  ].filter(Boolean).join("\n\n");
}

function buildImagePrompt(appName: string, fields: CreationField[], values: Record<string, FieldValue>, caseContext: string[], hint: string, referenceKnowledge = "") {
  const lines = [
    `你现在在执行小谷图片类应用：${appName}。请生成适合获客内容场景的视觉图。`,
    ...caseContext,
    caseContext.length > 0 ? "" : "",
    hint,
  ];
  const styleValue = stringifyCreationFieldValue(values.style);
  const isXiaohongshuVisual = stringifyCreationFieldValue(values.studio_parent) === "xiaohongshu-studio";
  const isImageCardRemix = appName === "知识卡片制作（图片）" && stringifyCreationFieldValue(values.creation_mode) === "image_remix";
  for (const field of fields) {
    const value = values[field.id];
    if (isEmptyCreationFieldValue(value)) continue;
    if (field.id === "reference_image") {
      lines.push(isImageCardRemix
        ? `${field.label}：已上传 ${Array.isArray(value) ? value.length : 1} 张二创原图。按上传顺序综合理解，必须准确保留并重新排版其中可确认的知识文字、数字与层级，不得把原图的知识内容简化成无文字插画。`
        : `${field.label}：已上传参考图。请尽量贴近参考图的配色、材质、笔触、留白、主体关系与版式节奏，但不要照搬其中的文字内容。`);
      continue;
    }
    if (field.id === "portrait_reference_image") {
      lines.push(`${field.label}：已上传临时形象照。仅用于保持人物外貌特征，不得替代二创原图中的知识内容、主体或版式。`);
      continue;
    }
    lines.push(`${field.label}：${Array.isArray(value) ? value.join("、") : value}`);
  }
  if (isXiaohongshuVisual) {
    lines.push("用途覆盖要求：这是小红书图文笔记的 3:4 竖版首图或章节卡片，不是公众号图片。忽略上方公众号封面不得出现文字的要求；首图必须有简短、醒目、准确的中文封面钩子，但不要机械复制完整长标题。画面应像真实小红书创作者制作的内容，不得出现 Logo、水印、二维码或机构广告感。若提供了形象参考照，仅首图严格保持同一人物的可识别外貌；不得把参考照中的背景、衣服或构图当作硬约束。");
  }
  const styleDirective = getImageStyleDirective(styleValue, appName);
  if (styleDirective) {
    lines.push(`风格细化：${styleDirective}`);
  }
  if (isImageCardRemix) {
    if (referenceKnowledge) lines.push(`原图已识别的知识内容（这是文字准确性的硬约束，必须完整呈现在新卡片中）：\n${referenceKnowledge}`);
    lines.push("二创优先级：用户填写的“二创改造要求”拥有最高优先级，必须严格遵从；只有用户未明确指定的部分，才能根据原图和所选风格自主决定。默认任务是先按上传顺序完整理解全部二创原图中的知识内容，准确提取其主标题、核心结论、关键要点、层级关系、可确认的数据与行动提示，再把相互补充的重点重组为一张信息完整、可独立阅读的原创知识卡片；如原图之间存在冲突，不得自行编造或取舍。原图文字模糊、缺失或无法确认时不得编造。以全部二创原图为主要视觉来源，保留用户明确要求保留的主体、构图或配色；按卡片内容和改造要求重绘。若用户选择加入人物形象，独立提供的形象参考图仅用于保持该人物的外貌特征，人物必须服务原图知识主题，不能替代原图的知识内容或主体。去除原图中的 Logo、水印、二维码和不相关文字，不要逐字复制或模仿受版权保护的版式。没有说明时，保留原图核心主体与视觉节奏，并以所选比例重新排版。");
  }
  if (appName === "公众号配图") {
    lines.push("这是一个公众号文章配图应用，不是单张海报应用。请围绕同一篇文章连续生成 4 张风格统一、可插入不同段落的配图。");
    lines.push("4 张图要分别服务：开篇氛围、观点推进、情绪转折、收束留白。不要在 4 张图里重复同一构图。");
    lines.push("重点是阅读节奏与文章气质，避免强广告感、强海报感、大段文字排版和单页信息图。");
  }
  lines.push("要求：突出标题可读性、层级清晰、适合知识卡片或公众号配图。避免夸张营销海报风，整体要像专业内容创作者的卡片。除非风格明确要求，否则不要做成 3D 渲染、商业海报、科技发布会大屏或过度写实电商物料。\n");
  return lines.join("\n");
}

function getImageStyleDirective(style: string, appName: string) {
  if (!style) return "";

  const directives: Record<string, string> = {
    "video-bold-opinion": "竖版短视频封面，超大中文主标题占画面中心，高对比深色或明亮纯色背景，只有一个强视觉主体，信息极简、有观点张力。",
    "video-talking-head": "竖版短视频封面，可信的专业创作者出镜或半身人物为视觉重心，背景干净，标题清晰，整体像高质量口播栏目封面。",
    "video-news-observation": "竖版短视频封面，纪实观察感，用抽象的新闻现场、城市或生活场景作背景，标题排版克制，专业、可信但不模拟新闻媒体 Logo。",
    "video-family-emotion": "竖版短视频封面，温暖真实的家庭生活场景、自然光、低饱和配色，标题清晰简短，先建立代入感而非制造焦虑。",
    "video-knowledge-card": "竖版短视频封面，清爽信息卡片结构，一个核心结论配少量图标或关系图，层级清楚、易读，避免塞入过多文字。",
    "video-premium-minimal": "竖版短视频封面，高级克制的深蓝、灰、米白或低饱和配色，大量留白、精致排版与单一质感背景，专业但不浮夸。",
    illustration: "暖米色纸张底，铅笔线稿加轻水彩晕染，手绘边框、星星、植物、书本、窗景等温暖小元素穿插。版式像手绘栏目页或知识海报，标题圆润醒目，信息模块有手工描边和轻微不规则感，整体亲和治愈，不要做成 3D 物件拼贴。",
    whiteboard: "真实白板拍照感，白色板面带反光与边框，蓝红马克笔手写，方框、波浪线、圈画标注明显。像老师或顾问在白板上现场写出来的内容，不要做成数码平板字效。",
    zen: "米白宣纸或墙面底，淡墨、浅褐、灰绿低饱和配色，山水、留白、云雾或植物点缀自然出现。版式安静克制，像东方意境海报，不要现代商务科技图表感。",
    "line-illustration": "奶油纸底，黑色或深灰细线手绘，少量黄色点题。图标和人物用线稿表现，信息卡片偏窄长，像轻松杂志插画版面，不要厚重上色或真实渲染。",
    luxury: "大理石、丝绒或高端材质背景，黑金或深蓝金主配色，标题有立体金属字感，卡片边框发光或鎏金。整体像高端品牌海报，精致奢华，但不要俗艳夜店风。",
    magazine: "像编辑部专题跨页，留白多，照片或生活场景横幅穿插，字体细致克制，页码或栏线可适度出现。整体偏出版物质感，不要做成培训海报模板。",
    graffiti: "墙面或街头场景做底，粉笔、喷漆、蜡笔质感混合，手写标题带粗糙颗粒感。信息区保留海报结构，但边缘更自由、更随性，避免过度整齐。",
    "event-stage": "深蓝舞台大屏主视觉，顶部长标题居中，舞台灯光、观众剪影、会场空间感明确。文字和图标像演讲现场投屏内容，整体要像发布会或大会现场，而不是普通海报。",
    "handwritten-notes": "真实纸张或墙面底，黑红双色手写，圈点批注、随手画的框线和小符号明显。像一页被认真整理过的手写提纲，排版略微不齐但信息完整，不要印刷体太强。",
    clay: "软糯粘土材质，模块像手工捏制方块或立牌，颜色偏莫兰迪暖色。图标和标题有立体起伏感，整体像桌面上的粘土陈列，不要金属或玻璃质感。",
    "minimal-drawing": "纸张底，黑色线稿为主，少量橙粉色高亮。留白多，元素少，但要有手绘花边、小图标和胶带便签感，像简洁版手账页，不要复杂满版。",
    business: "深色商务海报，黑底或极深灰底，金色标题和细线分隔，图标规整、人物专业可信。整体像高净值客户顾问用的品牌展示页，稳重、克制、可信。",
    blackboard: "黑板粉笔报风格，黑底带粉尘颗粒，彩色粉笔分栏，手绘箭头、山线、太阳、星号等课堂板报元素明显。内容要像一整块板报，而不是普通深色卡片。",
    "flat-knowledge": "米白底配青绿、蓝绿和深蓝信息卡，2D 扁平图标配圆角模块，大面积纯色块和浅色几何背景。像清爽的知识信息图，层级明确，不要真实纹理太重。",
    morandi: "低饱和米黄、灰绿、浅棕配色，远山、叶片、淡纹理背景自然出现。卡片柔和、边框轻，整体安静温柔，像带山水底纹的高级平面海报。",
    "science-sketch": "像科普板书或知识栏目页，米白纸底，红棕色手绘标题，模块框线圆润，图示、数字编号、箭头和小插画并重。重点是知识拆解的步骤感和手绘说明感。",
    "dark-pro": "深蓝黑底，金色标题与描边，窄长信息卡分栏清晰，像专业机构深色主视觉。整体沉稳、精英、夜间大屏质感强，但不能花哨。",
    "fresh-card": "浅米白或奶油底，淡蓝、淡粉、浅绿点缀，圆角卡片柔和，图标可爱轻盈。整体像轻松、治愈、干净的内容卡片页，适合亲和表达。",
    "xhs-talking-head": "小红书真人口播首图结构。严格参考用户上传照片中的同一个人，保持可识别的脸部、发型、肤色与年龄特征；把人物自然放在画面右侧或下半部，占画面约一半，像本人在真实住宅或工作桌前自然表达。标题放在人物旁边的大块安全区，使用两行以内的醒目粗体中文和一个极短角标。保持手机创作者原生感，不要企业宣传照、正式西装、过度磨皮或机构广告。",
    "xhs-bold-text": "小红书痛点大字首图结构。把当前标题提炼为不超过两行、约 8 至 14 个汉字的封面钩子，以超大粗黑体作为绝对主体，使用红色下划线或黄色荧光块突出一个关键词，可加一个不超过 6 字的小角标。纸张或纯色背景，缩略图一眼读清，避免完整长标题、复杂模块和精致品牌海报感。",
    "xhs-comparison": "小红书左右对比首图结构。根据正文找出两个真实可比较的选择、做法或状态，左右各一张大卡，中间放 VS，每侧只保留一个短标签和一个简单图形，底部放一句极短结论。不得编造正文没有的产品、数据或结论；像个人整理的对比笔记，不像企业 PPT。",
    "xhs-checklist": "小红书清单资料首图结构。标题短而醒目，正文只提炼 3 个最重要且有原文依据的短要点，使用 1、2、3 大编号纵向排列，配荧光笔、红笔圈画和极简手绘图标。像值得收藏的个人复习资料第一页，不要密集小字、复杂图表或机构宣传模板。",
    "xhs-real-scene": "小红书真实场景首图结构。用手机俯拍或近景表现与正文直接相关的真实桌面、笔记、保单样式纸或生活物件，保留自然光、轻微凌乱和使用痕迹；所有姓名、公司、编号、金额等信息必须模糊不可辨。只在纸张或便签上放一个短标题和一个短角标，营造普通用户复盘分享的原生感。",
    "daily-sign": "更像一张氛围日签，主标题和一句副标题最重要，背景要有纸感或柔和光影，元素少但精致。不要做成多模块信息图。",
    study: "学霸笔记和复习资料感，编号明显，模块像知识点总结卡，标注、重点线、荧光笔或手写注释自然出现。整体像好看的学习总结页。",
    "large-sign": "超大中文主标题占画面主体，其他信息极少，适合一句观点或一句提醒。背景简洁，局部有手绘或纸感点缀，重点在字的气质和留白。",
    "black-white": "黑白灰单色或接近单色，强对比版式，复古摄影、报刊、印刷或极简海报感都可以。尽量不用彩色，只靠字重、留白和对比建立风格。",
    scrapbook: "手账拼贴风，便签、贴纸、纸胶带、剪裁边、虚线箭头和小贴图丰富。版式像一本打开的手账页或拼贴海报，层次多但仍然清晰。",
    "white-orange-blue": "白底主画面，橙蓝双色点题，模块干净规整，像简洁现代的信息卡。留白充足，强调轻量、专业、可读，不要太花。",
    daily: "像日报或简报信息图，模块化排版明确，标题和数字感强，色彩更正式。信息结构要像每天更新的一页简报，但不要新闻客户端截图感。",
  };

  if (style === "custom") {
    return appName === "做图"
      ? "用户选择了自定义风格。优先执行用户自己的视觉描述；如果用户没有写清楚，也要至少明确配色、材质、构图和字体气质，再生成。"
      : "用户选择了自定义风格，请优先遵从用户提供的风格说明。";
  }

  return directives[style] ?? "";
}

function extractReferenceImages(values: Record<string, FieldValue>) {
  const references: string[] = [];
  const candidateValues = [values.reference_image, values.portrait_reference_image];

  for (const candidate of candidateValues) {
    const images = Array.isArray(candidate) ? candidate : [candidate];
    references.push(...images.filter((image): image is string => typeof image === "string" && image.startsWith("data:image/")));
  }

  return references;
}

function parseSharedTrafficEvidencePack(raw: string): TrafficEvidencePack | null {
  if (!raw.trim()) return null;
  try {
    const value = JSON.parse(raw) as Partial<TrafficEvidencePack>;
    if (value.version !== 2 || !Array.isArray(value.claims) || !Array.isArray(value.topicMaterials) || !value.searchPlan) return null;
    return value as TrafficEvidencePack;
  } catch {
    return null;
  }
}

function parseTrafficTopicProcess(raw: string): Record<string, unknown> | null {
  if (!raw.trim()) return null;
  try {
    const value = JSON.parse(raw) as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}
