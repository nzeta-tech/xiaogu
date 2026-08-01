import { runInsuranceContentAgent } from "@/lib/agent/insurance-agent";
import { generateImageSet } from "@/lib/agent/image-generator";
import { getCreationAppBySlug, type CreationField } from "@/lib/apps/catalog";
import { requireSessionUser } from "@/lib/auth/session";
import { requireQuota } from "@/lib/billing/enforce";
import { reportUsage } from "@/lib/billing/openmeter";
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
  tryCreateWork,
  tryGetCreationAppBySlug,
  tryGetLatestThinkingProfileSnapshot,
  trySaveUsageLog,
  trySyncCreationCatalog,
} from "@/lib/db/repositories";
import { buildThinkingProfileBrief, formatThinkingProfileSnapshotForPrompt, type ThinkingProfileSnapshot, type ThinkingProfileSummary } from "@/lib/thinking/profile-snapshot";
import { logAvatarVisualUsage, resolveAvatarVisualReferences } from "@/lib/avatar/visual-assets";
import { getCreationUserError } from "@/lib/creation/errors";
import { buildWechatSectionImagePrompts } from "@/lib/creation/wechat-article-images";

type FieldValue = CreationFieldValue;

export async function GET(_: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  await trySyncCreationCatalog();
  const app = (await tryGetCreationAppBySlug(slug)) ?? getCreationAppBySlug(slug);
  if (!app) {
    return Response.json({ error: "应用不存在" }, { status: 404 });
  }

  return Response.json({ app });
}

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  await trySyncCreationCatalog();
  const app = (await tryGetCreationAppBySlug(slug)) ?? getCreationAppBySlug(slug);
  if (!app) {
    return Response.json({ error: "应用不存在" }, { status: 404 });
  }

  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const thinkingSnapshot = app.requiresThinking ? await tryGetLatestThinkingProfileSnapshot(user.id) : null;

  if (app.requiresThinking) {
    if (!thinkingSnapshot) {
      return Response.json({
        error: "这个应用需要先完成思维问卷，再生成更像你的内容。",
        needsThinking: true,
      }, { status: 400 });
    }
  }

  const body = (await request.json()) as { values?: Record<string, FieldValue> };
  const values = body.values ?? {};
  const isPolicyRenewalCard = app.slug === "policy-renewal-card";
  const isWechatStudioInternalStep = stringifyCreationFieldValue(values.studio_parent) === "wechat-studio"
    && (app.slug === "wechat-images" || app.slug === "wechat-cover");

  const missingField = app.fields.find((field) => field.required && isEmptyCreationFieldValue(values[field.id]));
  if (missingField) {
    return Response.json({ error: `${missingField.label}还没有填写。` }, { status: 400 });
  }
  if (isPolicyRenewalCard && stringifyCreationFieldValue(values.confirmation) !== "confirmed") {
    return Response.json({ error: "请先确认已经核对日期、金额、币种和保单号。" }, { status: 400 });
  }

  const quota = await requireQuota(user, "write_script");
  if (!quota.ok) return quota.response;

  const caseContext = buildCreationPromptContext(app.slug);

  const content = app.slug === "wechat-studio"
    ? buildWechatStudioPrompt(values, caseContext)
    : app.slug === "write-copy"
    ? buildWriteCopyPrompt(app.fields, values, caseContext, thinkingSnapshot?.snapshot_json ?? null, thinkingSnapshot?.summary_json ?? null)
    : isMultiChannelCopyAppSlug(app.slug)
      ? buildLeadCopyPrompt(app.fields, values, app.promptHint, caseContext, getMultiChannelCopyVariant(app.slug))
    : app.slug === "xiaohongshu-check"
      ? buildXiaohongshuCheckPrompt(values, caseContext, app.promptHint)
    : app.slug === "live-script"
      ? buildLiveScriptPrompt(values, caseContext, app.promptHint)
    : app.slug === "ip-positioning"
      ? buildIpPositioningPrompt(app.fields, values, app.promptHint, caseContext, thinkingSnapshot?.snapshot_json ?? null, thinkingSnapshot?.summary_json ?? null)
        : buildPrompt(app.name, app.fields, values, app.promptHint, caseContext, thinkingSnapshot?.snapshot_json ?? null, thinkingSnapshot?.summary_json ?? null);
  const imagePrompt = isPolicyRenewalCard
    ? buildPolicyRenewalImagePrompt(values)
    : buildImagePrompt(app.name, app.fields, values, caseContext, app.promptHint);
  const resolvedPrompt = app.resultType === "image" || app.resultType === "image-plan" ? imagePrompt : content;
  const visualAssetIds = Array.isArray(values.avatar_visual_asset_ids) ? values.avatar_visual_asset_ids.filter(Boolean).slice(0, isPolicyRenewalCard ? 1 : 4) : [];
  const entry = typeof values.app_entry === "string" ? values.app_entry.trim() : "";
  const needsAvatarPhoto = entry === "personality-card" || app.slug === "image-card" && values.draw_portrait === "yes" || (app.slug === "wechat-images" || isPolicyRenewalCard) && values.avatar_visual_mode === "yes";
  if (needsAvatarPhoto && visualAssetIds.length === 0 && isEmptyCreationFieldValue(values.reference_image)) {
    return Response.json({ error: "请选择数字分身形象照，或临时上传一张形象照。" }, { status: 400 });
  }
  const visualReferences = app.resultType === "image"
    ? await resolveAvatarVisualReferences({ userId: user.id, assetIds: visualAssetIds, appSlug: entry === "personality-card" ? "personality-card" : app.slug })
    : [];
  const wechatImagePlan = app.slug === "wechat-images"
    ? buildWechatSectionImagePrompts(stringifyCreationFieldValue(values.article), imagePrompt, 5)
    : null;
  if (needsAvatarPhoto && visualAssetIds.length > 0 && visualReferences.length === 0) {
    return Response.json({ error: "数字分身形象照当前不可用，请检查隐私设置、照片状态和使用范围。" }, { status: 400 });
  }
  const imageResult =
    app.resultType === "image" || app.resultType === "image-plan"
      ? await generateImageSet({
          prompt: imagePrompt,
          style: stringifyValue(values.style) || app.name,
          ratio: stringifyValue(values.ratio) || (app.slug === "wechat-images" ? "3:2" : "1:1"),
          count: wechatImagePlan?.prompts.length ?? 1,
          variantPrompts: wechatImagePlan?.prompts,
          referenceImages: [...visualReferences.map((item) => item.dataUrl), ...extractReferenceImages(values)].slice(0, 4),
          })
      : null;

  const run = await tryCreateAppRun({
    userId: user.id,
    appCode: app.slug,
    tone: app.slug === "write-copy"
      ? stringifyValue(values.tone) || "self"
      : isMultiChannelCopyAppSlug(app.slug)
        ? stringifyValue(values.tone)
        : "",
    targetChannels: Array.isArray(values.targets) ? values.targets : [],
    inputPayload: values,
    resolvedPrompt,
    quotaCost: quota.quotaCost,
    model: isPolicyRenewalCard ? process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1" : process.env.MODEL_NAME ?? "configured-model",
  });

  let result = "";
  try {
    result =
      app.resultType === "image"
        ? imageResult?.summary ?? buildImagePlan(app.name, app.fields, values, caseContext, app.promptHint)
        : app.resultType === "image-plan"
          ? buildImagePlan(app.name, app.fields, values, caseContext, app.promptHint)
          : await runInsuranceContentAgent(
              [{ role: "user", content }],
              user.id,
              app.slug === "write-copy" || app.slug === "ip-positioning" ? "general" : getMultiChannelCopyStyleMode(app.slug),
            );
  } catch (error) {
    const userError = getCreationUserError(error);
    await tryCompleteAppRun({
      runId: run?.id ?? null,
      status: "failed",
      resultText: "",
      errorMessage: error instanceof Error ? error.message : userError,
      resultJson: {
        images: imageResult?.images ?? [],
        imageMode: imageResult?.mode ?? null,
      },
    });
    return Response.json({ error: userError }, { status: 500 });
  }

  const title = buildWorkTitle({
    appName: app.name,
    appSlug: app.slug,
    values,
    result: app.resultType === "text" ? result : null,
  });
  const contentJson = buildCreationOutputJson(result, Array.isArray(values.targets) ? values.targets : []);
  await tryCompleteAppRun({
    runId: run?.id ?? null,
    status: "succeeded",
    resultText: result,
    resultJson: {
      contentJson,
      images: imageResult?.images ?? [],
      imageMode: imageResult?.mode ?? null,
      avatarVisualAssetIds: visualReferences.map((item) => item.id),
      imageSections: wechatImagePlan?.sections ?? [],
    },
  });

  const work = isWechatStudioInternalStep
    ? null
    : await tryCreateWork({
        userId: user.id,
        appRunId: run?.id ?? null,
        appCode: app.slug,
        title,
        content: result,
        contentJson,
        sourceChannel: app.slug,
        complianceRisk: "unchecked",
      });

  await reportUsage({
    customerId: user.id,
    action: "write_script",
    amount: quota.quotaCost,
    metadata: {
      appId: app.id,
      appSlug: app.slug,
      resultType: app.resultType,
    },
  });

  await trySaveUsageLog({
    userId: user.id,
    actionType: "creation_app_run",
    quotaCost: quota.quotaCost,
    model: isPolicyRenewalCard ? process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1" : process.env.MODEL_NAME ?? "configured-model",
    metadata: {
      appId: app.id,
      appSlug: app.slug,
      resultType: app.resultType,
      workId: work?.id ?? null,
      appRunId: run?.id ?? null,
    },
  });
  await logAvatarVisualUsage({
    userId: user.id,
    assetIds: visualReferences.map((item) => item.id),
    workId: work?.id ?? null,
    appRunId: run?.id ?? null,
    contextType: app.slug,
  });

  return Response.json({
    ok: true,
    app: {
      id: app.id,
      slug: app.slug,
      name: app.name,
      resultType: app.resultType,
    },
    draft: work ? { id: work.id, title: work.title } : null,
    work,
    result,
    images: imageResult?.images ?? [],
    imageSections: wechatImagePlan?.sections ?? [],
    imageMode: imageResult?.mode ?? null,
  });
}

