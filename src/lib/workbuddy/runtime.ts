import type { SessionUser } from "@/lib/auth/session";
import { requireQuota } from "@/lib/billing/enforce";
import { getMeteringMode, reportUsage } from "@/lib/billing/openmeter";
import { runInsuranceContentAgent, streamInsuranceContentAgent } from "@/lib/agent/insurance-agent";
import { checkCompliance } from "@/lib/compliance/check";
import { executeCreationAppRun } from "@/lib/creation/execute-app-run";
import { getLinkRemixSourceCache } from "@/lib/creation/link-remix-cache";
import { enqueueSourceInspectionTask, SOURCE_INSPECTION_PRIORITIES, standardizeSourceInspection, type StandardizedSourceInspection } from "@/lib/creation/source-inspection";
import { buildWorkTitle } from "@/lib/creation/work-title";
import type { CreationFieldValue } from "@/lib/creation/output";
import { query } from "@/lib/db/client";
import { tryCreateWork, tryGetCreationAppBySlug, tryGetWorkDetail, trySaveUsageLog, trySyncCreationCatalog } from "@/lib/db/repositories";
import type { VolcengineSearchResult } from "@/lib/search/volcengine-search";
import { collectHotTopicCandidates, rankHotTopicCandidates, searchResultsToHotTopics } from "@/lib/topics/hot-topics";
import { getLinkRemixAvailability, getOwnedLocalAgentTask, isLocalAgentDelegationEnabled } from "@/lib/local-agent/repository";
import type { HotTopic } from "@/lib/topics/types";
import { resolveActiveWorkbuddyCapability, type CapabilityTaskInput } from "./capabilities";
import { runDeepResearch, type DeepResearchTrace } from "./deep-research";
import { runFastResearch, type FastResearchTrace } from "./fast-research";
import { hasConversationAppParameters, mergeConversationAppParameters, shouldSkipTrafficTopicSelection } from "./app-conversation";

export type CapabilityInvocationResult = {
  invocationId: string | null;
  capabilityId: string;
  appSlug: string;
  workId: string | null;
  title: string;
  content: string;
  contentJson: Record<string, unknown>;
  resultUrl: string;
};

export type WorkbuddyRuntimeEvent = { type: string; message: string; data?: Record<string, unknown> };

