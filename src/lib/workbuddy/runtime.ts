import type { SessionUser } from "@/lib/auth/session";
import { requireQuota } from "@/lib/billing/enforce";
import { getMeteringMode, reportUsage } from "@/lib/billing/openmeter";
import { runInsuranceContentAgent, streamInsuranceContentAgent } from "@/lib/agent/insurance-agent";
import { checkCompliance } from "@/lib/compliance/check";
import { startBackgroundWorkRun, subscribeToBackgroundWorkRun } from "@/lib/creation/background-run-registry";
import { executeCreationAppRun } from "@/lib/creation/execute-app-run";
import { buildTrafficGenerationValues, buildTrafficTopicAnalysisValues, isTrafficWorkflowRequest, readTrafficCoachOverrides, restoreTrafficRegenerationValues, type TrafficWorkflowArena } from "@/lib/creation/traffic-workflow-contract";
import type { CreationWorkflowStage } from "@/lib/creation/workflow-stage";
import { getLinkRemixSourceCache } from "@/lib/creation/link-remix-cache";
import { enqueueSourceInspectionTask, SOURCE_INSPECTION_PRIORITIES, standardizeSourceInspection, type StandardizedSourceInspection } from "@/lib/creation/source-inspection";
import { buildWorkTitle } from "@/lib/creation/work-title";
import type { CreationFieldValue } from "@/lib/creation/output";
import { query } from "@/lib/db/client";
import { tryCreateWork, tryGetCreationAppBySlug, tryGetWorkDetail, trySaveUsageLog, trySyncCreationCatalog } from "@/lib/db/repositories";
import type { VolcengineSearchResult } from "@/lib/search/volcengine-search";
import { collectHotTopicCandidates, rankHotTopicCandidates, searchResultsToHotTopics } from "@/lib/topics/hot-topics";
import { enqueueLocalAgentTask, getLinkRemixAvailability, getOpenChatCutAvailability, getOwnedLocalAgentTask, isLocalAgentDelegationEnabled } from "@/lib/local-agent/repository";
import type { HotTopic } from "@/lib/topics/types";
import { resolveActiveWorkbuddyCapability, type CapabilityTaskInput } from "./capabilities";
import { runDeepResearch, type DeepResearchTrace } from "./deep-research";
import { runFastResearch, type FastResearchTrace } from "./fast-research";
import { hasConversationAppParameters, mergeConversationAppParameters, parseConversationAppParameters, sanitizeConversationAppValues, shouldSkipTrafficTopicSelection, stripConversationAppProtocols } from "./app-conversation";
import { parseConversationContinuation } from "./continuation-navigation";
import { normalizeXiaohongshuAssetsParameters, XIAOHONGSHU_ASSETS_PARAMETER_SLUG } from "./xiaohongshu-assets-contract";

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
  const parameterSlug = capability.appSlug || (capability.nativeType === "xiaohongshu-assets" ? XIAOHONGSHU_ASSETS_PARAMETER_SLUG : "");
  const currentParameterText = [input.taskInput.followup, input.taskInput.objective]
    .find(value => parameterSlug && value?.includes(`[应用参数:${parameterSlug}]`)) ?? "";
  if (!capability.autoInvoke && !(parameterSlug && hasConversationAppParameters(currentParameterText, parameterSlug))) throw new Error(`${capability.name}需要确认参数后执行`);

  if (capability.nativeType) {
    if (capability.nativeType === "openchatcut-edit") return invokeOpenChatCut(input, capability);
    if (capability.nativeType === "digital-human-handoff") return invokeDigitalHumanHandoff(input, capability);
    if (capability.nativeType === "xiaohongshu-assets") return invokeXiaohongshuAssets(input, capability);
    return invokeNativeCapability({ ...input, capability });
  }
  if (!capability.appSlug) throw new Error("能力尚未绑定执行器");

  await trySyncCreationCatalog();
  const app = await tryGetCreationAppBySlug(capability.appSlug);
  if (!app) throw new Error(`${capability.name}当前不可用`);
  // Only the current user turn may provide executable form parameters. The
  // full task text remains available as semantic source material, but old
  // hidden envelopes are not executable and cannot override fresh defaults.
  const semanticTaskInput = {
    ...input.taskInput,
    objective: stripConversationAppProtocols(input.taskInput.objective),
    context: stripConversationAppProtocols(input.taskInput.context),
    followup: stripConversationAppProtocols(input.taskInput.followup ?? ""),
  };
  let values = sanitizeConversationAppValues(mergeConversationAppParameters(capability.buildInput(semanticTaskInput, app), currentParameterText, app.slug), app.slug);
  if (app.slug === "traffic-copy" && input.taskInput.operation === "regenerate") {
    const previousValues = await query<{ values: Record<string, CreationFieldValue> }>(
      `select input_json->'values' as values from workbuddy_capability_invocations
        where task_id=$1 and app_slug='traffic-copy' and status='completed'
          and jsonb_array_length(case when jsonb_typeof(input_json->'values'->'traffic_selected_topics')='array' then input_json->'values'->'traffic_selected_topics' else '[]'::jsonb end)>0
        order by created_at desc limit 1`, [input.taskId],
    ).then(result => result.rows[0]?.values ?? null).catch(() => null);
    values = restoreTrafficRegenerationValues(values, previousValues, semanticTaskInput.followup || semanticTaskInput.objective);
  }
  const trafficWorkflow = isTrafficWorkflowRequest(app.slug, values);
  const trafficTopicSelection = trafficWorkflow ? await resolveWorkbuddyTrafficTopicSelection(input.user.id, app.slug, values) : null;
  if (trafficTopicSelection) Object.assign(values, trafficTopicSelection.values);
  const currentSemanticRequest = stripConversationAppProtocols(input.taskInput.followup ?? "").trim()
    || stripConversationAppProtocols(input.taskInput.objective).trim();
  // The structured operation is authoritative. Text interpretation remains a
  // fallback for legacy confirmations created before operation contracts were
  // persisted in the form envelope.
  const trafficSemanticSource = typeof values.source === "string" ? values.source : "";
  const operationSkipsTopicSelection = input.taskInput.operation === "regenerate";
  const operationRequiresTopicSelection = input.taskInput.operation === "reselect";
  const isTrafficTopicStage = trafficWorkflow && !trafficTopicSelection
    && (operationRequiresTopicSelection || (!operationSkipsTopicSelection && !shouldSkipTrafficTopicSelection([currentSemanticRequest, trafficSemanticSource].filter(Boolean).join("\n"))));
  if (isTrafficTopicStage) Object.assign(values, buildTrafficTopicAnalysisValues(values, "workbuddy"));
  input.onEvent?.({ type: "app.preparing", message: `正在准备${app.name}的执行参数`, data: { appSlug: app.slug } });
  const quota = await requireQuota(input.user, "write_script", app.points, { appSlug: app.slug });
  if (!quota.ok) {
    const payload = await quota.response.json().catch(() => ({})) as { error?: string };
    throw new Error(payload.error || "当前额度不足，无法运行应用");
  }

  const invocation = await query<{ id: string }>(
    `insert into workbuddy_capability_invocations(task_id,step_id,user_id,capability_id,capability_kind,app_slug,status,input_json,points_cost,started_at,idempotency_key)
     values($1,$2,$3,$4,'app',$5,'running',$6,$7,now(),$8)
     on conflict(idempotency_key) where idempotency_key is not null do nothing returning id`,
    [input.taskId, input.stepId, input.user.id, capability.id, app.slug, JSON.stringify({ values, protocol: input.taskInput.protocol }), isTrafficTopicStage ? 0 : quota.quotaCost, input.taskInput.protocol?.idempotencyKey ?? null],
  ).then((result) => result.rows[0] ?? null).catch(() => null);

  if (!invocation && input.taskInput.protocol?.idempotencyKey) {
    const existing = await query<{ id:string;status:string;work_id:string|null;output_json:Record<string,unknown>;error_message:string|null }>(
      `select id,status,work_id,output_json,error_message from workbuddy_capability_invocations where idempotency_key=$1`,
      [input.taskInput.protocol.idempotencyKey],
    ).then(result=>result.rows[0]??null);
    if (existing?.status === "completed") {
      const output=existing.output_json??{};
      return {invocationId:existing.id,capabilityId:capability.id,appSlug:app.slug,workId:existing.work_id,title:String(output.title??app.name),content:String(output.content??"应用已完成"),contentJson:output.contentJson&&typeof output.contentJson==="object"?output.contentJson as Record<string,unknown>:{},resultUrl:String(output.resultUrl??"")} satisfies CapabilityInvocationResult;
    }
    throw new Error(existing?.status === "running" ? "相同任务正在执行，请稍候查看结果" : existing?.error_message || "相同任务已执行，未重复调用");
  }

  const pendingTitle = buildWorkTitle({ appName: app.name, appSlug: app.slug, values, result: null });
  const existingTrafficWork = trafficTopicSelection?.work ?? null;
  const work = existingTrafficWork ?? await tryCreateWork({ userId: input.user.id, appCode: app.slug, title: pendingTitle, content: "", contentJson: { source: "workbuddy", workbuddyTaskId: input.taskId }, sourceChannel: app.slug, complianceRisk: "unchecked" });
  if (!work) throw new Error("应用作品记录创建失败");
  await query(`update workbuddy_capability_invocations set work_id=$2,updated_at=now() where id=$1 and status='running'`, [invocation?.id ?? null, work.id]).catch(() => undefined);

  try {
    input.onEvent?.({ type: "app.running", message: `正在调用${app.name}`, data: { appSlug: app.slug } });
    const backgroundRun = startBackgroundWorkRun({
      slug: app.slug, userId: input.user.id, values, workId: work.id, quotaCost: isTrafficTopicStage ? 0 : quota.quotaCost,
      usageMetadata: { source: "workbuddy", workbuddyTaskId: input.taskId, workbuddyInvocationId: invocation?.id ?? null, idempotencyKey: input.taskInput.protocol?.idempotencyKey ?? null },
      signal: input.signal,
      shouldCommit: async () => query<{ active:boolean }>(`select exists(select 1 from workbuddy_tasks where id=$1 and user_id=$2 and status in ('planning','running')) as active`, [input.taskId,input.user.id]).then(result=>Boolean(result.rows[0]?.active)).catch(()=>false),
    });
    const unsubscribe = subscribeToBackgroundWorkRun(work.id, (event) => {
      if (event.type === "progress") input.onEvent?.({ type: "app.progress", message: [event.label, event.detail].filter(Boolean).join("：") || "应用正在执行", data: { appSlug: app.slug, phase: event.phase, status: event.status, coachId: event.coachId, coachLabel: event.coachLabel } });
      else if (event.type === "delta" && event.content) input.onEvent?.({ type: "content.delta", message: event.content, data: { appSlug: app.slug, source: "application" } });
      else if (event.type === "images") input.onEvent?.({ type: "app.images", message: `已生成 ${event.images?.length ?? 0} 张图片`, data: { appSlug: app.slug, imageCount: event.images?.length ?? 0 } });
    });
    try {
      await backgroundRun;
    } finally { unsubscribe?.(); }
    const detail = await tryGetWorkDetail({ userId: input.user.id, workId: work.id });
    // A cancelled background run used to resolve its wrapper promise after
    // leaving only the draft work row. Never report that shell as a completed
    // capability: it has no billable/deliverable application result.
    if (!detail || detail.app_run?.status !== "succeeded") {
      throw new Error(detail?.app_run?.error_message || (input.signal?.aborted ? "应用执行已取消" : "应用未形成有效成果，请重试"));
    }
    const resultUrl = app.slug === "xiaohongshu-studio" || app.slug === "wechat-studio"
      ? `/apps/${app.slug}?workId=${encodeURIComponent(work.id)}`
      : `/works/${work.id}`;
    await query(
      `update workbuddy_capability_invocations set status='completed',work_id=$2,app_run_id=$3,output_json=$4,completed_at=now(),updated_at=now() where id=$1`,
      [invocation?.id ?? null, work.id, detail.app_run?.id ?? null, JSON.stringify({ title: detail.title, content: detail.content || detail.app_run?.result_text || "", contentJson: { ...(detail.content_json ?? {}), ...(detail.app_run?.result_json ?? {}) }, resultUrl, protocol: input.taskInput.protocol })],
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
      contentJson: { ...(detail.content_json ?? {}), ...runResultJson, ...(generatedImageCount ? { generatedImageCount } : {}), compliance, ...(isTrafficTopicStage ? { workflowStage: { workflow: "traffic-copy", phase: "awaiting-selection" } satisfies CreationWorkflowStage } : {}) },
      resultUrl,
    } satisfies CapabilityInvocationResult;
  } catch (error) {
    const message = error instanceof Error ? error.message : "能力执行失败";
    await query(`update workbuddy_capability_invocations set status='failed',error_message=$2,completed_at=now(),updated_at=now() where id=$1 and status='running'`, [invocation?.id ?? null, message.slice(0, 500)]).catch(() => undefined);
    throw error;
  }
}