function buildPrompt(
  appName: string,
  fields: CreationField[],
  values: Record<string, FieldValue>,
  hint: string,
  caseContext: string[],
  snapshot: ThinkingProfileSnapshot | null,
  summary: ThinkingProfileSummary | null,
) {
  const brief = snapshot ? buildThinkingProfileBrief(snapshot, summary ?? undefined) : null;
  const lines = [
    `你现在在执行小谷应用：${appName}。`,
    ...caseContext,
    "",
    hint,
    "请按应用中心的正式创作结果输出，不要解释你是模型，不要出现测试、模拟、第一版等开发口吻。",
    "输出结构建议：",
    "1. 先给出可直接使用的创作结果。",
    "2. 如用户选择了多个生成内容，请分模块输出，每个模块标题清晰。",
    "3. 结尾补充发布建议、承接动作或使用提醒。",
    "",
    ...(brief
      ? [
          "长期人物底盘：",
          `- 人设底色：${brief.persona || "未提供"}`,
          `- 核心客群：${brief.targetAudience || "未提供"}`,
          `- 擅长主题：${brief.specialty || "未提供"}`,
          `- 表达偏好：${brief.topicPreference || "未提供"}`,
          "",
        ]
      : []),
    "表单信息：",
  ];
  for (const field of fields) {
    const value = values[field.id];
      if (isEmptyCreationFieldValue(value)) continue;
    lines.push(`- ${field.label}：${Array.isArray(value) ? value.join("、") : value}`);
  }
  return lines.join("\n");
}

