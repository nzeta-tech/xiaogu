import { generateImageSet } from "@/lib/agent/image-generator";
import { runInsuranceContentAgent, streamInsuranceContentAgent } from "@/lib/agent/insurance-agent";
import { getCreationAppBySlug, type CreationField } from "@/lib/apps/catalog";
import { reportUsage } from "@/lib/billing/openmeter";
import {
  buildCreationOutputJson,
  isEmptyCreationFieldValue,
  stringifyCreationFieldValue,
  summarizeTitle,
  type CreationFieldValue,
} from "@/lib/creation/output";
import { buildCreationPromptContext } from "@/lib/creation/prompt-context";
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
  const app = (await tryGetCreationAppBySlug(input.slug)) ?? getCreationAppBySlug(input.slug);
  if (!app) {
    throw new Error("应用不存在");
  }

  const thinkingSnapshot = app.requiresThinking ? await tryGetLatestThinkingProfileSnapshot(input.userId) : null;
  if (app.requiresThinking && !thinkingSnapshot) {
    throw new Error("这个应用需要先完成思维问卷，再生成更像你的内容。");
  }

  const values = input.values ?? {};
  const missingField = app.fields.find((field) => field.required && isEmptyCreationFieldValue(values[field.id]));
  if (missingField) {
    throw new Error(`${missingField.label}还没有填写。`);
  }

  const caseContext = buildCreationPromptContext(app.slug);

  const prompt = app.slug === "write-copy"
    ? buildWriteCopyPrompt(values, caseContext, thinkingSnapshot?.snapshot_json ?? null, thinkingSnapshot?.summary_json ?? null)
    : values.source && typeof values.source === "string"
      ? [
          ...caseContext,
          app.promptHint,
          values.source,
        ].filter(Boolean).join("\n\n")
      : `${app.name}\n${caseContext.join("\n")}${caseContext.length > 0 ? "\n" : ""}${app.promptHint}\n${app.fields.map((field) => `${field.label}：${stringifyCreationFieldValue(values[field.id])}`).join("\n")}`;
  const imagePrompt = app.resultType === "image" || app.resultType === "image-plan"
    ? buildImagePrompt(app.name, app.fields, values, caseContext, app.promptHint)
    : null;
  const resolvedPrompt = imagePrompt ?? prompt;

  const run = input.existingRunId
    ? { id: input.existingRunId, created_at: "" }
    : await tryCreateAppRun({
        userId: input.userId,
        appCode: app.slug,
        tone: app.slug === "write-copy" ? stringifyCreationFieldValue(values.tone) || "self" : "",
        targetChannels: Array.isArray(values.targets) ? values.targets : [],
        inputPayload: values,
        resolvedPrompt,
        quotaCost: input.quotaCost,
        model: process.env.MODEL_NAME ?? "configured-model",
      });

  if (!input.existingRunId && input.workId && run?.id) {
    await tryUpdateWorkContent({
      userId: input.userId,
      workId: input.workId,
      appRunId: run.id,
      title: `${app.name}｜正在生成`,
      content: "",
      contentJson: { batches: [] },
    });
  }

  await input.onEvent?.({ type: "meta", runId: run?.id ?? null });

  let result = "";
  let resultJson: Record<string, unknown> | undefined;

  try {
    if (app.resultType === "image" || app.resultType === "image-plan") {
      const imageResult =
        app.resultType === "image"
          ? await generateImageSet({
              prompt: imagePrompt ?? "",
              style: stringifyCreationFieldValue(values.style) || app.name,
              ratio: stringifyCreationFieldValue(values.ratio) || "1:1",
              count: 1,
            })
          : null;

      result =
        app.resultType === "image"
          ? imageResult?.summary ?? buildImagePlan(app.name, app.fields, values, caseContext, app.promptHint)
          : buildImagePlan(app.name, app.fields, values, caseContext, app.promptHint);
      resultJson = {
        contentJson: buildCreationOutputJson(result, []),
        images: imageResult?.images ?? [],
        imageMode: imageResult?.mode ?? null,
        retryable: imageResult?.retryable ?? false,
      };

      await input.onEvent?.({ type: "delta", content: result });
      await input.onEvent?.({
        type: "images",
        images: imageResult?.images ?? [],
        imageMode: imageResult?.mode ?? null,
        retryable: imageResult?.retryable ?? false,
      });

      if (app.resultType === "image" && imageResult?.mode !== "image") {
        const errorMessage = imageResult?.retryable
          ? "图片生成失败，当前上游服务繁忙或超时，请稍后重试。"
          : "图片生成失败，请稍后重试。";
        throw imageResult?.retryable ? new RetryableCreationRunError(errorMessage) : new Error(errorMessage);
      }
    } else {
      const styleMode = app.slug === "write-copy" ? "general" : "traffic";
      for await (const chunk of streamInsuranceContentAgent([{ role: "user", content: prompt }], input.userId, styleMode)) {
        result += chunk;
        await input.onEvent?.({ type: "delta", content: chunk });
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
    await tryCompleteAppRun({
      runId: run?.id ?? null,
      status: "failed",
      resultText: result,
      resultJson,
      errorMessage: error instanceof Error ? error.message : "内容生成失败",
    });
    await input.onEvent?.({ type: "error", content: error instanceof Error ? error.message : "内容生成失败" });
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

  const title = `${app.name}｜${summarizeTitle(values, app.fields.map((field) => field.id))}`;
  const contentJson =
    (resultJson?.contentJson as Record<string, unknown> | undefined) ??
    buildCreationOutputJson(result, Array.isArray(values.targets) ? values.targets : []);

  await tryCompleteAppRun({
    runId: run?.id ?? null,
    status: "succeeded",
    resultText: result,
    resultJson,
  });

  const work = input.workId
    ? await tryUpdateWorkContent({
        userId: input.userId,
        workId: input.workId,
        appRunId: run?.id ?? null,
        title,
        content: result,
        contentJson,
      })
    : null;

  await reportUsage({
    customerId: input.userId,
    action: "write_script",
    amount: input.quotaCost,
    metadata: {
      appId: app.id,
      appSlug: app.slug,
      resultType: app.resultType,
      streamed: Boolean(input.onEvent),
    },
  });

  await trySaveUsageLog({
    userId: input.userId,
    actionType: "creation_app_run",
    quotaCost: input.quotaCost,
    model: process.env.MODEL_NAME ?? "configured-model",
    metadata: {
      appId: app.id,
      appSlug: app.slug,
      resultType: app.resultType,
      streamed: Boolean(input.onEvent),
      workId: work?.id ?? input.workId ?? null,
      appRunId: run?.id ?? null,
    },
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
  const targetNames = targets.map((target) => {
    if (target === "video_script") return "短视频口播";
    if (target === "xiaohongshu") return "小红书笔记";
    if (target === "wechat_article") return "公众号文章";
    if (target === "moments") return "朋友圈文案";
    return target;
  });

  return [
    "你现在在执行小谷应用：写文案。",
    "请直接生成可以发布的成稿，并且当用户选择多个渠道时，必须严格按“【渠道名】”作为分段标题输出。",
    "如果某个渠道适合输出多版，请在该渠道内继续拆分多条内容。",
    ...caseContext,
    caseContext.length > 0 ? "" : "",
    `本次语气偏好：${tone}`,
    ...(brief
      ? [
          `长期人物底盘：人设底色=${brief.persona || "未提供"}；核心客群=${brief.targetAudience || "未提供"}；擅长主题=${brief.specialty || "未提供"}；表达偏好=${brief.topicPreference || "未提供"}。`,
        ]
      : []),
    `本次目标渠道：${targetNames.join("、") || "未指定"}`,
    "原始素材：",
    source,
  ].join("\n");
}

function buildImagePlan(appName: string, fields: CreationField[], values: Record<string, FieldValue>, caseContext: string[], hint: string) {
  const style = stringifyCreationFieldValue(values.style) || "默认风格";
  const ratio = stringifyCreationFieldValue(values.ratio) || "1:1";
  const source = stringifyCreationFieldValue(values.source) || "未提供素材";
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
    "图片卡片方案：",
    "1. 封面卡：用一句最容易传播的结论做标题。",
    "2. 拆解卡：把核心观点拆成 3 个层次。",
    "3. 场景卡：补一个客户最容易代入的生活场景。",
    "4. 行动卡：给出互动提问或私信关键词。",
    "",
    "图片文案底稿：",
    source,
  ];

  const customFields = fields
    .filter((field) => !["style", "ratio", "source", "signature"].includes(field.id))
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
  const lines = [`你现在在执行小谷图片类应用：${appName}。请生成适合获客内容场景的视觉图。`, ...caseContext, caseContext.length > 0 ? "" : "", hint];
  for (const field of fields) {
    const value = values[field.id];
    if (isEmptyCreationFieldValue(value)) continue;
    if (field.id === "reference_image") {
      lines.push(`${field.label}：已上传参考图，请参考其主体关系、构图倾向和人物设定。`);
      continue;
    }
    lines.push(`${field.label}：${Array.isArray(value) ? value.join("、") : value}`);
  }
  lines.push("要求：突出标题可读性、层级清晰、适合知识卡片或公众号配图。避免夸张营销海报风，整体要像专业内容创作者的卡片。\n");
  return lines.join("\n");
}