export async function invokeWorkbuddyCapability(input: {
  user: SessionUser;
  taskId: string;
  stepId: string;
  capabilityId: string;
  taskInput: CapabilityTaskInput;
  onEvent?: (event: WorkbuddyRuntimeEvent) => void;
  signal?: AbortSignal;
}) {
  const capability = await resolveActiveWorkbuddyCapability(input.capabilityId);
  if (!capability) throw new Error("能力不存在或尚未安装");
  const taskText = [input.taskInput.objective, input.taskInput.context, input.taskInput.followup].filter(Boolean).join("\n");
  if (!capability.autoInvoke && !(capability.appSlug && hasConversationAppParameters(taskText, capability.appSlug))) throw new Error(`${capability.name}需要确认参数后执行`);

  if (capability.nativeType) {
    return invokeNativeCapability({ ...input, capability });
  }
  if (!capability.appSlug) throw new Error("能力尚未绑定执行器");

  await trySyncCreationCatalog();
  const app = await tryGetCreationAppBySlug(capability.appSlug);
  if (!app) throw new Error(`${capability.name}当前不可用`);
  const values = mergeConversationAppParameters(capability.buildInput(input.taskInput, app), taskText, app.slug);
  const trafficTopicSelection = app.slug === "traffic-copy" ? await resolveWorkbuddyTrafficTopicSelection(input.user.id, values) : null;
  if (trafficTopicSelection) Object.assign(values, trafficTopicSelection.values);
  const isTrafficTopicStage = app.slug === "traffic-copy" && !trafficTopicSelection && !shouldSkipTrafficTopicSelection(taskText);
  if (isTrafficTopicStage) values.traffic_topic_only = "yes";
  input.onEvent?.({ type: "app.preparing", message: `正在准备${app.name}的执行参数`, data: { appSlug: app.slug } });
  const quota = await requireQuota(input.user, "write_script", app.points);
  if (!quota.ok) {
    const payload = await quota.response.json().catch(() => ({})) as { error?: string };
    throw new Error(payload.error || "当前额度不足，无法运行应用");
  }

  const invocation = await query<{ id: string }>(
    `insert into workbuddy_capability_invocations(task_id,step_id,user_id,capability_id,capability_kind,app_slug,status,input_json,points_cost,started_at)
     values($1,$2,$3,$4,'app',$5,'running',$6,$7,now()) returning id`,
    [input.taskId, input.stepId, input.user.id, capability.id, app.slug, JSON.stringify(values), isTrafficTopicStage ? 0 : quota.quotaCost],
  ).then((result) => result.rows[0] ?? null).catch(() => null);

  const pendingTitle = buildWorkTitle({ appName: app.name, appSlug: app.slug, values, result: null });
  const existingTrafficWork = trafficTopicSelection?.work ?? null;
  const work = existingTrafficWork ?? await tryCreateWork({ userId: input.user.id, appCode: app.slug, title: pendingTitle, content: "", contentJson: { source: "workbuddy", workbuddyTaskId: input.taskId }, sourceChannel: app.slug, complianceRisk: "unchecked" });
  if (!work) throw new Error("应用作品记录创建失败");

  try {
    input.onEvent?.({ type: "app.running", message: `正在调用${app.name}`, data: { appSlug: app.slug } });
    let heartbeatIndex = 0;
    const heartbeatMessages = ["正在理解素材并搭建内容结构", "正在生成正文并检查表达完整性", "正在生成所选教练版本，请稍候"];
    const heartbeat = setInterval(() => {
      const message = heartbeatMessages[heartbeatIndex++];
      if (message) input.onEvent?.({ type: "app.progress", message, data: { appSlug: app.slug } });
    }, 8_000);
    try {
      await executeCreationAppRun({
        slug: app.slug, userId: input.user.id, values, workId: work.id, quotaCost: isTrafficTopicStage ? 0 : quota.quotaCost,
        onEvent: async (event) => {
          if (event.type === "delta" && event.content) input.onEvent?.({ type: "content.delta", message: event.content, data: { appSlug: app.slug, source: "application" } });
          else if (event.type === "images") input.onEvent?.({ type: "app.images", message: `已生成 ${event.images?.length ?? 0} 张图片`, data: { appSlug: app.slug, imageCount: event.images?.length ?? 0 } });
        },
      });
    } finally { clearInterval(heartbeat); }
    const detail = await tryGetWorkDetail({ userId: input.user.id, workId: work.id });
    if (!detail || detail.app_run?.status === "failed") throw new Error(detail?.app_run?.error_message || "应用执行失败");
    await query(
      `update workbuddy_capability_invocations set status='completed',work_id=$2,app_run_id=$3,output_json=$4,completed_at=now(),updated_at=now() where id=$1`,
      [invocation?.id ?? null, work.id, detail.app_run?.id ?? null, JSON.stringify({ title: detail.title, contentJson: detail.content_json ?? {} })],
    ).catch(() => undefined);
    const compliance = checkCompliance(detail.content || detail.app_run?.result_text || "");
    const runResultJson = detail.app_run?.result_json && typeof detail.app_run.result_json === "object" ? detail.app_run.result_json : {};
    const generatedImageCount = Array.isArray(runResultJson.images) ? runResultJson.images.length : 0;
    input.onEvent?.({ type: "compliance.completed", message: `合规检查完成：${compliance.riskLevel}风险，发现 ${compliance.issues.length} 项`, data: { riskLevel: compliance.riskLevel, issueCount: compliance.issues.length } });
    return {
      invocationId: invocation?.id ?? null,
      capabilityId: capability.id,
      appSlug: app.slug,
      workId: work.id,
      title: detail.title,
      content: detail.content || detail.app_run?.result_text || "应用已完成，产物请在原应用中查看。",
      contentJson: { ...(detail.content_json ?? {}), ...runResultJson, ...(generatedImageCount ? { generatedImageCount } : {}), compliance, ...(isTrafficTopicStage ? { workbuddyStage: "traffic-topics" } : {}) },
      resultUrl: `/works/${work.id}`,
    } satisfies CapabilityInvocationResult;
  } catch (error) {
    const message = error instanceof Error ? error.message : "能力执行失败";
    await query(`update workbuddy_capability_invocations set status='failed',error_message=$2,completed_at=now(),updated_at=now() where id=$1`, [invocation?.id ?? null, message.slice(0, 500)]).catch(() => undefined);
    throw error;
  }
}