function buildWechatStudioPrompt(values: Record<string, FieldValue>, caseContext: string[]) {
  const audience = stringifyValue(values.audience) || "普通读者";
  const tone = stringifyValue(values.tone) || "专业但易懂";
  const topic = stringifyValue(values.topic);
  return [
    "你正在为微信公众号写一篇完整长文，不是短视频口播稿，不是小红书笔记，也不是营销话术。",
    ...caseContext,
    "写作目标：让读者在 3-5 分钟内读懂一个具体问题，并对作者建立专业、可信的信任。",
    "严格要求：不要使用口播开场、短促断句、‘家人们’‘朋友们’‘你知道吗’等短视频表达；不要用表情符号、编号清单堆砌或强推销 CTA。",
    "文章结构：",
    "1. 第一行只输出一个 Markdown 一级标题（不加‘标题：’）。",
    "2. 用一个具体场景、提问或反常识判断开篇，约 150 字，迅速交代读者为何值得读。",
    "3. 正文分 3-4 个 Markdown 二级标题，每节 250-450 字；以完整段落自然论证，有具体场景才写具体场景，没有依据不得虚构案例、数据或经历。",
    "4. 结尾回扣核心判断，给一个温和、自然的行动建议；不得强迫私信、购买或制造焦虑。",
    "5. 总字数约 1200-1800 字。段落应适合公众号阅读，每段 2-4 句。",
    "6. 保险相关表达须合规：不承诺收益、承保或理赔；产品、案例与数据不确定时明确提示需要核验。",
    `目标读者：${audience}。`,
    `文章气质：${tone}。`,
    "用户的真实素材与要求：",
    topic,
    "只输出可发布文章，不要解释写作过程、配图建议或免责声明。",
  ].filter(Boolean).join("\n\n");
}

