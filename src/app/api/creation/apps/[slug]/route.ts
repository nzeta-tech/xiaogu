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
  summarizeTitle,
  type CreationFieldValue,
} from "@/lib/creation/output";
import { buildCreationPromptContext } from "@/lib/creation/prompt-context";
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

  const missingField = app.fields.find((field) => field.required && isEmptyCreationFieldValue(values[field.id]));
  if (missingField) {
    return Response.json({ error: `${missingField.label}还没有填写。` }, { status: 400 });
  }

  const quota = await requireQuota(user, "write_script");
  if (!quota.ok) return quota.response;

  const caseContext = buildCreationPromptContext(app.slug);

  const content = app.slug === "write-copy"
    ? buildWriteCopyPrompt(app.fields, values, caseContext, thinkingSnapshot?.snapshot_json ?? null, thinkingSnapshot?.summary_json ?? null)
    : app.slug === "lead-copy"
      ? buildLeadCopyPrompt(app.fields, values, app.promptHint)
      : app.slug === "ip-positioning"
        ? buildIpPositioningPrompt(app.fields, values, app.promptHint, caseContext, thinkingSnapshot?.snapshot_json ?? null, thinkingSnapshot?.summary_json ?? null)
        : buildPrompt(app.name, app.fields, values, app.promptHint, caseContext, thinkingSnapshot?.snapshot_json ?? null, thinkingSnapshot?.summary_json ?? null);
  const imagePrompt = buildImagePrompt(app.name, app.fields, values, caseContext, app.promptHint);
  const resolvedPrompt = app.resultType === "image" || app.resultType === "image-plan" ? imagePrompt : content;
  const imageResult =
    app.resultType === "image" || app.resultType === "image-plan"
      ? await generateImageSet({
          prompt: imagePrompt,
          style: stringifyValue(values.style) || app.name,
          ratio: stringifyValue(values.ratio) || "1:1",
          count: 1,
        })
      : null;

  const run = await tryCreateAppRun({
    userId: user.id,
    appCode: app.slug,
    tone: app.slug === "write-copy" ? stringifyValue(values.tone) || "self" : "",
    targetChannels: Array.isArray(values.targets) ? values.targets : [],
    inputPayload: values,
    resolvedPrompt,
    quotaCost: quota.quotaCost,
    model: process.env.MODEL_NAME ?? "configured-model",
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
              app.slug === "write-copy" ? "general" : app.slug === "ip-positioning" ? "general" : "traffic",
            );
  } catch (error) {
    await tryCompleteAppRun({
      runId: run?.id ?? null,
      status: "failed",
      resultText: "",
      errorMessage: error instanceof Error ? error.message : "内容生成失败",
      resultJson: {
        images: imageResult?.images ?? [],
        imageMode: imageResult?.mode ?? null,
      },
    });
    return Response.json({ error: error instanceof Error ? error.message : "内容生成失败，请稍后再试。" }, { status: 500 });
  }

  const title = `${app.name}｜${summarizeTitle(values, app.fields.map((field) => field.id))}`;
  const contentJson = buildCreationOutputJson(result, Array.isArray(values.targets) ? values.targets : []);
  await tryCompleteAppRun({
    runId: run?.id ?? null,
    status: "succeeded",
    resultText: result,
    resultJson: {
      contentJson,
      images: imageResult?.images ?? [],
      imageMode: imageResult?.mode ?? null,
    },
  });

  const work = await tryCreateWork({
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
    model: process.env.MODEL_NAME ?? "configured-model",
    metadata: {
      appId: app.id,
      appSlug: app.slug,
      resultType: app.resultType,
      workId: work?.id ?? null,
      appRunId: run?.id ?? null,
    },
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
  lines.push("7. 视频号口播默认输出格式：标题 + 正文。");
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
    "你现在要完成的是：基于完整思维设定和本轮提交信息，输出一份可长期使用、可落地执行的保险经纪人个人IP定位分析。",
    ...caseContext,
    caseContext.length > 0 ? "" : "",
    hint,
    "",
    "分析原则：",
    "1. 必须同时结合两类输入：长期思维画像 + 本轮IP定位页面填写内容。",
    "2. 长期思维画像决定这个人的底层定位、人设底色、信任来源和表达方式。",
    "3. 本轮页面输入决定她当前阶段最适合如何定位、主打谁、解决什么问题。",
    "4. 不要只复述履历，不要空泛夸赞，不要用“专业、靠谱、有温度”这类万能词糊弄过去。",
    "5. 要优先寻找这个人最稀缺的身份组合、最强的信任锚点、最适合长期占据的认知位置。",
    "6. 如果长期人物底色和当前账号状态存在张力，优先保留底色，再给出现阶段更适合的表达打法。",
    "",
    snapshot ? formatThinkingProfileSnapshotForPrompt(snapshot, summary ?? undefined) : "【长期思维画像摘要】\n- 当前暂无完整结构化画像，请谨慎分析，不要编造。",
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

function buildLeadCopyPrompt(
  fields: CreationField[],
  values: Record<string, FieldValue>,
  hint: string,
) {
  const tone = stringifyValue(values.tone) || "";
  const source = stringifyValue(values.source) || "";
  const targets = Array.isArray(values.targets) ? values.targets.filter((item) => item.trim().length > 0) : [];
  const targetBlocks = targets.map((target) => getLeadCopyTargetSpec(target)).filter((item): item is LeadCopyTargetSpec => Boolean(item));

  const lines = [
    "你现在在执行小谷应用：写引流文案。",
    "这是一个更侧重引流文案创作的任务：口播稿、小红书笔记、公众号文章，一次搞定。",
    "请严格围绕用户提供的原始素材进行创作，不要脱离素材编造新事实。",
    hint,
    "",
    "核心原则：",
    "1. 你的核心任务不是堆模板，而是基于用户提供的素材，产出让目标人群看完愿意停下来、产生信任、并留下联系方式的内容。",
    "2. 所有内容都要遵循“点他-懂他-压他-破他-证他-接他”的引流骨架。",
    "3. 不得编造具体个人、公司、年份、精确金额、精确百分比。",
    "4. 不要写出 AI 味，不要用套话、口号和鸡汤。",
    "5. 如果素材不支持具体案例，就用经验观察或逻辑推演，不得硬造故事。",
    "",
    "本轮输入：",
    `- 表达倾向：${formatLeadCopyToneLabel(tone) || "未填写"}`,
    `- 引流素材：${source || "未填写"}`,
    `- 目标输出：${targetBlocks.map((item) => item.label).join("、") || "未填写"}`,
    "",
    "输出要求：",
    "1. 直接输出成稿，不要解释思路。",
    "2. 如果用户勾选了多个输出类型，按模块完整输出。",
    "3. 每个模块都要保留该渠道自己的节奏和格式，不要只是同一篇内容换标题。",
    "4. 结尾统一补一句：内容中的“福利资料”可自己调整，用平台【引流资料】制作智能体制作。",
    "",
  ];

  for (const block of targetBlocks) {
    lines.push(`【${block.label}】`);
    lines.push(...block.instructions);
    lines.push("");
  }

  const extraFields = fields
    .filter((field) => !["angle", "source", "lead_magnet", "keyword", "cta", "targets"].includes(field.id))
    .map((field) => {
      const value = values[field.id];
      if (isEmptyCreationFieldValue(value)) return null;
      return `- ${field.label}：${Array.isArray(value) ? value.join("、") : value}`;
    })
    .filter((value): value is string => Boolean(value));

  if (extraFields.length > 0) {
    lines.push("补充信息：");
    lines.push(...extraFields);
    lines.push("");
  }

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
  for (const field of fields) {
    const value = values[field.id];
    if (isEmptyCreationFieldValue(value)) continue;
    lines.push(`${field.label}：${Array.isArray(value) ? value.join("、") : value}`);
  }
  lines.push("要求：突出标题可读性、层级清晰、适合知识卡片或公众号配图。避免夸张营销海报风，整体要像专业内容创作者的卡片。\n");
  return lines.join("\n");
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
        "1. 前 2 句必须出现反差、冲突或一句能抓住人的判断。",
        "2. 全文必须像人说话，不像文章，不要书面腔太重。",
        "3. 多用短句、停顿感、单句成段，读出来要顺。",
        "4. 开头 3-5 句内必须点明“人物/现象 + 你的态度”。",
        "5. 结尾不要讲大道理，要收回到普通人为什么要提前兜底、为什么专业服务有价值。",
        "6. CTA 用口语化收口，适合评论区互动或私信承接。",
        "7. 默认 450-700 字，适合 60-120 秒口播。",
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

type LeadCopyTargetSpec = {
  label: string;
  instructions: string[];
};

function getLeadCopyTargetSpec(target: string): LeadCopyTargetSpec | null {
  if (target === "video_batch") {
    return {
      label: "口播稿x3",
      instructions: [
        "1. 输出 3 篇口播稿，分别是反常识版、直击痛点版、故事共鸣版。",
        "2. 三篇都要有完整引流闭环，但切入角度、证他路径和关键词不能重复。",
        "3. 口播稿要像能直接录制的视频文案，节奏自然、句子可说。",
      ],
    };
  }
  if (target === "redbook_batch") {
    return {
      label: "小红书x2",
      instructions: [
        "1. 输出 2 篇小红书笔记：A版 情绪洞察型，B版 干货拆解型。",
        "2. 两版都要完整走完六步法，但开头方式、气质和节奏必须不同。",
        "3. 保留平台语感，注意标签、加粗提示和评论区引导格式。",
      ],
    };
  }
  if (target === "wechat_batch") {
    return {
      label: "公众号x2",
      instructions: [
        "1. 输出 2 篇公众号文章：洞察型 + 温度型。",
        "2. 两版都必须重新组织语言和结构，不能只是素材整理版。",
        "3. 必须保留引流闭环，并在文末自然承接留言或私信关键词。",
      ],
    };
  }
  return null;
}

function formatLeadCopyToneLabel(value: string) {
  if (value === "sharp_insight") return "犀利洞察";
  if (value === "gentle_empathy") return "温和共鸣";
  if (value === "analogy_thinking") return "类比思维";
  if (value === "raw_restore") return "原汁原味（还原整理）";
  return value;
}