type StoredTrafficTopic = { id?: string; title?: string; assignedCoachId?: string; assignedCoachLabel?: string; recommendationReason?: string; editorialVerdict?: string; [key: string]: unknown };

async function resolveWorkbuddyTrafficTopicSelection(userId: string, values: Record<string, CreationFieldValue>) {
  const topicIds = Array.isArray(values.traffic_selected_topic_ids)
    ? values.traffic_selected_topic_ids.filter((value): value is string => typeof value === "string" && Boolean(value))
    : [];
  const workId = typeof values.traffic_existing_work_id === "string" ? values.traffic_existing_work_id.trim() : "";
  if (!topicIds.length && !workId) return null;
  if (!topicIds.length || !workId) throw new Error("选题选择信息不完整，请重新选择 1—3 个选题");
  if (topicIds.length > 3) throw new Error("一次最多选择 3 个选题");
  const work = await tryGetWorkDetail({ userId, workId });
  const arena = work?.app_run?.result_json?.trafficTopicArena as { topics?: StoredTrafficTopic[]; research?: string; evidencePack?: unknown; topicProcess?: unknown } | undefined;
  if (!work || work.platform !== "traffic-copy" || work.app_run?.input_payload?.traffic_topic_only !== "yes" || !Array.isArray(arena?.topics)) {
    throw new Error("原选题作品不存在或已经进入正文创作，请重新分析选题");
  }
  const topicById = new Map(arena.topics.flatMap((topic) => typeof topic.id === "string" ? [[topic.id, topic] as const] : []));
  const selectedTopics = topicIds.map((id) => topicById.get(id)).filter((topic): topic is StoredTrafficTopic => Boolean(topic));
  if (selectedTopics.length !== topicIds.length) throw new Error("部分选题已失效，请重新分析选题");
  const coachIds = [...new Set(selectedTopics.map((topic) => typeof topic.assignedCoachId === "string" ? topic.assignedCoachId : "default"))];
  return {
    work,
    values: {
      traffic_topic_only: "no",
      traffic_existing_work_id: workId,
      traffic_selected_topics: selectedTopics.map((topic) => JSON.stringify(topic)),
      traffic_shared_research: typeof arena.research === "string" ? arena.research : "",
      traffic_shared_evidence_pack: arena.evidencePack ? JSON.stringify(arena.evidencePack) : "",
      traffic_topic_process: arena.topicProcess ? JSON.stringify(arena.topicProcess) : "",
      creative_coach_version_ids: coachIds,
    } satisfies Record<string, CreationFieldValue>,
  };
}