function buildWriteCopyPrompt(
  fields: CreationField[],
  values: Record<string, FieldValue>,
  caseContext: string[],
  snapshot: ThinkingProfileSnapshot | null,
  summary: ThinkingProfileSummary | null,
) {
  const tone = stringifyValue(values.tone) || "self";
  const source = stringifyValue(values.source) || "";
  const targets = Array.isArray(values.targets) ? values.targets.filter((item) => item.trim().length > 0) : [];
  const targetSpecs = targets
    .map((target) => getWriteCopyTargetSpec(target))
    .filter((item): item is NonNullable<ReturnType<typeof getWriteCopyTargetSpec>> => Boolean(item));
  const brief = snapshot ? buildThinkingProfileBrief(snapshot, summary ?? undefined) : null;

  const lines = [
    "你现在在执行小谷应用：写文案。",
    "你要扮演一个长期服务保险客户的专业顾问型内容创作者。",
    "你写的不是传统销售文案，不是新闻总结，也不是鸡汤短文。",
    "你的内容要像一个见过很多客户、做过很多真实服务的人，在复盘一个人、一件事、一个判断。",
    "",
    ...caseContext,
    caseContext.length > 0 ? "" : "",
    "统一写作原则：",
    "1. 先讲人或讲现象，再讲你的判断，最后自然落到风险、保障、服务价值或家庭安全感。",
    "2. 不要一上来讲产品，不要堆术语，不要像培训课件。",
    "3. 语言要成熟、克制、自然，有洞察，不油腻，不喊口号。",
    "4. 尽量多写具体细节：年龄、收入、身份、处境、犹豫点、原话、动作、转折。",
    "5. 少写空话套话，如“值得思考”“需要重视”“认知升级”“配置意识”。",
    "6. 情绪可以有，但必须来自真实处境，不要刻意煽情，不要制造恐慌。",
    "7. 如果是案例型内容，必须让读者记住一个人、一句原话、一个转折动作。",
    "8. 如果是观点型内容，必须让读者记住一个判断、一层逻辑、一个真实例子。",
    "9. 重点卖的不是产品，而是：清醒、兜底、长期主义、专业服务、风险判断。",
    "10. CTA 要轻，像“评论区留关键词”“你可以来问我”“我们私下聊聊”，不要硬逼单。",
    "11. 严格合规：不得承诺收益、承保、理赔，不夸大产品，不编造事实，不恐吓客户。",
    "12. 输出优先像真人写的，而不是像 AI 拼的。",
    "",
    ...(brief
      ? [
          "长期人物底盘：",
          `- 人设底色：${brief.persona || "未提供"}`,
          `- 核心客群：${brief.targetAudience || "未提供"}`,
          `- 擅长主题：${brief.specialty || "未提供"}`,
          `- 表达偏好：${brief.topicPreference || "未提供"}`,
          "",
        ]
      : []),
    `本次语气偏好：${getWriteCopyToneLabel(tone)}`,
    ...getWriteCopyToneInstructions(tone),
    "",
    `本次目标渠道：${targetSpecs.map((item) => item.label).join("、") || "未指定"}`,
    "请分别按照每个渠道的表达习惯单独写，不要只是在同一篇文案上改几个词。",
    "如果有多个渠道，必须严格按“【渠道名】”作为每一版的开头标识，例如“【短视频口播】”“【小红书笔记】”。",
    "",
    "各渠道要求：",
  ];

  for (const spec of targetSpecs) {
    lines.push(`【${spec.label}】`);
    lines.push(...spec.instructions);
    lines.push("");
  }

  lines.push("原始素材：");
  lines.push(source);
  lines.push("");
  lines.push("最终输出要求：");
  lines.push("1. 请直接输出可发布成稿，不要解释你的写作过程。");
  lines.push("2. 如果素材更适合案例型，就按案例型写；如果更适合观点型，就按观点型写，不要生搬硬套。");
  lines.push("3. 如果有多个渠道，请按“【渠道名】”分别输出完整成稿。");
  lines.push("4. 每一版都要明显符合对应渠道习惯。");
  lines.push("5. 除朋友圈文案外，其余渠道默认都要给出一个匹配该渠道气质的标题。");
  lines.push("6. 标题不要假大空，要有具体对象、反差、判断或结果感，但不要低质标题党。");
  lines.push("7. 视频号口播默认输出格式：标题 + 钩子类型 + 核心判断 + 正文 + 评论区承接。");
  lines.push("8. 小红书笔记默认输出格式：标题 + 正文。");
  lines.push("9. 公众号文章默认输出格式：标题 + 正文，如有需要可自然加入小标题。");
  lines.push("10. 朋友圈文案默认直接给正文，除非素材本身特别适合短标题。");

  const extraFields = fields
    .filter((field) => !["tone", "source", "targets"].includes(field.id))
    .map((field) => {
      const value = values[field.id];
      if (isEmptyCreationFieldValue(value)) return null;
      return `- ${field.label}：${Array.isArray(value) ? value.join("、") : value}`;
    })
    .filter((value): value is string => Boolean(value));

  if (extraFields.length > 0) {
    lines.push("11. 还要吸收以下补充信息：");
    lines.push(...extraFields);
  }

  return lines.join("\n");
}

