import { generateImageSet } from "@/lib/agent/image-generator";
import { runInsuranceContentAgent, streamInsuranceContentAgent } from "@/lib/agent/insurance-agent";
import { getCreationAppBySlug, type CreationField } from "@/lib/apps/catalog";
import { getEntryAdjustedApp } from "@/lib/apps/entry-app";
import { reportUsage } from "@/lib/billing/openmeter";
import { checkCompliance } from "@/lib/compliance/check";
import {
  buildCreationOutputJson,
  isEmptyCreationFieldValue,
  stringifyCreationFieldValue,
  summarizeTitle,
  type CreationFieldValue,
} from "@/lib/creation/output";
import { buildCreationPromptContext } from "@/lib/creation/prompt-context";
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
  const entry = typeof input.values?.app_entry === "string" ? input.values.app_entry.trim() : "";
  const effectiveApp = getEntryAdjustedApp(app, entry);

  const thinkingSnapshot = effectiveApp.requiresThinking ? await tryGetLatestThinkingProfileSnapshot(input.userId) : null;
  if (effectiveApp.requiresThinking && !thinkingSnapshot) {
    throw new Error("这个应用需要先完成思维问卷，再生成更像你的内容。");
  }

  const values = input.values ?? {};
  const missingField = effectiveApp.fields.find((field) => field.required && isEmptyCreationFieldValue(values[field.id]));
  if (missingField) {
    throw new Error(`${missingField.label}还没有填写。`);
  }

  const caseContext = buildCreationPromptContext(app, entry);

  const prompt = app.slug === "write-copy"
    ? buildWriteCopyPrompt(values, caseContext, thinkingSnapshot?.snapshot_json ?? null, thinkingSnapshot?.summary_json ?? null)
    : isMultiChannelCopyAppSlug(app.slug)
      ? buildLeadCopyPrompt(effectiveApp.fields, values, effectiveApp.promptHint, caseContext, getMultiChannelCopyVariant(app.slug))
    : app.slug === "general-content"
      ? buildGeneralContentPrompt(values, caseContext, effectiveApp.promptHint)
    : app.slug === "xiaohongshu-check"
      ? buildXiaohongshuCheckPrompt(values, caseContext, effectiveApp.promptHint)
    : app.slug === "video-script-polish"
      ? buildVideoScriptPolishPrompt(values, caseContext, effectiveApp.promptHint)
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
    ? buildImagePrompt(effectiveApp.name, effectiveApp.fields, values, caseContext, effectiveApp.promptHint)
    : null;
  const resolvedPrompt = imagePrompt ?? prompt;

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
        model: process.env.MODEL_NAME ?? "configured-model",
      });

  if (!input.existingRunId && input.workId && run?.id) {
    await tryUpdateWorkContent({
      userId: input.userId,
      workId: input.workId,
      appRunId: run.id,
        title: `${effectiveApp.name}｜正在生成`,
        content: "",
        contentJson: { batches: [] },
    });
  }

  await input.onEvent?.({ type: "meta", runId: run?.id ?? null });

  let result = "";
  let resultJson: Record<string, unknown> | undefined;

  try {
    if (effectiveApp.resultType === "image" || effectiveApp.resultType === "image-plan") {
      const imageResult =
        effectiveApp.resultType === "image"
          ? await generateImageSet({
              prompt: imagePrompt ?? "",
              style: stringifyCreationFieldValue(values.style) || app.name,
              ratio: stringifyCreationFieldValue(values.ratio) || (app.slug === "wechat-images" ? "3:4" : "1:1"),
              count: app.slug === "wechat-images" ? 4 : 1,
              referenceImages: extractReferenceImages(values),
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

  const titleFields = isMultiChannelCopyAppSlug(app.slug) ? ["source"] : effectiveApp.fields.map((field) => field.id);
  const title = `${effectiveApp.name}｜${summarizeTitle(values, titleFields)}`;
  const contentJson =
    (resultJson?.contentJson as Record<string, unknown> | undefined) ??
    buildCreationOutputJson(result, Array.isArray(values.targets) ? values.targets : []);
  const complianceRisk = checkCompliance(result).riskLevel;

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
    model: process.env.MODEL_NAME ?? "configured-model",
    metadata: {
      appId: app.id,
      appSlug: app.slug,
      resultType: effectiveApp.resultType,
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