async function invokeNativeCapability(input: Parameters<typeof invokeWorkbuddyCapability>[0] & { capability: NonNullable<Awaited<ReturnType<typeof resolveActiveWorkbuddyCapability>>> }) {
  const nativeType = input.capability.nativeType;
  if (!nativeType) throw new Error("原生能力执行器未配置");
  if (nativeType === "hot-topic-discovery") return invokeHotTopicDiscovery(input);
  const quota = await requireQuota(input.user, "write_script");
  if (!quota.ok) {
    const payload = await quota.response.json().catch(() => ({})) as { error?: string };
    throw new Error(payload.error || "当前额度不足，无法运行能力");
  }
  const { objective, context, previousArtifact = "", followup = "" } = input.taskInput;
  let sources: VolcengineSearchResult[] = [];
  let researchTrace: DeepResearchTrace | null = null;
  let fastResearchTrace: FastResearchTrace | null = null;
  let sourceInspection: StandardizedSourceInspection | null = null;
  if (nativeType === "deep-research") {
    const research = await runDeepResearch({ objective, context, initialQueries: input.taskInput.searchQueries, userId: input.user.id, onEvent: input.onEvent, signal: input.signal });
    sources = research.sources;
    researchTrace = research.trace;
  }
  if (nativeType === "fast-research") {
    const research = await runFastResearch({
      objective,
      context,
      initialQueries: input.taskInput.searchQueries,
      userId: input.user.id,
      onEvent: (event) => input.onEvent?.({ ...event, message: event.message ?? "正在执行快速查证" }),
      signal: input.signal,
    });
    sources = research.sources;
    fastResearchTrace = research.trace;
  }
  if (nativeType === "video-link-summary" || nativeType === "link-reader") {
    sourceInspection = await inspectWorkbuddySource({
      userId: input.user.id,
      text: [objective, context, followup].filter(Boolean).join("\n"),
      onEvent: (event) => input.onEvent?.({ ...event, message: event.message ?? "正在补充实时热点" }),
      signal: input.signal,
    });
  }
  const evidenceSources = nativeType === "fast-research" ? sources.slice(0, 6) : sources.slice(0, 12);
  const evidenceExcerptLength = nativeType === "fast-research" ? 450 : 900;
  const evidence = evidenceSources.length ? evidenceSources.map((item, index) => `[来源${index + 1}] ${item.title}\nURL: ${item.url}\n发布时间: ${item.publishedDate || "未提供"}\n摘要: ${item.content.slice(0, evidenceExcerptLength)}`).join("\n\n") : "本次没有获得可用的公开检索结果，不得声称已经联网核验。";
  const sourceContext = sourceInspection ? formatSourceInspectionForPrompt(sourceInspection) : "";
  const prompt = buildNativePrompt(nativeType, { objective, context: [context, sourceContext].filter(Boolean).join("\n\n"), previousArtifact, followup, evidence });
  let content = nativeType === "fast-research"
    ? `Fast Research 已完成事实核验。以下是供小谷主 Agent直接作答的紧凑证据包：\n\n${evidence}`
    : "";
  if (nativeType !== "fast-research") {
    input.onEvent?.({ type: "generation.started", message: input.capability.id === "agent.orchestrator" ? "正在整理分析并生成结果" : `正在由${input.capability.name}整理分析与生成结果` });
    for await (const chunk of streamInsuranceContentAgent([{ role: "user", content: prompt }], input.user.id, "general")) {
      if (input.signal?.aborted) throw new Error("任务已停止");
      content += chunk;
      input.onEvent?.({ type: "content.delta", message: chunk });
    }
    if (!content.trim()) {
      if (input.signal?.aborted) throw new Error("任务已停止");
      input.onEvent?.({ type: "generation.retry", message: "流式通道未返回正文，正在切换稳定生成通道重试" });
      content = await runInsuranceContentAgent([{ role: "user", content: prompt }], input.user.id, "general");
      if (content) input.onEvent?.({ type: "content.delta", message: content });
    }
  }
  if (!content.trim()) throw new Error("本次执行没有返回有效内容");
  const compliance = checkCompliance(content);
  input.onEvent?.({ type: "compliance.completed", message: `合规检查完成：${compliance.riskLevel}风险，发现 ${compliance.issues.length} 项`, data: { riskLevel: compliance.riskLevel, issueCount: compliance.issues.length } });
  const invocation = await query<{ id: string }>(
    `insert into workbuddy_capability_invocations(task_id,step_id,user_id,capability_id,capability_kind,app_slug,status,input_json,output_json,points_cost,started_at,completed_at)
     values($1,$2,$3,$4,$5,null,'completed',$6,$7,$8,now(),now()) returning id`,
    [input.taskId, input.stepId, input.user.id, input.capability.id, input.capability.kind, JSON.stringify({ ...input.taskInput, researchBrief: researchTrace?.brief, executedQueries: researchTrace?.totalQueries ?? fastResearchTrace?.queries.map(item => item.query) }), JSON.stringify({ compliance, sources, researchTrace, fastResearchTrace, sourceInspection }), quota.quotaCost],
  ).then((result) => result.rows[0] ?? null).catch(() => null);
  await reportUsage({ customerId: input.user.id, action: "write_script", amount: quota.quotaCost, metadata: { source: "workbuddy", capabilityId: input.capability.id } });
  await trySaveUsageLog({ userId: input.user.id, actionType: "write_script", quotaCost: quota.quotaCost, metadata: { source: "workbuddy", capabilityId: input.capability.id, meteringMode: getMeteringMode() } });
  return {
    invocationId: invocation?.id ?? null,
    capabilityId: input.capability.id,
    appSlug: "",
    workId: null,
    title: `${input.capability.name} · ${objective.replace(/\s+/g, " ").slice(0, 32)}`,
    content,
    contentJson: {
      native: true,
      nativeType,
      compliance,
      sources: sources.map(({ title, url, publishedDate }) => ({ title, url, publishedDate })),
      researchTrace: researchTrace ?? undefined,
      fastResearchTrace: fastResearchTrace ?? undefined,
      sourceInspection: sourceInspection ?? undefined,
      customerDraft: nativeType === "customer-followup" ? buildCustomerDraft(`${objective}\n${context}`, content) : undefined,
    },
    resultUrl: "",
  } satisfies CapabilityInvocationResult;
}

