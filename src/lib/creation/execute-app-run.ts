import { generateImageSet } from "@/lib/agent/image-generator";
import { runInsuranceContentAgent, streamInsuranceContentAgent } from "@/lib/agent/insurance-agent";
import { type CreationField } from "@/lib/apps/catalog";
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
import {
  tryCompleteAppRun,
  tryCreateAppRun,
  tryGetCreationAppBySlug,
  tryGetLatestThinkingProfileSnapshot,
  trySaveUsageLog,
  trySyncCreationCatalog,
  tryUpdateWorkContent,
} from "@/lib/db/repositories";
import { buildThinkingProfileBrief, type ThinkingProfileSnapshot, type ThinkingProfileSummary } from "@/lib/thinking/profile-snapshot";
import { logAvatarVisualUsage, resolveAvatarVisualReferences } from "@/lib/avatar/visual-assets";
import { getCreationUserError } from "@/lib/creation/errors";
import { buildLinkRemixResearchContext } from "@/lib/creation/link-remix-research";

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
    type: "meta" | "delta" | "images" | "done" | "error";
    runId?: string | null;
    content?: string;
    work?: { id?: string; title?: string } | null;
    images?: Array<{ id: string; url: string }>;
    imageMode?: string | null;
    retryable?: boolean;
  }) => void | Promise<void>;
}) {
  await trySyncCreationCatalog();
  const app = await tryGetCreationAppBySlug(input.slug);
  if (!app) {
    throw new Error("应用不存在");
  }
  const entry = typeof input.values?.app_entry === "string" ? input.values.app_entry.trim() : "";
  const effectiveApp = getEntryAdjustedApp(app, entry);

  const thinkingSnapshot = effectiveApp.requiresThinking ? await tryGetLatestThinkingProfileSnapshot(input.userId) : null;
  if (effectiveApp.requiresThinking && !thinkingSnapshot) {
    throw new Error("这个应用需要先完成思维问卷，再生成更像你的内容。");
  }

  const values = input.values ?? {};
  const isPolicyRenewalCard = app.slug === "policy-renewal-card";
  const missingField = effectiveApp.fields.find((field) => field.required && isEmptyCreationFieldValue(values[field.id]));
  if (missingField) {
    throw new Error(`${missingField.label}还没有填写。`);
  }
  if (isPolicyRenewalCard && stringifyCreationFieldValue(values.confirmation) !== "confirmed") {
    throw new Error("请先确认已经核对日期、金额、币种和保单号。");
  }
  const visualAssetIds = Array.isArray(values.avatar_visual_asset_ids) ? values.avatar_visual_asset_ids.filter(Boolean).slice(0, isPolicyRenewalCard ? 1 : 4) : [];
  const needsAvatarPhoto = entry === "personality-card" || app.slug === "image-card" && values.draw_portrait === "yes" || (app.slug === "wechat-images" || isPolicyRenewalCard) && values.avatar_visual_mode === "yes";
  if (needsAvatarPhoto && visualAssetIds.length === 0 && isEmptyCreationFieldValue(values.reference_image)) {
    throw new Error("请选择数字分身形象照，或临时上传一张形象照。");
  }

  const caseContext = buildCreationPromptContext(app, entry);
  const linkRemixResearch = app.slug === "link-remix"
    ? await buildLinkRemixResearchContext(values)
    : "";

  const prompt = isPolicyRenewalCard
    ? "保单续费提醒卡使用服务端模板精确排版，客户与保单字段不发送给图片模型。"
    : app.slug === "write-copy"
    ? buildWriteCopyPrompt(values, caseContext, thinkingSnapshot?.snapshot_json ?? null, thinkingSnapshot?.summary_json ?? null)
    : isMultiChannelCopyAppSlug(app.slug)
      ? buildLeadCopyPrompt(effectiveApp.fields, values, effectiveApp.promptHint, caseContext, getMultiChannelCopyVariant(app.slug))
    : app.slug === "general-content"
      ? buildGeneralContentPrompt(values, caseContext, effectiveApp.promptHint)
    : app.slug === "link-remix"
      ? buildLinkRemixPrompt(values, caseContext, effectiveApp.promptHint, linkRemixResearch)
    : app.slug === "xiaohongshu-check"
      ? buildXiaohongshuCheckPrompt(values, caseContext, effectiveApp.promptHint)
    : app.slug === "video-script-polish"
      ? buildVideoScriptPolishPrompt(values, caseContext, effectiveApp.promptHint)
    : app.slug === "live-script"
      ? buildLiveScriptPrompt(values, caseContext, effectiveApp.promptHint)
    : app.slug === "letter"
      ? buildLetterPrompt(values, caseContext, effectiveApp.promptHint)
      : app.slug === "topic-picker"
        ? buildTopicPickerPrompt(values, caseContext, effectiveApp.promptHint, thinkingSnapshot?.snapshot_json ?? null, thinkingSnapshot?.summary_json ?? null)
      : values.source && typeof values.source === "string"
        ? [
            ...caseContext,
            effectiveApp.promptHint,
            values.source,
          ].filter(Boolean).join("\n\n")
        : `${effectiveApp.name}\n${caseContext.join("\n")}${caseContext.length > 0 ? "\n" : ""}${effectiveApp.promptHint}\n${effectiveApp.fields.map((field) => `${field.label}：${stringifyCreationFieldValue(values[field.id])}`).join("\n")}`;
  const imagePrompt = effectiveApp.resultType === "image" || effectiveApp.resultType === "image-plan"
    ? isPolicyRenewalCard
      ? buildPolicyRenewalImagePrompt(values)
      : buildImagePrompt(effectiveApp.name, effectiveApp.fields, values, caseContext, effectiveApp.promptHint)
    : null;
  const resolvedPrompt = imagePrompt ?? prompt;
  const pendingTitle = buildWorkTitle({
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
          : process.env.MODEL_NAME ?? "configured-model",
      });

  if (!input.existingRunId && input.workId && run?.id) {
    await tryUpdateWorkContent({
      userId: input.userId,
      workId: input.workId,
      appRunId: run.id,
      title: pendingTitle,
        content: "",
        contentJson: { batches: [] },
    });
  }

  await input.onEvent?.({ type: "meta", runId: run?.id ?? null });

  let result = "";
  let resultJson: Record<string, unknown> | undefined;

  try {
    if (effectiveApp.resultType === "image" || effectiveApp.resultType === "image-plan") {
      const visualReferences = await resolveAvatarVisualReferences({
        userId: input.userId,
        assetIds: visualAssetIds,
        appSlug: entry === "personality-card" ? "personality-card" : app.slug,
      });
      if (needsAvatarPhoto && visualAssetIds.length > 0 && visualReferences.length === 0) {
        throw new Error("数字分身形象照当前不可用，请检查隐私设置、照片状态和使用范围。");
      }
      const imageResult =
        effectiveApp.resultType === "image"
          ? await generateImageSet({
              prompt: imagePrompt ?? "",
              style: stringifyCreationFieldValue(values.style) || app.name,
              ratio: stringifyCreationFieldValue(values.ratio) || (app.slug === "wechat-images" ? "3:4" : "1:1"),
              count: isPolicyRenewalCard || app.slug !== "wechat-images" ? 1 : 4,
              referenceImages: [...visualReferences.map((item) => item.dataUrl), ...extractReferenceImages(values)].slice(0, 4),
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
      const styleMode = app.slug === "write-copy" ? "general" : getMultiChannelCopyStyleMode(app.slug);
      // A full multi-channel run can contain ten publishable pieces, including
      // two long-form articles. Generate each channel separately so a model's
      // per-response output cap cannot leave the result at only the first
      // channel (normally the video scripts).
      const prompts = app.slug === "write-copy"
        ? buildWriteCopyChannelPrompts(values, caseContext, thinkingSnapshot?.snapshot_json ?? null, thinkingSnapshot?.summary_json ?? null)
        : [prompt];

      for (const channelPrompt of prompts) {
        for await (const chunk of streamInsuranceContentAgent([{ role: "user", content: channelPrompt }], input.userId, styleMode)) {
          result += chunk;
          await input.onEvent?.({ type: "delta", content: chunk });
        }
        if (result.trim() && !result.endsWith("\n")) {
          result += "\n\n";
          await input.onEvent?.({ type: "delta", content: "\n\n" });
        }
      }

      if (!result.trim()) {
        const fallback = await runInsuranceContentAgent([{ role: "user", content: prompt }], input.userId, styleMode);
        result = fallback.trim();
        if (result) {
          await input.onEvent?.({ type: "delta", content: result });
        }
      }

      resultJson = {
        contentJson: buildCreationOutputJson(result, Array.isArray(values.targets) ? values.targets : []),
      };
    }
  } catch (error) {
    const userError = getCreationUserError(error);
    await tryCompleteAppRun({
      runId: run?.id ?? null,
      status: "failed",
      resultText: result,
      resultJson,
      errorMessage: error instanceof Error ? error.message : userError,
    });
    await input.onEvent?.({ type: "error", content: userError });
    throw error;
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

  const title = buildWorkTitle({
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

  const work = input.workId
    ? await tryUpdateWorkContent({
        userId: input.userId,
        workId: input.workId,
        appRunId: run?.id ?? null,
        title,
        content: result,
        contentJson,
        complianceRisk,
      })
    : null;

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
      : process.env.MODEL_NAME ?? "configured-model",
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
    work: work ? { id: work.id, title: work.title } : input.workId ? { id: input.workId, title } : null,
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
    "这是小谷的保险内容选题规划任务。请按下述输出契约生成，不复写任何示例内容。",
    ...caseContext,
    `应用提示：${promptHint}`,
    brief
      ? `长期人物底盘：人设底色=${brief.persona || "未提供"}；核心客群=${brief.targetAudience || "未提供"}；擅长主题=${brief.specialty || "未提供"}；表达偏好=${brief.topicPreference || "未提供"}。`
      : "长期人设底盘：用户未提供完整人设画像，请用资深保险内容顾问视角生成。",
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
    "你是一位擅长保险经纪人直播间内容设计的直播策划顾问。",
    "这是一篇可以直接阅读、复制和继续编辑的直播内容稿，不是问卷分析，也不是把提示词逐条回答的执行清单。",
    ...caseContext,
    `应用提示：${promptHint}`,
    "",
    "写作原则：",
    "1. 先提炼用户观点的核心矛盾、受众痛点和一句话主张，再展开直播内容。",
    "2. 语言像真人主播：短句、口语、自然停顿，有承接和互动，不写成论文或营销长文。",
    "3. 观点不明确的地方可以做合理结构化，但不得替用户编造产品、案例、数据、身份或承诺。",
    "4. 保险表达必须合规：不承诺收益、承保或理赔，不制造恐慌，不夸大产品；缺少事实时标注“待核实”。",
    "5. 转化要轻，以评论关键词、私信咨询、预约梳理和领取清单为主，不做强逼单。",
    "",
    "请只输出一篇完整内容，使用 Markdown 标题层级，不要使用【】作为章节标题，不要使用 Markdown 表格，不要输出“以下是”“好的”等前言：",
    "# 保险直播稿",
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
  const targets = Array.isArray(values.targets) ? values.targets : [];
  const wantsVideoScript = targets.includes("video_script");
  const targetLabels: Record<string, string> = {
    video_script: "口播文案（2篇）",
    wechat_article: "微信公众号文章（1篇）",
    xiaohongshu: "小红书笔记（2篇）",
    moments: "朋友圈文案（3条）",
  };
  const selectedTypes = targets.map((target) => targetLabels[target] ?? target).join("、") || "按用户选择的渠道";

  return [
    "你现在在执行小谷应用：爆款二创。",
    "这是一个面向保险顾问的内容再创作任务。链接可能只能提供有限的公开信息，因此不要声称已经读取到链接中不存在的全文、数据或画面。",
    ...caseContext,
    `应用提示：${promptHint}`,
    `原作品平台：${platform}`,
    `原作品链接：${url}`,
    `原作品标题或开头：${sourceTitle || "未提供"}`,
    `作者或账号：${sourceAuthor || "未提供"}`,
    `详情页发布时间：${publishedAt || "未核验"}`,
    `详情页点赞数：${likeCount || "未核验"}`,
    `来源内容形态：${contentType || "未确认"}`,
    `自动归类主题：${topic || "未确认"}`,
    `自动提取标签：${tags || "未确认"}`,
    `可核验事实证据摘要：${evidence || "未提供"}`,
    `作品文字内容：${sourceText || "未提供"}`,
    `作品语音转写：${transcript || "未提供"}`,
    researchContext,
    angle
      ? `用户补充的想法建议：${angle}`
      : "用户未补充想法建议，请结合用户的内容画像、保险顾问身份、目标客户和账号特点完成二创。",
    `本次输出渠道：${selectedTypes}`,
    "先在内部做参考作品预检：检查发布时间是否在研究时间前30天内且可核验；点赞数是否为详情页明确标注且严格大于1000；链接是否是单条作品而非检索页；作者和事实证据是否清楚；是否为重复搬运、纯产品推销、无法访问或证据不足。任何硬过滤项不满足时，不把该作品的具体数据、案例或产品结论作为事实依据，也不要用猜测补齐；不得在最终渠道正文输出预检过程或结论。",
    "仅供内部判断时，可按40分元数据评分：主题匹配12分、信息增量8分、来源清晰度7分、证据线索6分、时效与适用性4分、可转写性3分。24分以下时只借鉴可迁移结构，不直接套用具体事实。",
    transcript ? "已有完整转写时，仅供内部判断可按100分转写评分：信息增量30分、证据强度20分、实施具体性15分、来源接近度10分、主题相关性10分、风险边界8分、编辑可用性4分、时效与可迁移性3分；总分低于70分，或信息增量低于18分、证据强度低于10分时，只保留结构与用户问题，不直接沿用具体结论。" : "未提供完整转写，不得声称已完成逐字稿级别分析。",
    "采用高保真结构改写：尽量保留原作的核心矛盾、目标人群、钩子类型、论证顺序、信息单元数量、情绪节奏和 CTA 位置；随后完全换成原创表达。对每个原作信息单元，优先保留可核验事实；不能直接使用但已有补充检索资料的，用同等具体的可信事实、场景或行动步骤替代；只有收益承诺、产品结论、不可核验案例、原句和独特比喻必须删除。不得用“风险、规划、现金流、安全感”等泛化词替代原作全部具体内容。",
    wantsVideoScript
      ? [
          "短视频口播创作要求：",
          "1. 先在心中判断参考作品最接近哪一种口播母型：个人经历、客户/理赔故事、观点类比、问题回应、团队/职业使命、方案规划或其他；借鉴其叙事机制，不要照搬原视频表述。",
          "2. 每条口播只选择一种钩子：结果、原话、场景、问题、对比或身份。前两句必须出现具体结果、具体人、具体场景、具体疑问或具体对比中的至少一项；禁止用“很多人都不知道”“你以为”“其实”这类模板开头。",
          "3. 每条口播按“钩子 -> 代入 -> 转折 -> 真实证据/具体场景 -> 核心判断 -> 情绪收束 -> 轻承接”推进。不是每段都要讲产品；先讲人和处境，再自然落到保险的意义、规划逻辑或专业服务。",
          "4. 两条必须采用不同的钩子和不同的切入路径：一条可偏真实场景或故事，另一条可偏问题、对比或观点；不得只是同一篇替换标题。",
          "5. 句子要适合直接念：钩子和金句使用短句，叙事和解释使用中句；每1-2句形成自然停顿，避免书面腔、连续罗列和平均用力。",
          "6. 每条只保留一个核心判断，并以一句可复述的金句收束。CTA 必须轻，优先评论关键词、私信沟通或预约梳理，不逼单、不制造焦虑。",
          "7. 默认每条300-500字；素材本身明显适合金句/类比型时可压缩至80-150字，明显适合个人经历或案例型时可扩展至600字以内。",
          "8. 输出时在“## 口播文案”下严格给出两条成稿，格式为“### 版本一｜[口播母型]”“### 版本二｜[口播母型]”。每条依次包含“标题：”“钩子类型：”“核心判断：”“正文：”“评论区承接：”，不要解释创作方法。",
        ].join("\n")
      : "",
    "如果无法访问链接，只能基于平台、链接、转写、补充检索资料和用户指定题材完成原创选题与文案；不要编造原作品细节。不要在任何可发布渠道正文中输出“参考链接内容待核验”、评分、过滤结论、证据缺口、二创说明或你的分析过程。",
    "所有保险产品、费率、收益、理赔、核保和政策信息都必须以用户提供且可核实的事实为准；缺少依据时写“待核实”或给出替换提示。不得承诺收益、保证理赔、制造恐慌或使用绝对化表述。",
    "请按用户选择的渠道输出完整结果。每个渠道单独用 Markdown 二级标题分组，并给出可直接复制的正文；口播要有开场钩子和自然收口，小红书要有标题、正文和话题，公众号要有标题、导语和完整结构，朋友圈要分别短而真实。只输出这些可发布渠道，不要输出参考作品评估、二创说明、评分、证据缺口或任何分析报告。",
    "不要输出额外前言，不要输出 Markdown 表格，不要使用代码块。",
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

function buildImagePrompt(appName: string, fields: CreationField[], values: Record<string, FieldValue>, caseContext: string[], hint: string) {
  const lines = [
    `你现在在执行小谷图片类应用：${appName}。请生成适合获客内容场景的视觉图。`,
    ...caseContext,
    caseContext.length > 0 ? "" : "",
    hint,
  ];
  const styleValue = stringifyCreationFieldValue(values.style);
  for (const field of fields) {
    const value = values[field.id];
    if (isEmptyCreationFieldValue(value)) continue;
    if (field.id === "reference_image") {
      lines.push(`${field.label}：已上传参考图。请尽量贴近参考图的配色、材质、笔触、留白、主体关系与版式节奏，但不要照搬其中的文字内容。`);
      continue;
    }
    lines.push(`${field.label}：${Array.isArray(value) ? value.join("、") : value}`);
  }
  const styleDirective = getImageStyleDirective(styleValue, appName);
  if (styleDirective) {
    lines.push(`风格细化：${styleDirective}`);
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
  const candidateValues = [values.reference_image];

  for (const candidate of candidateValues) {
    if (typeof candidate === "string" && candidate.startsWith("data:image/")) {
      references.push(candidate);
    }
  }

  return references;
}