function buildLiveScriptPrompt(
  values: Record<string, FieldValue>,
  caseContext: string[],
  promptHint: string,
) {
  const livePoint = stringifyValue(values.live_point).trim();

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

function buildIpPositioningPrompt(
  fields: CreationField[],
  values: Record<string, FieldValue>,
  hint: string,
  caseContext: string[],
  snapshot: Parameters<typeof formatThinkingProfileSnapshotForPrompt>[0] | null,
  summary: Parameters<typeof formatThinkingProfileSnapshotForPrompt>[1] | null,
) {
  const currentState = stringifyValue(values.current_state) || "";
  const targetClient = stringifyValue(values.target_client) || "";
  const lines = [
    "你现在在执行小谷应用：IP定位。",
    "你不是在写短视频文案，也不是在写一篇夸人的介绍稿。",
    "你现在要完成的是：基于完整人设画像和本轮提交信息，输出一份可长期使用、可落地执行的保险经纪人个人IP定位分析。",
    ...caseContext,
    caseContext.length > 0 ? "" : "",
    hint,
    "",
    "分析原则：",
    "1. 必须同时结合两类输入：长期人设画像 + 本轮IP定位页面填写内容。",
    "2. 长期人设画像决定这个人的底层定位、人设底色、信任来源和表达方式。",
    "3. 本轮页面输入决定她当前阶段最适合如何定位、主打谁、解决什么问题。",
    "4. 不要只复述履历，不要空泛夸赞，不要用“专业、靠谱、有温度”这类万能词糊弄过去。",
    "5. 要优先寻找这个人最稀缺的身份组合、最强的信任锚点、最适合长期占据的认知位置。",
    "6. 如果长期人物底色和当前账号状态存在张力，优先保留底色，再给出现阶段更适合的表达打法。",
    "",
    snapshot ? formatThinkingProfileSnapshotForPrompt(snapshot, summary ?? undefined) : "【长期人设画像摘要】\n- 当前暂无完整结构化画像，请谨慎分析，不要编造。",
    "",
    "【本轮IP定位页面输入】",
    `- 当前账号状态：${currentState || "未填写"}`,
    `- 本轮目标客群：${targetClient || "未填写"}`,
    "",
    "请严格按照以下结构输出：",
    "一、IP定位分析",
    "1. IP核心判断",
    "2. 一句话定位",
    "3. 个人故事IP锚点",
    "4. 客户选她的3个理由",
    "5. 内容人设",
    "6. 人设关键词",
    "7. 目标客户深度画像",
    "8. 核心心理需求",
    "9. 决策驱动因素",
    "10. 内容方向（至少3条，每条写清：方向、切入框架、对生意的作用）",
    "11. 现阶段定位建议（结合当前账号状态给建议）",
    "12. 可直接使用的账号简介",
    "",
    "输出要求：",
    "1. 要像资深定位顾问写的，不像模板生成器。",
    "2. 每个判断尽量建立在输入证据上，证据不足时保守推断。",
    "3. 语言可以犀利，但要克制、专业、具体。",
    "4. 结果必须服务后续内容创作与客户信任建立，不要停留在空泛品牌描述。",
  ];

  fields.forEach((field) => {
    const value = values[field.id];
    if (isEmptyCreationFieldValue(value)) return;
    lines.push(`- 表单补充：${field.label}：${Array.isArray(value) ? value.join("、") : value}`);
  });

  return lines.join("\n");
}

function buildImagePlan(appName: string, fields: CreationField[], values: Record<string, FieldValue>, caseContext: string[], hint: string) {
  const style = stringifyValue(values.style) || "默认风格";
  const ratio = stringifyValue(values.ratio) || "1:1";
  const source = stringifyValue(values.source) || "未提供素材";
  const signature = stringifyValue(values.signature);
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
    "",
    "生成提示词建议：",
    `请用${style}，按${ratio}比例，围绕保险内容知识卡片，突出清晰标题、简洁层次、适度留白和可读性。`,
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
  const styleValue = stringifyValue(values.style);
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
    "daily-sign": "像一张氛围日签，主标题和一句副标题最重要，背景要有纸感或柔和光影，元素少但精致。不要做成多模块信息图。",
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

function getWriteCopyToneLabel(tone: string) {
  if (tone === "traffic") return "更有流量";
  if (tone === "trust") return "更有信任感";
  if (tone === "raw") return "尽量保留原意";
  return "更像自己";
}

function getWriteCopyToneInstructions(tone: string) {
  if (tone === "traffic") {
    return [
      "语气附加要求：",
      "1. 强化开头钩子、反差、记忆点。",
      "2. 增加更容易传播的判断句，但仍然要像真人，不要标题党过头。",
      "3. 优先让读者愿意读下去、听下去，而不是追求结构整齐。",
    ];
  }

  if (tone === "trust") {
    return [
      "语气附加要求：",
      "1. 弱化刺激感，强化专业感、分寸感、长期陪伴感。",
      "2. 更像“我见过很多客户后的真心判断”，不要像在推销。",
      "3. 结尾承接要克制，让人愿意信任你，而不是被迫行动。",
    ];
  }

  if (tone === "raw") {
    return [
      "语气附加要求：",
      "1. 以优化结构、节奏、表达为主，不大改核心观点和原始叙述逻辑。",
      "2. 不要为了流量把原素材改写成另一篇完全不同的文案。",
      "3. 尽量保留原素材的真实口气和核心判断。",
    ];
  }

  return [
    "语气附加要求：",
    "1. 优先保留素材原本的表达习惯和观点，不要过度包装。",
    "2. 更像一个成熟顾问的自然表达，不要太像爆款模板。",
    "3. 保证成稿顺畅、有记忆点，但不要失去个人味道。",
  ];
}

function getWriteCopyTargetSpec(target: string) {
  if (target === "video_script") {
    return {
      label: "短视频口播",
      instructions: [
        "1. 先在心中判断素材最接近个人经历、客户故事、问题回应、观点类比、行业观察、职业使命或方案解释中的哪一种，再选择最适合的表达，不要强行套同一模板。",
        "2. 每条只选择一种钩子：结果、原话、场景、问题、对比或身份。前两句必须出现具体人、处境、结果、疑问或对比中的至少一项；禁止用“很多人都不知道”“你以为”“其实”“今天来聊聊”开头。",
        "3. 按“钩子 -> 代入 -> 转折 -> 真实细节/场景 -> 核心判断 -> 情绪收束 -> 轻承接”推进。先讲人和处境，再自然落到保障、家庭责任、现金流或专业服务。",
        "4. 全文必须像人说话：钩子和金句用短句，叙事和解释用中句，每 1-2 句形成自然停顿；不要写成文章、课件或连续罗列。",
        "5. 全文只保留一个核心判断，并用一句可被复述的金句收束。不要为了保险而保险，也不要在结尾硬推产品。",
        "6. 素材明显适合金句/类比型时控制在 80-150 字；故事型控制在 300-500 字；个人经历型可扩展至 600 字以内。",
        "7. CTA 要轻，只能使用评论关键词、私信沟通或预约梳理等自然动作，不逼单、不制造焦虑。",
        "8. 输出格式：标题 + 钩子类型 + 核心判断 + 正文 + 评论区承接。",
      ],
    };
  }

  if (target === "xiaohongshu") {
    return {
      label: "小红书笔记",
      instructions: [
        "1. 标题感要强，第一段就要让人想继续往下看。",
        "2. 优先写“一个让我印象很深的人/一件让我重新理解某件事的事/一个很多人都想错了的判断”。",
        "3. 强调代入感，适合手机端阅读，段落要疏，句子要短。",
        "4. 多写人物情绪、处境、心理、原话，让读者觉得“这说的就是我/我身边的人”。",
        "5. 结尾留一个观点落点加轻互动，不要写成硬广。",
        "6. 默认 350-800 字，可带 1 个主标题和自然分段。",
      ],
    };
  }

  if (target === "wechat_article") {
    return {
      label: "公众号文章",
      instructions: [
        "1. 允许展开，但必须有主线，不能散。",
        "2. 开头要用一个案例、现象或判断把读者拉进来，不能空泛起笔。",
        "3. 正文要讲清楚：你为什么这么判断、你见过什么人/事、这背后的底层逻辑是什么、对普通家庭意味着什么。",
        "4. 可以有复盘感、行业观察感、财富观、风险观，但不要像宏大叙事。",
        "5. 如果是观点型内容，至少要有一个真实例子托住观点。",
        "6. 结尾不要硬卖产品，要像成熟顾问留下一个开放式承接。",
        "7. 默认 900-1800 字，可自然分成 4-6 段。",
        "8. 必须直接输出自然型 markdown 成稿：主标题用 # ，正文里的小标题用 ## ，如有更细的拆解可用 ### 。",
        "9. 如果正文中出现并列观点、步骤或提醒，请优先用 markdown 列表，不要只靠换行硬分段。",
        "10. 如果有一句特别值得强调的判断，可使用 > 引用格式单独提出来。",
        "11. 不要写“标题：”“正文：”“第一类：”“最后想说：”这类标签式提示词，要像一篇能直接发布的公众号文章，自然地用 markdown 标题组织结构。",
        "12. 推荐结构：# 主标题 -> 1-2 段导语 -> 3-5 个 ## 小标题章节 -> 自然结尾。",
        "13. 输出前自检：全文里至少要出现 1 个 # 主标题和 3 个以上 ## 小标题；如果你写出了‘标题：’‘一、二、三’这类格式，说明不合格，需要改写成 markdown 后再输出。",
      ],
    };
  }

  if (target === "moments") {
    return {
      label: "朋友圈文案",
      instructions: [
        "1. 必须像真实顾问发的日常感悟，不像广告海报配文。",
        "2. 开头直接抛一个人、一句话、一个判断或一个小场景。",
        "3. 文字可以短，但一定要有态度、有观察。",
        "4. 重点是让人觉得你专业、清醒、值得聊，不是一次性说服成交。",
        "5. 收尾可以很轻，像“如果你也有类似情况，可以来问我”。",
        "6. 默认 120-280 字，最多 3-6 小段。",
      ],
    };
  }

  return null;
}

function stringifyValue(value: FieldValue | undefined) {
  return stringifyCreationFieldValue(value);
}