async function invokeHotTopicDiscovery(input: Parameters<typeof invokeWorkbuddyCapability>[0] & { capability: NonNullable<Awaited<ReturnType<typeof resolveActiveWorkbuddyCapability>>> }) {
  if (input.signal?.aborted) throw new Error("任务已停止");
  input.onEvent?.({ type: "hot_topics.started", message: "正在读取实时热点榜单与传播信号" });
  const discoveredAt = new Date().toISOString();
  const preference = [input.taskInput.objective, input.taskInput.context].filter(Boolean).join("\n").slice(0, 2000);
  const [boardCandidates, discoveryResearch] = await Promise.all([
    collectHotTopicCandidates({ refresh: false }),
    runFastResearch({
      objective: input.taskInput.objective,
      context: input.taskInput.context,
      userId: input.user.id,
      onEvent: (event) => input.onEvent?.({ ...event, message: event.message ?? "正在补充实时热点" }),
      signal: input.signal,
      maxQueries: 4,
      mode: "discovery",
    }).catch(() => null),
  ]);
  const searchCandidates = searchResultsToHotTopics(discoveryResearch?.sources ?? []);
  const hotTopics = rankHotTopicCandidates([...boardCandidates, ...searchCandidates], preference).slice(0, 12);
  if (input.signal?.aborted) throw new Error("任务已停止");
  if (!hotTopics.length) throw new Error("当前没有取得可用的实时热点榜单");
  const platformCount = new Set(hotTopics.map((topic) => topic.source)).size;
  const content = formatHotTopicObservation(hotTopics, discoveredAt);
  const outputJson = { native: true, nativeType: "hot-topic-discovery", discoveredAt, platformCount, hotTopics, discoveryResearch: discoveryResearch?.trace };
  const invocation = await query<{ id: string }>(
    `insert into workbuddy_capability_invocations(task_id,step_id,user_id,capability_id,capability_kind,app_slug,status,input_json,output_json,points_cost,started_at,completed_at)
     values($1,$2,$3,$4,$5,null,'completed',$6,$7,0,now(),now()) returning id`,
    [input.taskId, input.stepId, input.user.id, input.capability.id, input.capability.kind, JSON.stringify(input.taskInput), JSON.stringify(outputJson)],
  ).then((result) => result.rows[0] ?? null).catch(() => null);
  input.onEvent?.({ type: "hot_topics.completed", message: `已取得 ${hotTopics.length} 个候选热点，覆盖 ${platformCount} 个榜单与搜索来源`, data: { topicCount: hotTopics.length, platformCount, discoveredAt } });
  return {
    invocationId: invocation?.id ?? null,
    capabilityId: input.capability.id,
    appSlug: "",
    workId: null,
    title: `今日热点 · ${new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "medium" }).format(new Date())}`,
    content,
    contentJson: outputJson,
    resultUrl: "",
  } satisfies CapabilityInvocationResult;
}