async function invokeXiaohongshuAssets(
  input: Parameters<typeof invokeWorkbuddyCapability>[0],
  capability: NonNullable<Awaited<ReturnType<typeof resolveActiveWorkbuddyCapability>>>,
) {
  const parameters = normalizeXiaohongshuAssetsParameters(parseConversationAppParameters(input.taskInput.followup || input.taskInput.objective, XIAOHONGSHU_ASSETS_PARAMETER_SLUG));
  const continuation = parseConversationContinuation(input.taskInput.followup || input.taskInput.objective);
  const workId = parameters.parent_work_id?.trim() || (continuation?.appSlug === "xiaohongshu-studio" && continuation.targetStep === "assets" ? continuation.workId?.trim() : "");
  if (!workId) throw new Error("没有找到要继续配图的小红书作品，请从笔记结果下方点击“继续生成配图”");
  const parent = await tryGetWorkDetail({ userId: input.user.id, workId });
  if (!parent || parent.platform !== "xiaohongshu-studio" || !parent.content.trim()) throw new Error("没有读取到可用于配图的小红书正文");
  const state = parent.content_json?.xiaohongshuStudioState as { headImage?: { id: string; url: string }; cards?: Array<{ id: string; url: string }> } | undefined;
  const lines = parent.content.split("\n").map(line => line.trim()).filter(Boolean);
  const title = lines[0]?.replace(/^#+\s*/, "").slice(0, 80) || parent.title || "小红书笔记";
  const body = parent.content.slice(parent.content.indexOf(lines[0] ?? "") + (lines[0]?.length ?? 0)).trim() || parent.content;
  const needsCover = !state?.headImage?.url;
  const needsCards = !Array.isArray(state?.cards) || state.cards.length === 0;
  if (needsCover || needsCards) {
    const coverApp = await tryGetCreationAppBySlug("wechat-cover");
    const cardsApp = await tryGetCreationAppBySlug("wechat-images");
    const requiredPoints = (needsCover ? coverApp?.points ?? 3 : 0) + (needsCards ? cardsApp?.points ?? 5 : 0);
    const quota = await requireQuota(input.user, "write_script", requiredPoints, { skipConcurrentCreationLimit: true });
    if (!quota.ok) {
      const payload = await quota.response.json().catch(() => ({})) as { error?: string };
      throw new Error(payload.error || "当前额度不足，无法生成小红书配图");
    }
    const run = async (slug: "wechat-cover" | "wechat-images", values: Record<string, string>) => executeCreationAppRun({
      slug, userId: input.user.id, values, workId, quotaCost: slug === "wechat-cover" ? coverApp?.points ?? 3 : cardsApp?.points ?? 5,
      signal: input.signal,
      usageMetadata: { source: "workbuddy", workbuddyTaskId: input.taskId, workbuddyStepId: input.stepId, parentCapabilityId: capability.id },
      onEvent: event => {
        if (event.type === "progress") input.onEvent?.({ type: "app.progress", message: `${slug === "wechat-cover" ? "小红书头图" : "小红书正文配图"}：${event.label || event.detail || "生成中"}`, data: { appSlug: "xiaohongshu-assets", slot: slug } });
        if (event.type === "images") input.onEvent?.({ type: "app.images", message: `${slug === "wechat-cover" ? "头图" : "正文配图"}已生成 ${event.images?.length ?? 0} 张`, data: { appSlug: "xiaohongshu-assets", slot: slug, imageCount: event.images?.length ?? 0 } });
      },
    });
    const jobs: Promise<unknown>[] = [];
    if (needsCover) jobs.push(run("wechat-cover", { title, summary: body.slice(0, 1600), style: parameters.cover_type, xhs_visual_style: parameters.visual_style, avatar_visual_mode: "no", ratio: parameters.ratio, studio_parent: "xiaohongshu-studio", studio_work_id: workId }));
    if (needsCards) jobs.push(run("wechat-images", { article: `${title}\n\n${body}`, style: parameters.visual_style, ratio: parameters.ratio, studio_parent: "xiaohongshu-studio", studio_work_id: workId }));
    const settled = await Promise.allSettled(jobs);
    const failure = settled.find(item => item.status === "rejected");
    if (failure?.status === "rejected") throw failure.reason;
  }
  const completed = await tryGetWorkDetail({ userId: input.user.id, workId });
  const completedState = completed?.content_json?.xiaohongshuStudioState as { headImage?: { id: string; url: string }; cards?: Array<{ id: string; url: string }> } | undefined;
  const images = [...(completedState?.headImage?.url ? [completedState.headImage] : []), ...(completedState?.cards ?? []).filter(image => image?.url)];
  if (images.length < 2) throw new Error("小红书配图尚未完整生成，请重试缺失项");
  return { invocationId: null, capabilityId: capability.id, appSlug: "xiaohongshu-assets", workId, title: `${title} · 小红书配图`, content: `已为《${title}》生成 1 张头图和 ${Math.max(0, images.length - 1)} 张正文配图。`, contentJson: { images, generatedImageCount: images.length, parentWorkId: workId, studioParent: "xiaohongshu-studio" }, resultUrl: "" };
}

async function invokeDigitalHumanHandoff(
  input: Parameters<typeof invokeWorkbuddyCapability>[0],
  capability: NonNullable<Awaited<ReturnType<typeof resolveActiveWorkbuddyCapability>>>,
) {
  // Handoffs must carry the user's deliverable, not the compiled agent context
  // (which also contains routing instructions, workflow state and observations).
  const script=(input.taskInput.previousArtifact || input.taskInput.sourceMaterial || input.taskInput.followup || input.taskInput.objective || input.taskInput.context).trim().slice(0,5000);
  if(script.length<5)throw new Error("请先提供要生成口播视频的完整口播文案");
  const params=new URLSearchParams({script,title:input.taskInput.objective.replace(/\s+/g," ").slice(0,60)||"小谷口播视频"});
  const resultUrl=`/apps/digital-human-video?${params.toString()}`;
  const protocol=input.taskInput.protocol;
  const invocation=await query<{id:string}>(
    `insert into workbuddy_capability_invocations(task_id,step_id,user_id,capability_id,capability_kind,app_slug,status,input_json,output_json,points_cost,started_at,completed_at,idempotency_key)
     values($1,$2,$3,$4,'app','digital-human-video','completed',$5,$6,0,now(),now(),$7)
     on conflict(idempotency_key) where idempotency_key is not null do update set updated_at=now() returning id`,
    [input.taskId,input.stepId,input.user.id,capability.id,JSON.stringify({source:script,protocol}),JSON.stringify({title:"口播视频生成已就绪",content:"口播文案已带入口播视频生成工作台",contentJson:{items:[{id:"digital-human-handoff",title:"口播视频生成工作台",url:resultUrl}]},resultUrl}),protocol?.idempotencyKey??null],
  ).then(result=>result.rows[0]??null);
  return {invocationId:invocation?.id??null,capabilityId:capability.id,appSlug:"digital-human-video",workId:null,title:"口播视频生成已就绪",content:"口播文案已完整带入口播视频生成工作台。请确认人物、声音和画幅后提交生成。",contentJson:{items:[{id:"digital-human-handoff",title:"口播视频生成工作台",url:resultUrl}],handoff:true},resultUrl} satisfies CapabilityInvocationResult;
}

async function invokeOpenChatCut(
  input: Parameters<typeof invokeWorkbuddyCapability>[0],
  capability: NonNullable<Awaited<ReturnType<typeof resolveActiveWorkbuddyCapability>>>,
) {
  const availability = await getOpenChatCutAvailability();
  if (!availability.available) throw new Error(availability.reason || "OpenChatCut 当前不可用");
  const { objective, context, previousArtifact = "", followup = "" } = input.taskInput;
  const instruction = [objective, context && `补充上下文：\n${context}`, previousArtifact && `已有版本：\n${previousArtifact}`, followup && `本轮要求：\n${followup}`]
    .filter(Boolean).join("\n\n").slice(0, 30_000);
  const invocation = await query<{ id: string }>(
    `insert into workbuddy_capability_invocations(task_id,step_id,user_id,capability_id,capability_kind,status,input_json,points_cost,started_at)
     values($1,$2,$3,$4,$5,'running',$6,0,now()) returning id`,
    [input.taskId, input.stepId, input.user.id, capability.id, capability.kind, JSON.stringify({ instruction })],
  ).then(result => result.rows[0] ?? null).catch(() => null);
  const task = await enqueueLocalAgentTask({
    taskType: "openchatcut.edit",
    ownerUserId: input.user.id,
    payload: { userId: input.user.id, workbuddyTaskId: input.taskId, invocationId: invocation?.id ?? null, instruction },
    priority: 500,
    maxAttempts: 2,
  });
  input.onEvent?.({ type: "openchatcut.queued", message: "已交给本机 OpenChatCut，正在创建可编辑时间线", data: { localTaskId: task.id } });
  const deadline = Date.now() + 30 * 60_000;
  while (Date.now() < deadline) {
    if (input.signal?.aborted) throw new Error("任务已停止");
    const current = await getOwnedLocalAgentTask(task.id, input.user.id);
    if (!current) throw new Error("OpenChatCut 剪辑任务不存在或已失效");
    if (current.status === "failed" || current.status === "cancelled") {
      const message = current.errorMessage || "OpenChatCut 剪辑失败";
      await query(`update workbuddy_capability_invocations set status='failed',error_message=$2,completed_at=now(),updated_at=now() where id=$1`, [invocation?.id ?? null, message.slice(0, 500)]).catch(() => undefined);
      throw new Error(message);
    }
    if (current.status === "succeeded") {
      const result = current.result ?? {};
      const editorUrl = typeof result.editorUrl === "string" ? result.editorUrl : "";
      const workspaceUrl = "/workbuddy/video-editor";
      const projectName = typeof result.projectName === "string" ? result.projectName : "OpenChatCut 工程";
      const summary = typeof result.summary === "string" && result.summary.trim() ? result.summary.trim() : "OpenChatCut 已完成可编辑时间线处理。";
      await query(`update workbuddy_capability_invocations set status='completed',output_json=$2,completed_at=now(),updated_at=now() where id=$1`, [invocation?.id ?? null, JSON.stringify(result)]).catch(() => undefined);
      input.onEvent?.({ type: "openchatcut.completed", message: "OpenChatCut 可编辑工程已准备完成", data: { editorUrl, projectName } });
      return {
        invocationId: invocation?.id ?? null,
        capabilityId: capability.id,
        appSlug: "openchatcut",
        workId: null,
        title: projectName,
        content: `${summary}\n\n打开可编辑工程：${workspaceUrl}`,
        contentJson: { ...result, openChatCutEditorUrl: editorUrl, native: true, nativeType: "openchatcut-edit", localTaskId: task.id },
        resultUrl: workspaceUrl,
      } satisfies CapabilityInvocationResult;
    }
    await abortableDelay(1_500, input.signal);
  }
  throw new Error("OpenChatCut 剪辑等待超时，任务可能仍在本机继续执行");
}

async function resolveWorkbuddyTrafficTopicSelection(userId: string, appSlug: string, values: Record<string, CreationFieldValue>) {
  const topicIds = Array.isArray(values.traffic_selected_topic_ids)
    ? values.traffic_selected_topic_ids.filter((value): value is string => typeof value === "string" && Boolean(value))
    : [];
  const workId = typeof values.traffic_existing_work_id === "string" ? values.traffic_existing_work_id.trim() : "";
  if (!topicIds.length && !workId) return null;
  if (!topicIds.length || !workId) throw new Error("选题选择信息不完整，请重新选择 1—3 个选题");
  if (topicIds.length > 3) throw new Error("一次最多选择 3 个选题");
  const work = await tryGetWorkDetail({ userId, workId });
  const arena = work?.app_run?.result_json?.trafficTopicArena as TrafficWorkflowArena | undefined;
  if (!work || work.platform !== appSlug || work.app_run?.input_payload?.traffic_topic_only !== "yes" || !Array.isArray(arena?.topics)) {
    throw new Error("原选题作品不存在或已经进入正文创作，请重新分析选题");
  }
  const coachLabels = Object.fromEntries((arena.coaches ?? []).flatMap(coach => coach.id && coach.label ? [[coach.id, coach.label]] : []));
  return {
    work,
    values: buildTrafficGenerationValues({
      base: values, topicWorkId: workId, topics: arena.topics, selectedTopicIds: topicIds,
      research: arena.research, evidencePack: arena.evidencePack, topicProcess: arena.topicProcess,
      coachOverrides: readTrafficCoachOverrides(values, topicIds), coachLabels, appEntry: "workbuddy",
    }),
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
    const research = await runFastResearch({ objective, context, initialQueries: input.taskInput.searchQueries, userId: input.user.id, onEvent: input.onEvent, signal: input.signal });
    sources = research.sources;
    fastResearchTrace = research.trace;
  }
  if (nativeType === "video-link-summary" || nativeType === "link-reader") {
    sourceInspection = await inspectWorkbuddySource({
      userId: input.user.id,
      text: [objective, context, followup].filter(Boolean).join("\n"),
      onEvent: input.onEvent,
      signal: input.signal,
    });
  }
  const evidenceSources = nativeType === "fast-research" ? sources.slice(0, 6) : sources.slice(0, 12);
  const evidenceExcerptLength = nativeType === "fast-research" ? 450 : 900;
  const evidence = evidenceSources.length ? evidenceSources.map((item, index) => `[来源${index + 1}] ${item.title}\n搜索提供商: ${item.provider}\nURL: ${item.url}\n发布时间: ${item.publishedDate || "未提供"}\n摘要: ${item.content.slice(0, evidenceExcerptLength)}`).join("\n\n") : "本次没有获得可用的公开检索结果，不得声称已经联网核验。";
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
      sources: sources.map(({ title, url, publishedDate, provider }) => ({ title, url, publishedDate, provider })),
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
      onEvent: input.onEvent,
      signal: input.signal,
      maxQueries: 6,
      mode: "discovery",
    }).catch(() => null),
  ]);
  const searchCandidates = searchResultsToHotTopics(discoveryResearch?.sources ?? []);
  const discoveryPool = rankHotTopicCandidates([...boardCandidates, ...searchCandidates], preference, 36);
  const hotTopics = discoveryPool.slice(0, 12);
  if (input.signal?.aborted) throw new Error("任务已停止");
  if (!hotTopics.length) throw new Error("当前没有取得可用的实时热点榜单");
  const platformCount = new Set(hotTopics.map((topic) => topic.source)).size;
  const content = formatHotTopicObservation(hotTopics, discoveredAt);
  const outputJson = { native: true, nativeType: "hot-topic-discovery", discoveredAt, platformCount, hotTopics, discoveryPool, discoveryResearch: discoveryResearch?.trace };
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
    "openchatcut-edit": "OpenChatCut 剪辑任务由独立本机执行器处理。",
    "digital-human-handoff": "口播视频由专用工作台在用户确认身份资产后提交。",
    "xiaohongshu-assets": "小红书图文配套由专用组合执行器处理。",
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