function formatHotTopicObservation(topics: HotTopic[], discoveredAt: string) {
  const time = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "full", timeStyle: "medium" }).format(new Date(discoveredAt));
  const rows = topics.map((topic, index) => [
    `[候选${index + 1}] ${topic.title}`,
    `发现方式：${topic.discoverySource === "search" ? "实时搜索补充" : "热点榜单"}｜来源：${topic.source}｜热度：${topic.heat}｜分类：${topic.category}｜首要领域：${topic.primaryDomain ?? "待判断"}｜财经/财富/保险评分：${topic.domainScores ? `${topic.domainScores.finance}/${topic.domainScores.wealth}/${topic.domainScores.insurance}` : `—/—/${topic.insuranceRelevance}`}`,
    topic.sourcePublishedAt ? `来源发布时间：${topic.sourcePublishedAt}` : "来源发布时间：未提供",
    topic.sourceUrl ? `原始链接：${topic.sourceUrl}` : "原始链接：未提供",
    topic.summary ? `榜单摘要：${topic.summary}` : "",
    topic.recommendedAngle ? `建议观察角度：${topic.recommendedAngle}` : "",
    topic.riskNote ? `事实与合规边界：${topic.riskNote}` : "",
    topic.verification ? `核验状态：${topic.verification.status}；${topic.verification.note}` : "核验状态：待二次核验",
  ].filter(Boolean).join("\n")).join("\n\n");
  return `实时热点候选（发现时间：${time}）\n说明：以下内容由热点榜单与实时搜索共同发现，只用于扩充候选池，不代表事实已经核验。形成对外结论或内容前，应对入选话题另行核验。\n\n${rows}`;
}

function buildNativePrompt(type: NonNullable<NonNullable<Awaited<ReturnType<typeof resolveActiveWorkbuddyCapability>>>["nativeType"]>, input: { objective: string; context: string; previousArtifact: string; followup: string; evidence: string }) {
  const currentDateTime = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", weekday: "long", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
  const common = `【可信系统时间】\n当前北京时间：${currentDateTime}。所有相对日期必须以此为准，不得引用模型记忆中的旧年份。\n\n【任务目标】\n${input.objective}\n\n【用户提供资料】\n${input.context || "未提供"}\n\n【已有版本】\n${input.previousArtifact || "无"}\n\n【本轮修改】\n${input.followup || "无"}`;
  const instructions = {
    "general-orchestrator": "你就是当前对话中的小谷 Workbuddy，不是另一个被转交的 Agent。请直接理解用户的完整目标并完成任务。先简短说明你对目标和边界的理解，再给出可用成果；不得假装调用未调用的工具，不得编造实时事实或来源。若完成目标确实缺少外部信息或用户资料，要明确指出缺口并给出下一步，而不是套用固定业务模板。",
    "customer-followup": "你在执行客户跟进工作流。输出：会谈摘要、已确认事实、客户需求与顾虑、不得擅自推断的信息、建议跟进策略、可直接发送但需人工确认的消息、下一次行动清单。健康、联系方式、证件和完整保单等敏感信息不要写入长期记忆建议。",
    "product-analysis": "你在执行保单与产品资料分析。只能依据用户提供资料。逐份列出产品名称/资料版本/责任/等待期/免责/限制及原文依据；资料不足必须标为待核验。输出对比表、内部分析版和客户易懂版，不作承保、收益或理赔承诺。",
    "team-review": "你在执行经营复盘。区分数据事实、现象、判断和假设；输出关键指标、问题优先级、原因假设、行动计划，并为每项行动给出负责人建议、截止时间建议和验收标准。没有数据时明确说明只能做定性复盘。",
    "deep-research": `你在执行财经、财富、保险或其他专业领域的深度研究。保持用户原题领域，不得因为用户身份擅自迁移到保险。只能使用下方公开检索资料和用户资料形成事实结论；每个重要事实必须用[来源N]标注，冲突信息要并列呈现，缺少来源的内容标为判断或待核验。不得擅自把开放式研究请求改造成口播稿、公众号文章或其他特定内容形态。输出执行摘要、研究范围、关键发现、证据强弱与冲突、影响分析、行动建议、待核验事项和来源目录。来源目录必须保留标题与完整URL。\n\n【公开检索资料】\n${input.evidence}`,
    "fast-research": `你在执行 Fast Research。使用下方紧凑证据包直接回答用户的简单问题，不扩展成专题报告。先给结论，再给必要依据和边界；每个当前事实用[来源N]标注。若来源冲突、日期不清或证据不足，明确说明而不是补猜。末尾列出使用过的来源标题与完整 URL。\n\n【快速检索证据包】\n${input.evidence}`,
    "video-link-summary": "你在执行视频链接转写总结。只依据读取到的作品信息和转写，不补造视频中没有出现的事实。输出顺序：作品信息、三句话摘要、核心观点、内容结构、值得复用的表达、事实核验提醒、完整转写。完整转写必须原样保留，不得用摘要替代；转写可能有同音字，需明确提示用户复核人名、数字和专有名词。",
    "link-reader": "你在执行链接内容读取。只依据读取到的正文或转写，输出：来源信息、一句话结论、核心观点、关键事实与数据、可复用素材、待核验项、读取到的完整原文。不要擅自续写成口播或营销文案。",
    "file-analysis": "你在执行文件阅读分析。只依据用户上传并解析到上下文中的文件内容，输出：文件概览、执行摘要、关键信息与数据、风险或矛盾、待确认事项、建议下一步。找不到原文依据的内容不得补猜；若没有实际文件内容，明确请用户上传文件。",
    "hot-topic-discovery": "读取实时热点榜单并返回候选信号。",
  }[type];
  return `${instructions}\n\n${common}`;
}

async function inspectWorkbuddySource(input: { userId: string; text: string; onEvent?: (event: WorkbuddyRuntimeEvent) => void; signal?: AbortSignal }) {
  const rawUrl = input.text.match(/https?:\/\/[^\s<>"'）)】]+/)?.[0];
  if (!rawUrl) throw new Error("请先粘贴一个抖音、视频号、公众号或小红书的单条内容链接。");
  input.onEvent?.({ type: "source.started", message: "正在读取链接并检查可用的正文或媒体" });
  const cached = await getLinkRemixSourceCache(rawUrl);
  if (cached) {
    const inspection = standardizeSourceInspection({ sourceUrl: rawUrl, result: cached.result });
    if (inspection.status === "succeeded") {
      input.onEvent?.({ type: "source.completed", message: "已复用近期解析和转写结果" });
      return inspection;
    }
  }
  if (process.env.LOCAL_AGENT_ENABLED !== "1" || !await isLocalAgentDelegationEnabled()) {
    throw new Error("链接解析服务尚未启用，暂时无法读取这个链接。");
  }
  const availability = await getLinkRemixAvailability();
  if (!availability.available) throw new Error(availability.reason || "链接解析服务暂不可用，请稍后重试。");
  const { task, canonicalUrl } = await enqueueSourceInspectionTask({ userId: input.userId, url: rawUrl, purpose: "link_remix", priority: SOURCE_INSPECTION_PRIORITIES.LINK_REMIX, maxAttempts: 3 });
  input.onEvent?.({ type: "source.queued", message: "已提交解析任务，正在下载内容并转写", data: { taskId: task.id } });
  const deadline = Date.now() + 10 * 60_000;
  while (Date.now() < deadline) {
    if (input.signal?.aborted) throw new Error("任务已停止");
    const current = await getOwnedLocalAgentTask(task.id, input.userId);
    if (!current) throw new Error("链接解析任务不存在或已失效。");
    if (current.status === "succeeded" || current.status === "failed" || current.status === "cancelled") {
      const inspection = standardizeSourceInspection({ sourceUrl: canonicalUrl, result: current.result, taskStatus: current.status, errorMessage: current.errorMessage });
      if (inspection.status === "failed") throw new Error(inspection.failureReason || "链接内容解析失败。");
      input.onEvent?.({ type: "source.completed", message: "链接内容读取和转写完成", data: { platform: inspection.platform, title: inspection.title } });
      return inspection;
    }
    await abortableDelay(1_500, input.signal);
  }
  throw new Error("链接解析等待超时，请稍后重试。");
}

function abortableDelay(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(timer); reject(new Error("任务已停止")); }, { once: true });
  });
}

function formatSourceInspectionForPrompt(source: StandardizedSourceInspection) {
  return `【链接读取结果】\n平台：${source.platform}\n标题：${source.title || "未读取到"}\n作者：${source.author || "未读取到"}\n原始链接：${source.sourceUrl}\n最终链接：${source.finalUrl}\n\n【完整正文或转写】\n${source.transcript}`;
}

function buildCustomerDraft(source: string, content: string) {
  const match = source.match(/(?:客户(?:姓名|名称)?|称呼)[：:\s]+([\u4e00-\u9fa5A-Za-z·]{2,20})/);
  return match ? { displayName: match[1], needsSummary: content.replace(/[#*_>`-]/g, " ").replace(/\s+/g, " ").slice(0, 500), nextAction: "按已验收的客户跟进成果执行下一步", stage: "contacted" } : null;
}
