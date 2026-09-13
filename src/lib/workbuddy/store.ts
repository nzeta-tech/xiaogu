import { getPool, query } from "@/lib/db/client";
import type { SessionUser } from "@/lib/auth/session";
import { checkCompliance } from "@/lib/compliance/check";
import { streamInsuranceContentAgent } from "@/lib/agent/insurance-agent";
import type { WorkbuddyScenario } from "./catalog";
import { resolveActiveWorkbuddyCapability } from "./capabilities";
import { invokeWorkbuddyCapability, type WorkbuddyRuntimeEvent } from "./runtime";
import { decideWorkbuddyAgentAction, routeWorkbuddyRequest } from "./planner";
import { runAgentRuntime, type AgentObservation, type AgentRuntimeState } from "./agent-runtime";
import { buildFinalAnswerPolicy, evaluateHumanControl, hasExplicitExternalWriteApproval } from "./agent-policies";
import { planWorkbuddyPresentation } from "./presentation";
import { formatAvatarMemoriesForPrompt, tryListActiveAvatarMemories, tryLogAvatarUsage } from "@/lib/avatar/store";
import { formatConversationStateForPrompt, mergeDeliveredConversationState, resolveConversationState, suggestedConversationTitle, type WorkbuddyConversationState } from "./conversation-state";
import { applicationNeedsConversationForm, appNextActions, assessApplicationReadiness, buildConversationAppFields, buildConversationAppHandoffSource, buildPriorConversationAppSource, resolveConversationAppParameters, resolvePendingApplicationHandoff, upgradeStoredConversationPresentation } from "./app-conversation";
import { buildXiaohongshuAssetsFields, XIAOHONGSHU_ASSETS_PARAMETER_SLUG } from "./xiaohongshu-assets-contract";
import { creationApps } from "@/lib/apps/catalog";
import { tryGetCreationAppBySlug } from "@/lib/db/repositories";
import { trafficCoachOverrideFieldId, type TrafficWorkflowArena } from "@/lib/creation/traffic-workflow-contract";
import { isAwaitingWorkflowSelection } from "@/lib/creation/workflow-stage";
import { buildWorkflowRetrySource, classifyWorkflowTurn, type WorkbuddyActiveWorkflow } from "./workflow-state";
import { compileWorkbuddyContext } from "./context-compiler";
import { buildArtifactGraph, formatArtifactReferences, resolveArtifactReferences } from "./artifact-graph";
import { buildDeliverableContract, inspectDeliverables, type DeliverableContract } from "./deliverable-contract";
import { buildMissingDeliverableInstruction, contractForCapability, contractForCreationApp, isAppClarificationResponse, normalizeAppDeliverables, previewDeliverableContent, type AppExecutionContract } from "./app-execution-contract";
import { buildOutputSlots, createToolCallEnvelope, evaluateOutputSlots, inferTurnEnvelope, WORKBUDDY_PROTOCOL_VERSION, type ObservationEnvelope } from "./interaction-protocol";
import { DEFAULT_EXECUTION_BUDGET, availableToolTimeMs, executionExhaustionMessage, initialBudgetState, toolTimeoutForCapability } from "./execution-budget";
import { reduceRunState, type WorkbuddyRunState } from "./run-state";
import { cancelBackgroundWorkRun } from "@/lib/creation/background-run-registry";
import { parseConversationContinuation } from "./continuation-navigation";
import { createQueuedWorkbuddyTurn, partitionQueuedWorkbuddyTurns, type QueuedWorkbuddyTurn } from "./queued-turns";
import { buildLayeredPrompt } from "./prompt-architecture";

export type WorkbuddyTask = {
  id: string; title: string; objective: string; scenario: WorkbuddyScenario; status: string; priority: string; progress: number;
  context_json: Record<string, unknown>; summary: string; error_message: string | null; created_at: string; updated_at: string;
  steps?: WorkbuddyStep[]; artifacts?: WorkbuddyArtifact[]; approvals?: WorkbuddyApproval[]; messages?: WorkbuddyMessage[]; invocations?: WorkbuddyInvocation[];
};
export type WorkbuddyMessage = { id: string; role: "user" | "assistant" | "system"; message_type: string; content: string; metadata_json: Record<string, unknown>; created_at: string };
export type WorkbuddyStep = { id: string; position: number; title: string; description: string; expert_key: string; skill_key: string; status: string; output_summary: string };
export type WorkbuddyArtifact = { id: string; step_id: string | null; artifact_type: string; title: string; content: string; content_json: Record<string, unknown>; status: string; created_at: string };
export type WorkbuddyApproval = { id: string; artifact_id: string | null; approval_type: string; status: string; note: string; created_at: string; resolved_at: string | null };
export type WorkbuddyInvocation = { id: string; step_id: string | null; capability_id: string; capability_kind: string; app_slug: string | null; status: string; input_json: Record<string, unknown>; output_json: Record<string, unknown>; work_id: string | null; app_run_id: string | null; points_cost: number; error_message: string | null; created_at: string };
export type WorkbuddyExecutionEvent = WorkbuddyRuntimeEvent & { taskId?: string };
type EventReporter = (event: WorkbuddyExecutionEvent) => void;
class StaleWorkbuddyExecutionError extends Error {}

export async function listWorkbuddyWorkspace(userId: string) {
  const [tasks, customers, automations] = await Promise.all([
    query<WorkbuddyTask>(`select * from workbuddy_tasks where user_id=$1 order by updated_at desc limit 40`, [userId]),
    query<{ id: string; display_name: string; stage: string; tags: string[]; needs_summary: string; next_action: string; next_action_at: string | null }>(`select id, display_name, stage, tags, needs_summary, next_action, next_action_at from workbuddy_customers where user_id=$1 order by updated_at desc limit 20`, [userId]),
    query<{ id: string; name: string; trigger_type: string; instruction: string; schedule_text: string; enabled: boolean; next_run_at: string | null }>(`select id, name, trigger_type, instruction, schedule_text, enabled, next_run_at from workbuddy_automations where user_id=$1 order by updated_at desc limit 20`, [userId]),
  ]);
  const stats = tasks.rows.reduce((result, task) => ({
    total: result.total + 1,
    running: result.running + (task.status === "running" || task.status === "planning" ? 1 : 0),
    waiting: result.waiting + (task.status === "waiting_approval" ? 1 : 0),
    completed: result.completed + (task.status === "completed" ? 1 : 0),
  }), { total: 0, running: 0, waiting: 0, completed: 0 });
  return { tasks: tasks.rows, customers: customers.rows, automations: automations.rows, stats };
}

export async function getWorkbuddyTask(userId: string, taskId: string) {
  const task = await query<WorkbuddyTask>(`select * from workbuddy_tasks where id=$1 and user_id=$2`, [taskId, userId]);
  if (!task.rows[0]) return null;
  const [steps, artifacts, approvals, messages, invocations] = await Promise.all([
    query<WorkbuddyStep>(`select id, position, title, description, expert_key, skill_key, status, output_summary from workbuddy_task_steps where task_id=$1 order by position`, [taskId]),
    query<WorkbuddyArtifact>(`select id, step_id, artifact_type, title, content, content_json, status, created_at from workbuddy_artifacts where task_id=$1 order by created_at`, [taskId]),
    query<WorkbuddyApproval>(`select id, artifact_id, approval_type, status, note, created_at, resolved_at from workbuddy_approvals where task_id=$1 order by created_at`, [taskId]),
    query<WorkbuddyMessage>(`select id, role, message_type, content, metadata_json, created_at from workbuddy_task_messages where task_id=$1 order by created_at`, [taskId]),
    query<WorkbuddyInvocation>(`select id,step_id,capability_id,capability_kind,app_slug,status,input_json,output_json,work_id,app_run_id,points_cost,error_message,created_at from workbuddy_capability_invocations where task_id=$1 order by created_at`, [taskId]).catch(() => ({ rows: [] as WorkbuddyInvocation[] })),
  ]);
  const upgradedMessages = messages.rows.map(message => ({ ...message, metadata_json: upgradeStoredConversationPresentation(message.metadata_json ?? {}, creationApps) }));
  return { ...task.rows[0], steps: steps.rows, artifacts: artifacts.rows, approvals: approvals.rows, messages: upgradedMessages, invocations: invocations.rows };
}

export async function createWorkbuddyTask(user: SessionUser, input: { objective: string; scenario?: WorkbuddyScenario; context?: string; priority?: string; requestedCapabilityId?: string }, onEvent?: EventReporter, signal?: AbortSignal) {
  const userId = user.id;
  const scenario = input.scenario ?? "general";
  const title = input.objective.replace(/\s+/g, " ").slice(0, 34) + (input.objective.length > 34 ? "…" : "");
  const client = await getPool().connect();
  let taskId = "";
  try {
    await client.query("begin");
    const task = await client.query<{ id: string }>(`insert into workbuddy_tasks(user_id,title,objective,scenario,status,priority,progress,context_json,started_at) values($1,$2,$3,$4,'running',$5,5,$6,now()) returning id`, [userId, title, input.objective, scenario, input.priority ?? "normal", JSON.stringify({ supplementalContext: input.context ?? "", requestedCapabilityId: input.requestedCapabilityId ?? "", source: "workbuddy", runtime: "modular-agent-v2" })]);
    taskId = task.rows[0].id;
    await client.query(`insert into workbuddy_task_messages(task_id,user_id,role,message_type,content) values($1,$2,'user','objective',$3)`, [taskId, userId, input.objective]);
    await client.query(`insert into workbuddy_audit_events(user_id,task_id,event_type,detail_json) values($1,$2,'task.created',$3)`, [userId, taskId, JSON.stringify({ scenario, runtime: "modular-agent-v2" })]);
    await client.query("commit");
  } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
  onEvent?.({ type: "task.created", message: "任务已创建，小谷开始自主执行", taskId, data: { taskId, runtime: "modular-agent-v2" } });
  await runWorkbuddyAgentLoop(user, taskId, input.objective, input.context ?? "", "", onEvent, signal, "", input.requestedCapabilityId);
  const completedTask = await getWorkbuddyTask(userId, taskId);
  if (completedTask && ["waiting_approval", "completed"].includes(completedTask.status)) onEvent?.({ type: "task.completed", message: completedTask.status === "completed" ? "本轮回答完成" : completedTask.artifacts?.length ? "执行完成，成果已进入验收" : "本轮已暂停，等待你补充信息", taskId, data: { task: completedTask } });
  return completedTask;
}

async function runWorkbuddyAgentLoop(user: SessionUser, taskId: string, objective: string, context: string, followup: string, onEvent?: EventReporter, signal?: AbortSignal, previousArtifact = "", requestedCapabilityId?: string, turnProjection?: { sourceArtifactIds?: string[]; expectedOutputs?: number | null; focusTitle?: string | null }) {
  const executionId = crypto.randomUUID();
  const currentTurn = {
    turnId: executionId,
    request: (followup || objective).slice(0, 1000),
    sourceArtifactIds: turnProjection?.sourceArtifactIds ?? [],
    expectedOutputs: turnProjection?.expectedOutputs ?? null,
    focusTitle: turnProjection?.focusTitle ?? null,
    createdAt: new Date().toISOString(),
  };
  await query(`update workbuddy_tasks set context_json=jsonb_set(jsonb_set(coalesce(context_json,'{}'::jsonb),'{activeExecutionId}',to_jsonb($2::text),true),'{currentTurn}',$4::jsonb,true),updated_at=now() where id=$1 and user_id=$3`, [taskId, executionId, user.id, JSON.stringify(currentTurn)]);
  const assertActiveExecution = async () => {
    const active = await query<{ active_execution_id: string }>(`select context_json->>'activeExecutionId' as active_execution_id from workbuddy_tasks where id=$1 and user_id=$2`, [taskId, user.id]);
    if (active.rows[0]?.active_execution_id !== executionId) throw new StaleWorkbuddyExecutionError("旧执行分支已被新的任务运行替代");
  };
  let latestResult: Awaited<ReturnType<typeof invokeWorkbuddyCapability>> | null = null;
  const collectedDeliverables = new Map<string, ReturnType<typeof normalizeAppDeliverables>[number]>();
  let pendingAppInstruction = "";
  let pendingAppSource = "";
  let queuedSteering = "";
  try {
    const taskSnapshot = await query<{ context_json: Record<string, unknown> }>(`select context_json from workbuddy_tasks where id=$1 and user_id=$2`, [taskId, user.id]);
    const recentRows = await query<{ role: "user" | "assistant" | "system"; message_type: string; content: string }>(`select role,message_type,content from workbuddy_task_messages where task_id=$1 order by created_at desc limit 12`, [taskId]);
    const currentRequest = followup.trim() || objective.trim();
    const priorState = taskSnapshot.rows[0]?.context_json?.conversationState as Partial<WorkbuddyConversationState> | undefined;
    const activeWorkflow = taskSnapshot.rows[0]?.context_json?.activeWorkflow as WorkbuddyActiveWorkflow | undefined;
    let conversationState = resolveConversationState({ currentRequest, previous: priorState, recentMessages: [...recentRows.rows].reverse() });
    const creatorMemories = conversationState.useCreatorMemory ? await tryListActiveAvatarMemories(user.id, 12, "short_video") : [];
    if (creatorMemories.length) await tryLogAvatarUsage({ userId: user.id, memoryIds: creatorMemories.map(item => item.id), contextType: `workbuddy:${conversationState.phase}` });
    let effectiveContext = [context, formatConversationStateForPrompt(conversationState), creatorMemories.length ? formatAvatarMemoriesForPrompt(creatorMemories) : ""].filter(Boolean).join("\n\n");
    await query(`update workbuddy_tasks set context_json=jsonb_set(coalesce(context_json,'{}'::jsonb),'{conversationState}',$2::jsonb,true),updated_at=now() where id=$1 and user_id=$3`, [taskId, JSON.stringify(conversationState), user.id]);
    onEvent?.({ type: "router.started", message: "正在判断回答、研究或应用执行模式", taskId });
    const routeStartedAt = Date.now();
    const requestRoute = await routeWorkbuddyRequest(user, { objective, context: effectiveContext, sourceContext: context, followup, activeWorkflow, requestedCapabilityId, taskId });
    await query(`insert into workbuddy_audit_events(user_id,task_id,event_type,detail_json) values($1,$2,'performance.phase',$3)`, [user.id, taskId, JSON.stringify({ executionId, phase: "route", durationMs: Date.now() - routeStartedAt, outcome: "success" })]).catch(() => undefined);
    if (requestRoute.deliverable?.required) {
      conversationState = {
        ...conversationState,
        explicitDeliverable: true,
        phase: ["revise", "regenerate", "transform"].includes(requestRoute.operation ?? "") ? "revision" : "creation",
        turnRelation: "execution",
      };
      effectiveContext = [context, formatConversationStateForPrompt(conversationState), creatorMemories.length ? formatAvatarMemoriesForPrompt(creatorMemories) : ""].filter(Boolean).join("\n\n");
      await query(`update workbuddy_tasks set context_json=jsonb_set(coalesce(context_json,'{}'::jsonb),'{conversationState}',$2::jsonb,true),updated_at=now() where id=$1 and user_id=$3`, [taskId, JSON.stringify(conversationState), user.id]);
    }
    const targetCapability = requestRoute.targetCapabilityId ? await resolveActiveWorkbuddyCapability(requestRoute.targetCapabilityId) : null;
    const targetApp = targetCapability?.appSlug ? await tryGetCreationAppBySlug(targetCapability.appSlug) : null;
    const appExecutionContract = targetApp ? contractForCreationApp(targetApp) : targetCapability ? contractForCapability(targetCapability) : null;
    const deliverableContract = buildDeliverableContract({
      request: currentRequest,
      expectedOutputs: requestRoute.deliverable?.required ? requestRoute.deliverable.count : turnProjection?.expectedOutputs ?? undefined,
      outputTypes: requestRoute.deliverable?.kind ? [requestRoute.deliverable.kind] : targetCapability?.outputTypes,
      sourceArtifactIds: turnProjection?.sourceArtifactIds,
      appSlug: appExecutionContract?.appSlug,
      defaultCount: appExecutionContract?.defaultCount,
      retryStrategy: appExecutionContract?.retryStrategy,
    });
    const outputSlots = deliverableContract ? buildOutputSlots(deliverableContract.kind, deliverableContract.expectedCount, deliverableContract.sourceArtifactIds) : [];
    const turnEnvelope = inferTurnEnvelope({ request: currentRequest, runId: executionId, sourceArtifactIds: deliverableContract?.sourceArtifactIds, outputKind: deliverableContract?.kind, expectedCount: deliverableContract?.expectedCount, hasActiveRun: Boolean(followup || activeWorkflow) });
    let runState: WorkbuddyRunState = {
      protocolVersion: WORKBUDDY_PROTOCOL_VERSION,
      runId: executionId,
      taskId,
      phase: "routing",
      iteration: 0,
      turn: turnEnvelope,
      deliverableContract,
      outputSlots,
      observations: [],
      completedArtifactIds: [],
      budget: DEFAULT_EXECUTION_BUDGET,
      budgetState: initialBudgetState(),
      updatedAt: new Date().toISOString(),
    };
    const promptMetadata = buildLayeredPrompt({ task: "act", turn: turnEnvelope, runContext: "运行态初始化", taskInstructions: "建立本轮 Prompt 指纹。" });
    runState = reduceRunState(runState, { type: "prompt", fingerprint: promptMetadata.fingerprint, stableFingerprint: promptMetadata.stableFingerprint });
    await persistRunState(user.id, taskId, runState);
    await query(`update workbuddy_tasks set context_json=jsonb_set(coalesce(context_json,'{}'::jsonb),'{deliverableContract}',$2::jsonb,true),updated_at=now() where id=$1 and user_id=$3`, [taskId, JSON.stringify(deliverableContract), user.id]);
    await query(`update workbuddy_tasks set context_json=jsonb_set(coalesce(context_json,'{}'::jsonb),'{requestRoute}',$2::jsonb,true),updated_at=now() where id=$1 and user_id=$3`, [taskId, JSON.stringify(requestRoute), user.id]);
    await query(`insert into workbuddy_audit_events(user_id,task_id,event_type,detail_json) values($1,$2,'router.selected',$3)`, [user.id, taskId, JSON.stringify(requestRoute)]);
    onEvent?.({ type: "router.selected", message: routeDisplayMessage(requestRoute.mode), taskId, data: requestRoute });
    // Route prerequisites are a small read-only DAG. They are independent
    // inputs to the target deliverable, so execute them concurrently instead
    // of spending one model decision round between every lookup.
    const prerequisitesStartedAt = Date.now();
    const prerequisiteObservations = requestRoute.prerequisites?.length
      ? await Promise.all(requestRoute.prerequisites.map(async prerequisite => invokeAgentTool({
          user,
          taskId,
          runId: executionId,
          outputSlots,
          sourceArtifactIds: deliverableContract?.sourceArtifactIds ?? [],
          appExecutionContract: null,
          action: { type: "tool_call", capabilityId: prerequisite.capabilityId, instruction: prerequisite.intent, reason: prerequisite.rationale },
          state: { iteration: 0, observations: [], budgetState: runState.budgetState },
          context: effectiveContext,
          followup,
          previousArtifact: "",
          sourceMaterial: currentRequest,
          operation: "research",
          onEvent,
          signal,
          setLatestResult: value => { latestResult = value; },
        })))
      : [];
    if (requestRoute.prerequisites?.length) {
      await query(`insert into workbuddy_audit_events(user_id,task_id,event_type,detail_json) values($1,$2,'performance.phase',$3)`, [user.id, taskId, JSON.stringify({ executionId, phase: "prerequisites", strategy: "parallel", count: requestRoute.prerequisites.length, durationMs: Date.now() - prerequisitesStartedAt, outcomes: prerequisiteObservations.map(item => item.status) })]).catch(() => undefined);
    }
    const result = await runAgentRuntime({
      maxIterations: DEFAULT_EXECUTION_BUDGET.maxIterations,
      budget: DEFAULT_EXECUTION_BUDGET,
      initialObservations: prerequisiteObservations,
      initialBudgetState: runState.budgetState,
      signal,
      decide: async ({ iteration, observations }) => {
        onEvent?.({ type: "agent.thinking", message: iteration === 1 ? "正在理解目标并决定下一步" : "正在观察工具结果并决定下一步", taskId, data: { iteration } });
        return decideWorkbuddyAgentAction(user, { objective, context: effectiveContext, followup: [followup, queuedSteering].filter(Boolean).join("\n\n"), observations, iteration, route: requestRoute, runId: executionId, deliverableContract, outputSlotIds: outputSlots });
      },
      control: async (action, state) => {
        await assertActiveExecution();
        const capability = action.type === "tool_call" ? await resolveActiveWorkbuddyCapability(action.capabilityId) : null;
        if (action.type === "tool_call" && capability?.nativeType === "xiaohongshu-assets") {
          const confirmedParameters = resolveConversationAppParameters(followup || objective, "", XIAOHONGSHU_ASSETS_PARAMETER_SLUG);
          if (!confirmedParameters) {
            pendingAppInstruction = action.instruction;
            pendingAppSource = followup.trim() || objective.trim();
            return { outcome: "ask_user" as const, question: "生成同一篇笔记的头图和正文配图前，请确认整套视觉设置。", reason: `app-parameters:${XIAOHONGSHU_ASSETS_PARAMETER_SLUG}` };
          }
          return { outcome: "allow" as const };
        }
        if (action.type === "tool_call" && capability?.appSlug) {
          const app = await tryGetCreationAppBySlug(capability.appSlug);
          const confirmedParameters = resolveConversationAppParameters(followup || objective, "", capability.appSlug);
          const currentRequest = followup.trim() || objective.trim();
          const latestAssistantContent = recentRows.rows.find(item => item.role === "assistant" && item.message_type === "delivery")?.content ?? "";
          const priorConversationSource = buildPriorConversationAppSource({ currentRequest, activeTopic: conversationState.activeTopic, latestAssistantContent, app: app ?? undefined });
          if (app && !confirmedParameters) {
            const readiness = assessApplicationReadiness(app, [currentRequest, priorConversationSource].filter(Boolean).join("\n\n"));
            if (!readiness.ready) return { outcome: "ask_user" as const, question: readiness.question, reason: `app-readiness:${capability.appSlug}` };
          }
          // Traffic topic analysis is free and already has a meaningful pause
          // at topic/coach selection. A second hidden confirmation before that
          // is an empty click. Regeneration is also an explicit delivery
          // request, so it can execute with the inherited artifact directly.
          const semanticTrafficOperation = capability.appSlug === "traffic-copy" && ["create", "reselect", "regenerate"].includes(requestRoute.operation ?? "");
          const needsForm = !semanticTrafficOperation && Boolean(app && applicationNeedsConversationForm(app));
          if (needsForm && !confirmedParameters) {
            pendingAppInstruction = action.instruction;
            pendingAppSource = buildConversationAppHandoffSource({
              appSlug: capability.appSlug,
              instruction: action.instruction,
              currentRequest,
              objective,
              observations: state.observations,
              priorConversationSource,
            });
            return { outcome: "ask_user" as const, question: `执行“${capability.name}”前，请确认本次创作参数。`, reason: `app-parameters:${capability.appSlug}` };
          }
          if (confirmedParameters && capability.riskLevel !== "external-write") return { outcome: "allow" as const };
        }
        if (action.type === "tool_call" && capability?.riskLevel === "external-write" && hasExplicitExternalWriteApproval(followup, capability.id)) {
          return { outcome: "allow" as const };
        }
        return evaluateHumanControl(action, capability);
      },
      askUser: async (question, reason, { iteration }) => {
        await assertActiveExecution();
        const appSlug = reason.startsWith("app-parameters:") ? reason.slice("app-parameters:".length) : "";
        const readinessSlug = reason.startsWith("app-readiness:") ? reason.slice("app-readiness:".length) : "";
        // The planner may already have researched and selected a concrete angle
        // before an application asks for interactive settings. Seed source-like
        // fields with that final application instruction, not the user's earlier
        // broad query, so confirming a coach cannot roll the task back in time.
        const presentationSource = pendingAppSource || buildConversationAppHandoffSource({
          appSlug: appSlug || readinessSlug,
          instruction: pendingAppInstruction,
          currentRequest: followup.trim() || objective.trim(),
          objective,
          observations: [],
          priorConversationSource: buildPriorConversationAppSource({
            currentRequest: followup.trim() || objective.trim(),
            activeTopic: conversationState.activeTopic,
            latestAssistantContent: recentRows.rows.find(item => item.role === "assistant" && item.message_type === "delivery")?.content ?? "",
          }),
        });
        const presentation = reason === "traffic-topic-selection" && latestResult
          ? await buildTrafficTopicSelectionPresentation(user.id, latestResult, question)
          : appSlug ? await buildAppSettingsPresentation(user.id, appSlug, question, presentationSource, requestRoute.operation) : readinessSlug ? buildAppReadinessPresentation(question) : null;
        const workflowSource = reason === "traffic-topic-selection" && latestResult?.invocationId
          ? await query<{ source: string }>(`select coalesce(input_json->>'source','') as source from workbuddy_capability_invocations where id=$1 and task_id=$2`, [latestResult.invocationId, taskId]).then(result => result.rows[0]?.source ?? "").catch(() => "")
          : "";
        const workflow = reason === "traffic-topic-selection" && latestResult?.workId && workflowSource
          ? { appSlug: latestResult.appSlug, phase: "awaiting-selection", source: workflowSource, workId: latestResult.workId, candidateTitles: ((latestResult.contentJson as Record<string, unknown>).trafficTopicArena as TrafficWorkflowArena | undefined)?.topics?.flatMap(topic => topic.title ? [topic.title] : []) ?? [], updatedAt: new Date().toISOString() } satisfies WorkbuddyActiveWorkflow
          : appSlug && presentationSource
            ? { appSlug, phase: "collecting-inputs", source: presentationSource, updatedAt: new Date().toISOString() } satisfies WorkbuddyActiveWorkflow
            : null;
        await query(`insert into workbuddy_task_messages(task_id,role,message_type,content,metadata_json) values($1,'assistant','clarification',$2,$3)`, [taskId, question, JSON.stringify({ reason, iteration, pendingAppInstruction: pendingAppInstruction || undefined, pendingAppSource: pendingAppSource || undefined, workflowAppSlug: reason === "traffic-topic-selection" ? "traffic-copy" : undefined, workflowSource: workflowSource || undefined, ...(presentation ? { presentation: { blocks: [presentation] } } : {}) })]);
        if (workflow) await query(`update workbuddy_tasks set context_json=jsonb_set(coalesce(context_json,'{}'::jsonb),'{activeWorkflow}',$2::jsonb,true),updated_at=now() where id=$1 and user_id=$3`, [taskId, JSON.stringify(workflow), user.id]);
        await query(`update workbuddy_tasks set status='waiting_approval',progress=$3,summary=$4,updated_at=now() where id=$1 and user_id=$2`, [taskId, user.id, Math.min(90, iteration * 12), question.slice(0, 180)]);
        onEvent?.({ type: "agent.waiting_user", message: question, taskId, data: { iteration, reason } });
      },
      deliver: async (action, state) => {
        await assertActiveExecution();
        const draft = action.content;
        let content = "";
        onEvent?.({ type: "agent.synthesizing", message: "信息已足够，正在形成最终回答", taskId, data: { iteration: state.iteration } });
        if (latestResult?.appSlug && latestResult.content.trim()) {
          content = latestResult.content.trim();
        } else {
          const finalPrompt = buildLayeredPrompt({
            task: "finalize",
            turn: turnEnvelope,
            runContext: `${buildFinalAnswerPolicy()}\n${formatConversationStateForPrompt(conversationState)}\n用户目标：${objective}\n用户提供的上下文：${effectiveContext.slice(0, 16000) || "无"}\n本轮追问：${followup || "无"}`,
            observations: state.observations.map(item => ({ capabilityId: item.capabilityId, status: item.status, preview: item.summary.slice(0, 4000), fullResultRef: item.protocol?.fullResultRef })),
            taskInstructions: `直接交付用户可用结果，不解释内部过程。主 Agent 草稿：\n${draft}`,
          }).prompt;
          for await (const chunk of streamInsuranceContentAgent([{ role: "user", content: finalPrompt }], user.id, "general")) {
            if (signal?.aborted) throw new Error("任务已停止");
            content += chunk;
            onEvent?.({ type: "content.delta", message: chunk, taskId });
          }
        }
        if (!content.trim()) content = draft;
        const partialReason=[...state.observations].reverse().find(item=>item.capabilityId==="agent.stop-gate"&&item.status==="blocked")?.summary;
        if(partialReason)content=`${content.trim()}\n\n> 已保留当前成功成果；仍有未完成项：${partialReason}`;
        conversationState = mergeDeliveredConversationState(conversationState, content);
        await saveAgentLoopDelivery(user.id, taskId, objective, content, state.observations, latestResult, conversationState, deliverableContract, appExecutionContract, [...collectedDeliverables.values()]);
        onEvent?.({ type: "agent.completed", message: `目标已完成，共执行 ${state.iteration} 轮决策、调用 ${state.observations.length} 次工具`, taskId, data: { iteration: state.iteration, toolCalls: state.observations.length } });
      },
      validateDelivery: async () => {
        const normalized = appExecutionContract && latestResult ? normalizeAppDeliverables({ contract: appExecutionContract, content: latestResult.content, contentJson: latestResult.contentJson as Record<string, unknown>, resultUrl: latestResult.resultUrl }) : [];
        for (const item of normalized) collectedDeliverables.set(`${item.kind}:${item.id}:${item.content.slice(0, 160)}`, item);
        const inspection = inspectDeliverables(deliverableContract, latestResult ? { content: latestResult.content, contentJson: latestResult.contentJson as Record<string, unknown>, normalizedCount: appExecutionContract ? collectedDeliverables.size : undefined } : null);
        if (!deliverableContract || requestRoute.mode !== "capability" || inspection.complete) return { outcome: "allow" as const };
        const protocolEvaluation = evaluateOutputSlots({
          expectedSlots: outputSlots,
          outputs: runState.observations.flatMap(item => item.outputs),
          retryStrategy: deliverableContract.retryStrategy,
        });
        const reason = appExecutionContract
          ? `${buildMissingDeliverableInstruction(appExecutionContract, inspection.expectedCount, inspection.actualCount, deliverableContract.sourceArtifactIds)}\n缺失输出槽位：${protocolEvaluation.missingSlots.join("、") || "按数量补齐"}。`
          : `${inspection.reason}。只补齐缺失成果，不要重新扩大主题或合并交付。`;
        await query(`insert into workbuddy_audit_events(user_id,task_id,event_type,detail_json) values($1,$2,'agent.stop_gate_blocked',$3)`, [user.id, taskId, JSON.stringify({ contract: deliverableContract, inspection, protocolEvaluation })]);
        onEvent?.({ type: "agent.thinking", message: "交付检查发现缺失成果，正在继续补齐", taskId, data: { inspection } });
        return { outcome: "continue" as const, reason };
      },
      invoke: async (action, state) => {
        await assertActiveExecution();
        const latestVisibleAssistantContent = recentRows.rows.find(item => item.role === "assistant" && item.message_type === "delivery")?.content ?? "";
        const inheritedArtifact = previousArtifact && previousArtifact !== "尚无已有交付。" ? previousArtifact : latestVisibleAssistantContent;
        const refersToPriorResult = ["continue", "modify_current", "repair_result"].includes(turnEnvelope.relation) || Boolean(deliverableContract?.sourceArtifactIds.length);
        const sourceMaterial = refersToPriorResult && inheritedArtifact ? inheritedArtifact : currentRequest;
        const observation = await invokeAgentTool({ user, taskId, runId: executionId, outputSlots, sourceArtifactIds: deliverableContract?.sourceArtifactIds ?? [], appExecutionContract, action, state, context: effectiveContext, followup, previousArtifact: refersToPriorResult ? inheritedArtifact : "", sourceMaterial, operation: requestRoute.operation, onEvent, signal, setLatestResult: value => { latestResult = value; } });
        await assertActiveExecution();
        return observation;
      },
      checkpoint: async (state, phase) => {
        if (phase === "deciding") {
          const queued = await drainQueuedWorkbuddyMessages(user.id, taskId, executionId, "steering");
          if (queued.length) {
            queuedSteering = [queuedSteering, ...queued.map(item => [item.content, item.supplementalContext].filter(Boolean).join("\n\n"))].filter(Boolean).join("\n\n");
            onEvent?.({ type: "agent.steered", message: `已把 ${queued.length} 条补充要求加入当前执行`, taskId, data: { count: queued.length } });
          }
        }
        const mappedPhase = phase === "waiting_user" ? "waiting_user" : phase === "completed" ? "completed" : phase === "evaluating" ? "evaluating" : phase === "invoking" ? "executing" : phase === "exhausted" ? "failed" : "planning";
        runState = { ...reduceRunState(runState, { type: "phase", phase: mappedPhase }), iteration: state.iteration, budgetState: state.budgetState };
        for (const observation of state.observations.flatMap(item => item.protocol ? [item.protocol] : [])) runState = reduceRunState(runState, { type: "observation", observation });
        await persistRunState(user.id, taskId, runState);
      },
      trace: async event => {
        await query(`insert into workbuddy_audit_events(user_id,task_id,event_type,detail_json) values($1,$2,$3,$4)`, [user.id, taskId, `agent.${event.type}`, JSON.stringify({ iteration: event.iteration, action: event.action, detail: event.detail })]);
      },
    });
    if (result.status === "failed") throw new Error(result.errorSummary || "应用执行失败，本轮已停止重复调用");
    if (result.status === "exhausted") throw new Error(executionExhaustionMessage(result.errorSummary));
    const queuedTurns = await drainQueuedWorkbuddyMessages(user.id, taskId, executionId, "next-turn");
    const nextTurn = queuedTurns[0];
    if (nextTurn) {
      if (queuedTurns.length > 1) await restoreQueuedWorkbuddyMessages(user.id, taskId, queuedTurns.slice(1));
      onEvent?.({ type: "request.accepted", message: nextTurn.requestedCapabilityId ? "当前步骤已完成，正在按你选择的 Skill 开始下一轮" : "当前步骤已完成，正在处理下一条要求", taskId, data: { queueId: nextTurn.id, requestedCapabilityId: nextTurn.requestedCapabilityId } });
      await continueWorkbuddyTask(user, taskId, nextTurn.content, onEvent, signal, nextTurn.supplementalContext, nextTurn.requestedCapabilityId, false);
    }
  } catch (error) {
    if (error instanceof StaleWorkbuddyExecutionError) return;
    const rawMessage = error instanceof Error ? error.message : "任务执行失败";
    const message = /fetch failed|network error|econnreset|socket hang up/i.test(rawMessage)
      ? "主模型连接在返回内容前中断，本次没有调用创作应用，也不会扣除应用点数。请直接重试。"
      : rawMessage;
    if (signal?.aborted || message === "任务已停止") {
      await query(`update workbuddy_tasks set status='cancelled',summary='用户已停止本次执行',error_message=null,updated_at=now() where id=$1 and user_id=$2`, [taskId, user.id]).catch(() => undefined);
      onEvent?.({ type: "task.cancelled", message: "已停止本次执行", taskId });
      return;
    }
    await query(`update workbuddy_tasks set status='failed',error_message=$2,updated_at=now() where id=$1 and user_id=$3`, [taskId, message.slice(0, 500), user.id]).catch(() => undefined);
    onEvent?.({ type: "task.failed", message, taskId });
  }
}


function routeDisplayMessage(mode: "chat" | "direct" | "fast-research" | "deep-research" | "capability") {
  if (mode === "chat") return "已进入闲聊模式，正在快速回应";
  if (mode === "direct") return "信息已经足够，正在快速回答";
  if (mode === "fast-research") return "需要当前信息，正在进行 Fast Research";
  if (mode === "deep-research") return "问题较复杂，正在进行 Deep Research";
  return "已匹配专业 Skill，正在进入应用流程";
}

function buildAppReadinessPresentation(question: string) {
  return {
    type: "choices" as const,
    question,
    options: [
      { label: "帮我找今天的热点", value: "请先帮我找今天适合我讲的热点，给我候选角度，不要直接生成成稿。", description: "先研究和筛选实时话题" },
      { label: "先给几个选题", value: "请先根据我的定位给几个选题，让我选择后再创作。", description: "不依赖实时热点，先明确方向" },
    ],
  };
}

async function buildAppSettingsPresentation(_userId: string, appSlug: string, question: string, source: string, operation = "create") {
  if (appSlug === XIAOHONGSHU_ASSETS_PARAMETER_SLUG) return {
    type: "form" as const,
    appSlug,
    title: "小红书配图",
    description: question,
    submitLabel: operation === "regenerate" ? "按此设置重新生成" : "确认并生成配图",
    fields: buildXiaohongshuAssetsFields(operation, parseConversationContinuation(source)?.workId ?? ""),
  };
  const app = await tryGetCreationAppBySlug(appSlug);
  if (!app) return null;
  const fields = buildConversationAppFields(app, source).map((field) =>
    (field.type === "text" || field.type === "textarea" || field.type === "file") && typeof field.initialValue === "string" && field.initialValue.trim()
      ? { ...field, presentation: "data" as const }
      : field,
  );
  const operationField = { id: "_workbuddy_operation", label: "本轮操作", type: "text" as const, required: true, presentation: "data" as const, initialValue: operation };
  const submitLabel = appSlug === "traffic-copy"
    ? operation === "regenerate" ? "重新生成文案" : operation === "reselect" ? "重新分析选题" : "分析并推荐选题"
    : operation === "regenerate" ? "重新生成" : operation === "revise" ? "确认并优化" : `确认并执行${app.name}`;
  return { type: "form" as const, appSlug, title: app.name, description: question, submitLabel, fields: [operationField, ...fields] };
}

async function buildTrafficTopicSelectionPresentation(userId: string, result: Awaited<ReturnType<typeof invokeWorkbuddyCapability>>, question: string) {
  const contentJson = result.contentJson as Record<string, unknown>;
  const arena = contentJson.trafficTopicArena as TrafficWorkflowArena | undefined;
  const topics = Array.isArray(arena?.topics) ? arena.topics : [];
  const arenaCoaches = Array.isArray(arena?.coaches) ? arena.coaches : [];
  const versionIds = arenaCoaches.flatMap(coach => coach.id && /^[0-9a-f-]{36}$/i.test(coach.id) ? [coach.id] : []);
  const storedCards = versionIds.length ? await query<{ id: string; identity_card: { title?: string; summary?: string; bestFor?: string } | null }>(
    `select versions.id,coaches.identity_card from creative_coach_versions versions join creative_coaches coaches on coaches.id=versions.coach_id where versions.id=any($1::uuid[]) and (coaches.is_system=true or coaches.coach_scope='platform' or coaches.user_id=$2)`,
    [versionIds, userId],
  ).then(response => new Map(response.rows.map(row => [row.id, row.identity_card]))).catch(() => new Map<string, { title?: string; summary?: string; bestFor?: string } | null>()) : new Map<string, { title?: string; summary?: string; bestFor?: string } | null>();
  const coaches = arenaCoaches.flatMap(coach => {
    if (!coach.id || !coach.label) return [];
    const stored = storedCards.get(coach.id);
    const title = coach.title || stored?.title;
    const summary = coach.summary || stored?.summary;
    const bestFor = coach.bestFor || stored?.bestFor;
    return [{ label: coach.label, value: coach.id, description: [title, summary, bestFor ? `适合：${bestFor}` : ""].filter(Boolean).join(" · ").slice(0, 300) }];
  });
  if (!result.workId || !topics.length) return null;
  return {
    type: "form" as const,
    appSlug: result.appSlug,
    title: "口播文案选题",
    description: question,
    submitLabel: "生成所选口播",
    fields: [
      { id: "traffic_existing_work_id", label: "选题作品", type: "text" as const, required: true, presentation: "data" as const, initialValue: result.workId },
      {
        id: "traffic_selected_topic_ids",
        label: "选择 1—3 个选题",
        type: "multiple" as const,
        required: true,
        multiple: true,
        initialValue: [],
        options: topics.flatMap((topic, index) => typeof topic.id === "string" && topic.title ? [{
          label: `${index + 1}. ${topic.title}`,
          value: topic.id,
          description: [topic.editorialVerdict || topic.recommendationReason, topic.assignedCoachLabel ? `推荐教练：${topic.assignedCoachLabel}` : ""].filter(Boolean).join(" · ").slice(0, 300),
        }] : []),
      },
      ...topics.flatMap((topic, index) => typeof topic.id === "string" && topic.title ? [{
        id: trafficCoachOverrideFieldId(topic.id),
        label: `选题 ${index + 1} · 正文教练`,
        type: "single" as const,
        required: false,
        initialValue: topic.assignedCoachId || topic.recommendedCoachId || "default",
        options: coaches,
        visibleWhen: [{ fieldId: "traffic_selected_topic_ids", equals: topic.id }],
      }] : []),
    ],
  };
}

async function invokeAgentTool(input: {
  user: SessionUser; taskId: string; runId: string; outputSlots: string[]; sourceArtifactIds: string[]; appExecutionContract: AppExecutionContract | null; action: Extract<Awaited<ReturnType<typeof decideWorkbuddyAgentAction>>, { type: "tool_call" }>;
  state: AgentRuntimeState; context: string; followup: string; previousArtifact?: string; sourceMaterial?: string; operation?: import("./capabilities").WorkbuddyOperation; onEvent?: EventReporter; signal?: AbortSignal;
  setLatestResult: (value: Awaited<ReturnType<typeof invokeWorkbuddyCapability>>) => void;
}): Promise<AgentObservation> {
  const capability = await resolveActiveWorkbuddyCapability(input.action.capabilityId);
  if (!capability) return { capabilityId: input.action.capabilityId, status: "error", summary: "工具不存在或当前不可用" };
  const position = await query<{ position: number }>(`select coalesce(max(position),0)+1 as position from workbuddy_task_steps where task_id=$1`, [input.taskId]).then(result => result.rows[0]?.position ?? input.state.iteration);
  const step = await query<{ id: string }>(`insert into workbuddy_task_steps(task_id,position,title,description,expert_key,skill_key,status,started_at) values($1,$2,$3,$4,'orchestrator',$5,'running',now()) returning id`, [input.taskId, position, `调用${capability.name}`, input.action.reason, capability.id]);
  const requestedSlots = input.action.outputSlotIds?.filter(slot => input.outputSlots.includes(slot)) ?? input.outputSlots;
  const requestedTimeoutMs = toolTimeoutForCapability(capability.id);
  const timeoutMs = availableToolTimeMs(DEFAULT_EXECUTION_BUDGET, input.state.budgetState, requestedTimeoutMs);
  if (timeoutMs < 1_000) return { capabilityId: capability.id, status: "error", summary: "本轮剩余时间已预留给最终交付，未启动新的工具调用" };
  const timeoutController = new AbortController();
  const timeout = setTimeout(() => timeoutController.abort(new Error(`工具执行超过 ${Math.round(timeoutMs / 1000)} 秒上限`)), timeoutMs);
  const toolSignal = input.signal ? AbortSignal.any([input.signal, timeoutController.signal]) : timeoutController.signal;
  const protocol = createToolCallEnvelope({ runId: input.runId, stepId: step.rows[0].id, attempt: Math.max(1, input.state.observations.filter(item => item.capabilityId === capability.id).length + 1), capabilityId: capability.id, input: { objective: input.action.instruction }, sourceArtifactIds: input.sourceArtifactIds, outputSlotIds: requestedSlots, timeoutMs });
  input.onEvent?.({ type: "tool.started", message: `调用 ${capability.name}：${input.action.reason}`, taskId: input.taskId, data: { iteration: input.state.iteration, capabilityId: capability.id, stepId: step.rows[0].id } });
  try {
    const result = await invokeWorkbuddyCapability({ user: input.user, taskId: input.taskId, stepId: step.rows[0].id, capabilityId: capability.id, taskInput: { objective: input.action.instruction, context: [input.context, ...input.state.observations.map(item => item.summary)].filter(Boolean).join("\n\n"), previousArtifact: input.previousArtifact, sourceMaterial: input.sourceMaterial, followup: input.followup, operation: input.operation, searchQueries: input.action.searchQueries, protocol }, onEvent: event => input.onEvent?.({ ...event, taskId: input.taskId }), signal: toolSignal });
    input.setLatestResult(result);
    if (capability.appSlug && isAppClarificationResponse(result.content)) {
      await query(`update workbuddy_task_steps set status='waiting_approval',output_summary=$2,completed_at=null where id=$1`, [step.rows[0].id, result.content.slice(0, 500)]);
      input.onEvent?.({ type: "tool.completed", message: `${capability.name}还需要补充输入，小谷已暂停交付`, taskId: input.taskId, data: { iteration: input.state.iteration, capabilityId: capability.id, stepId: step.rows[0].id } });
      return { capabilityId: capability.id, status: "blocked", summary: result.content.slice(0, 1000), protocol: { protocolVersion: WORKBUDDY_PROTOCOL_VERSION, observationId: result.invocationId ?? crypto.randomUUID(), runId: input.runId, stepId: step.rows[0].id, attempt: protocol.attempt, status: "blocked", retryable: true, preview: result.content.slice(0, 1000), outputs: [] } };
    }
    await query(`update workbuddy_task_steps set status='completed',output_summary=$2,completed_at=now() where id=$1`, [step.rows[0].id, extractSummary(result.content)]);
    input.onEvent?.({ type: "tool.completed", message: `${capability.name}已返回结果，小谷正在检查是否满足目标`, taskId: input.taskId, data: { iteration: input.state.iteration, capabilityId: capability.id, resultUrl: result.resultUrl } });
    const resultStage = (result.contentJson as Record<string, unknown>).workflowStage;
    const legacyTrafficStage = (result.contentJson as Record<string, unknown>).workbuddyStage === "traffic-topics";
    const completedCapabilityId = isAwaitingWorkflowSelection(resultStage) || legacyTrafficStage ? `${capability.id}:topics` : capability.id;
    const normalized = input.appExecutionContract ? normalizeAppDeliverables({ contract: input.appExecutionContract, content: result.content, contentJson: result.contentJson, resultUrl: result.resultUrl }) : [];
    const outputs = normalized.map((item, index) => ({ slotId: requestedSlots[index] ?? `${input.appExecutionContract?.outputKind ?? "text"}:${index + 1}`, artifactId: item.id, kind: item.kind, title: item.title, preview: previewDeliverableContent(item), contentRef: result.invocationId ? `workbuddy-observation://${result.invocationId}#${index}` : undefined, downloadUrl: item.url, editorUrl: result.resultUrl || undefined }));
    const observationProtocol: ObservationEnvelope = { protocolVersion: WORKBUDDY_PROTOCOL_VERSION, observationId: result.invocationId ?? crypto.randomUUID(), runId: input.runId, stepId: step.rows[0].id, attempt: protocol.attempt, status: requestedSlots.length && outputs.length < requestedSlots.length ? "partial" : "success", retryable: true, preview: result.content.slice(0, 2000), ...(result.invocationId ? { fullResultRef: `workbuddy-observation://${result.invocationId}` } : {}), outputs };
    return { capabilityId: completedCapabilityId, status: "success", summary: result.content.slice(0, 7000), protocol: observationProtocol };
  } catch (error) {
    const message = timeoutController.signal.aborted && !input.signal?.aborted
      ? `工具执行超过 ${Math.round(timeoutMs / 1000)} 秒上限，已停止并保留此前结果`
      : error instanceof Error ? error.message : "工具调用失败";
    await query(`update workbuddy_task_steps set status='failed',output_summary=$2,completed_at=now() where id=$1`, [step.rows[0].id, message.slice(0, 500)]);
    input.onEvent?.({ type: "tool.failed", message: `${capability.name}调用失败，小谷正在判断是否存在可行替代`, taskId: input.taskId, data: { iteration: input.state.iteration, capabilityId: capability.id, error: message } });
    return { capabilityId: capability.id, status: "error", summary: message, protocol: { protocolVersion: WORKBUDDY_PROTOCOL_VERSION, observationId: crypto.randomUUID(), runId: input.runId, stepId: step.rows[0].id, attempt: protocol.attempt, status: "failed", retryable: true, preview: message, outputs: [], error: { code: "CAPABILITY_EXECUTION_FAILED", message } } };
  } finally {
    clearTimeout(timeout);
  }
}

async function persistRunState(userId: string, taskId: string, state: WorkbuddyRunState) {
  await query(`update workbuddy_tasks set context_json=jsonb_set(coalesce(context_json,'{}'::jsonb),'{agentRun}',$2::jsonb,true),updated_at=now() where id=$1 and user_id=$3`, [taskId, JSON.stringify(state), userId]);
}

async function saveAgentLoopDelivery(userId: string, taskId: string, objective: string, content: string, observations: AgentObservation[], latestResult: Awaited<ReturnType<typeof invokeWorkbuddyCapability>> | null, conversationState: WorkbuddyConversationState, deliverableContract: DeliverableContract | null, appExecutionContract: AppExecutionContract | null, collectedDeliverables: ReturnType<typeof normalizeAppDeliverables>) {
  const compliance = checkCompliance(content);
  const professionalDelivery = Boolean(latestResult?.appSlug);
  const normalizedDeliverables = collectedDeliverables.length ? collectedDeliverables : appExecutionContract && latestResult ? normalizeAppDeliverables({ contract: appExecutionContract, content: latestResult.content, contentJson: latestResult.contentJson as Record<string, unknown>, resultUrl: latestResult.resultUrl }) : [];
  const sourceArtifact = professionalDelivery && latestResult ? await query<{ id: string }>(
    `insert into workbuddy_artifacts(task_id,artifact_type,title,content,content_json,status) values($1,$2,$3,$4,$5,'ready') returning id`,
    [taskId, latestResult.appSlug ? "app-output" : "agent-output", latestResult.title, latestResult.content, JSON.stringify({ runtime: "modular-agent-v4", protocolVersion: WORKBUDDY_PROTOCOL_VERSION, original: true, capabilityId: latestResult.capabilityId, appSlug: latestResult.appSlug, workId: latestResult.workId, resultUrl: latestResult.resultUrl, contentJson: latestResult.contentJson, normalizedDeliverables, appExecutionContract, derivedFromArtifactIds: deliverableContract?.sourceArtifactIds ?? [], deliverableContract })],
  ) : null;
  const resultContentJson = (latestResult?.contentJson ?? {}) as Record<string, unknown>;
  const sources = Array.isArray(resultContentJson.sources)
    ? resultContentJson.sources as Array<{ title?: string; url?: string; publishedDate?: string }>
    : Array.isArray(resultContentJson.hotTopics)
      ? (resultContentJson.hotTopics as Array<{ title?: string; sourceUrl?: string; sourcePublishedAt?: string }>).filter(item => item.sourceUrl).map(item => ({ title: item.title, url: item.sourceUrl, publishedDate: item.sourcePublishedAt }))
      : [];
  const presentation = await planWorkbuddyPresentation({ userId, objective, response: content, artifact: sourceArtifact?.rows[0] ? { id: sourceArtifact.rows[0].id, title: latestResult!.title, artifactType: latestResult!.appSlug ? "app-output" : "agent-output", resultUrl: latestResult!.resultUrl, appSlug: latestResult!.appSlug } : null, sources });
  if (latestResult?.appSlug) {
    const app = await tryGetCreationAppBySlug(latestResult.appSlug);
    if (app) presentation.push({ type: "choices", question: "接下来想怎么继续？", options: appNextActions(latestResult.appSlug, app.resultType, latestResult.resultUrl, { workId: latestResult.workId ?? undefined, sourceArtifactId: sourceArtifact?.rows[0]?.id }) });
  }
  const presentationEnvelope = { blocks: presentation };
  // Every visible delivery is addressable. This gives later app transformations
  // a stable source even when the delivery came directly from the main model
  // rather than a creation app.
  const artifact = await query<{ id: string }>(`insert into workbuddy_artifacts(task_id,artifact_type,title,content,content_json,status) values($1,'delivery',$2,$3,$4,'ready') returning id`, [taskId, `${objective.slice(0, 40)} · 小谷交付`, content, JSON.stringify({ runtime: "modular-agent-v4", protocolVersion: WORKBUDDY_PROTOCOL_VERSION, presentation: presentationEnvelope, sourceArtifactId: sourceArtifact?.rows[0]?.id, derivedFromArtifactIds: deliverableContract?.sourceArtifactIds ?? [], deliverableContract, appExecutionContract, normalizedDeliverables, observations: observations.map(item => ({ capabilityId: item.capabilityId, status: item.status, fullResultRef: item.protocol?.fullResultRef })), compliance, workId: latestResult?.workId, resultUrl: latestResult?.resultUrl, contentJson: latestResult?.contentJson })]);
  await query(`insert into workbuddy_task_messages(task_id,role,message_type,content,metadata_json) values($1,'assistant','delivery',$2,$3)`, [taskId, content, JSON.stringify({ visibility: "user_and_model", artifactId: artifact?.rows[0]?.id, sourceArtifactId: professionalDelivery ? sourceArtifact?.rows[0]?.id : undefined, presentation: presentationEnvelope, runtime: "modular-agent-v4", protocolVersion: WORKBUDDY_PROTOCOL_VERSION, toolCalls: observations.length, workId: latestResult?.workId, resultUrl: latestResult?.resultUrl })]);
  if (professionalDelivery) await query(`insert into workbuddy_approvals(task_id,artifact_id,approval_type,status,note) values($1,$2,'delivery','pending','请核对事实、客户信息和对外表达后验收。')`, [taskId, sourceArtifact?.rows[0]?.id ?? artifact?.rows[0]?.id]);
  await query(`update workbuddy_tasks set status=$2,progress=100,summary=$3,error_message=null,completed_at=case when $2='completed' then now() else completed_at end,context_json=jsonb_set(coalesce(context_json,'{}'::jsonb),'{conversationState}',$4::jsonb,true),updated_at=now() where id=$1`, [taskId, professionalDelivery ? "waiting_approval" : "completed", extractSummary(content), JSON.stringify(conversationState)]);
  if (latestResult?.appSlug && !isAwaitingWorkflowSelection((latestResult.contentJson as Record<string, unknown>).workflowStage)) {
    await query(`update workbuddy_tasks set context_json=case when context_json ? 'activeWorkflow' then jsonb_set(context_json,'{activeWorkflow,phase}','"completed"'::jsonb,true) else context_json end where id=$1`, [taskId]);
  }
}

export async function continueWorkbuddyTask(user: SessionUser, taskId: string, message: string, onEvent?: EventReporter, signal?: AbortSignal, supplementalContext = "", requestedCapabilityId?: string, recordUserMessage = true) {
  const userId = user.id;
  const currentTask = await getWorkbuddyTask(userId, taskId);
  if (!currentTask) return null;
  if (currentTask.status === "running" || currentTask.status === "planning") {
    await enqueueWorkbuddyMessage(userId, taskId, message, supplementalContext, requestedCapabilityId);
    onEvent?.({ type: "request.queued", message: "补充要求已排队，将在当前步骤结束后应用", taskId, data: { mode: "after-current-step" } });
    return getWorkbuddyTask(userId, taskId);
  }
  onEvent?.({ type: "request.accepted", message: "已收到补充要求，正在读取已有成果", taskId });
  if (recordUserMessage) await query(`insert into workbuddy_task_messages(task_id,user_id,role,message_type,content) values($1,$2,'user','followup',$3)`, [taskId, userId, message]);
  const nextTitle = /^(?:hi|hello|你好|您好|嗨|在吗)[呀啊吗!！,.，。\s]*$/i.test(currentTask.title) ? suggestedConversationTitle(message) : "";
  await query(`update workbuddy_tasks set status='running',progress=82,title=case when $3<>'' then $3 else title end,completed_at=null,updated_at=now() where id=$1 and user_id=$2`, [taskId, userId, nextTitle]);
  const artifactGraph = buildArtifactGraph(currentTask.artifacts ?? []);
  const artifactResolution = resolveArtifactReferences(message, artifactGraph);
  const artifactReferences = formatArtifactReferences(artifactResolution.nodes);
  const latestArtifact = artifactResolution.nodes.length
    ? artifactResolution.nodes.map(node => node.content).join("\n\n")
    : currentTask.artifacts?.at(-1)?.content ?? "尚无已有交付。";
  const pendingHandoff = resolvePendingApplicationHandoff(currentTask.messages ?? [], message);
  const pendingAppInstruction = pendingHandoff.instruction;
  const pendingAppSource = pendingHandoff.source;
  const activeSelection = [...(currentTask.messages ?? [])].reverse().find((item) => item.message_type === "clarification" && item.metadata_json?.reason === "traffic-topic-selection");
  const fallbackWorkflowSource = [...(currentTask.messages ?? [])].reverse().find((item) => item.role === "assistant" && item.message_type !== "clarification" && item.content.trim())?.content ?? "";
  const storedWorkflow = currentTask.context_json?.activeWorkflow as WorkbuddyActiveWorkflow | undefined;
  const legacyWorkflowSource = typeof activeSelection?.metadata_json?.workflowSource === "string" ? activeSelection.metadata_json.workflowSource : fallbackWorkflowSource;
  const activeWorkflow = storedWorkflow ?? (activeSelection && legacyWorkflowSource ? { appSlug: "traffic-copy", phase: "awaiting-selection", source: legacyWorkflowSource, workId: String(activeSelection.metadata_json?.workId ?? "") || undefined, candidateTitles: extractLegacyTrafficTopicTitles(activeSelection), updatedAt: activeSelection.created_at } satisfies WorkbuddyActiveWorkflow : undefined);
  const workflowTurn = classifyWorkflowTurn(message, activeWorkflow);
  if (activeWorkflow && !storedWorkflow && workflowTurn !== "exit") {
    await query(`update workbuddy_tasks set context_json=jsonb_set(coalesce(context_json,'{}'::jsonb),'{activeWorkflow}',$2::jsonb,true) where id=$1 and user_id=$3`, [taskId, JSON.stringify(activeWorkflow), userId]);
  }
  if (workflowTurn === "exit") await query(`update workbuddy_tasks set context_json=coalesce(context_json,'{}'::jsonb)-'activeWorkflow' where id=$1 and user_id=$2`, [taskId, userId]);
  const workflowContinuation = workflowTurn === "retry" && activeWorkflow
    ? `[应用参数:${activeWorkflow.appSlug}]\n${JSON.stringify({ source: buildWorkflowRetrySource(activeWorkflow) })}`
    : "";
  const recentDiscoveryPool = await query<{ pool: unknown }>(
    `select coalesce(output_json->'discoveryPool',output_json->'hotTopics','[]'::jsonb) as pool
       from workbuddy_capability_invocations
      where task_id=$1 and capability_id='tool.hot-topic-discovery' and status='completed'
      order by created_at desc limit 1`,
    [taskId],
  ).then(result => Array.isArray(result.rows[0]?.pool) ? result.rows[0].pool as Array<Record<string, unknown>> : []).catch(() => []);
  const discoveryPoolContext = recentDiscoveryPool.length
    ? `最近一次热点发现池（包含未展示候选；用户补充线索或索要其他热点时先匹配本池，证据不足再增量检索）：\n${recentDiscoveryPool.slice(0, 36).map((item, index) => `${index + 1}. ${String(item.title ?? "")}｜${String(item.source ?? "")}｜${String(item.summary ?? "").slice(0, 180)}`).join("\n")}`
    : "";
  const compiledContext = compileWorkbuddyContext({
    currentRequest: workflowContinuation || message,
    messages: currentTask.messages ?? [],
    supplementalContext: [String(currentTask.context_json?.supplementalContext ?? ""), supplementalContext].filter(Boolean).join("\n\n"),
    pendingInstruction: pendingAppInstruction,
    pendingSource: pendingAppSource,
    latestArtifact,
    workflowContinuation,
    discoveryPoolContext,
    artifactReferences,
  });
  const loopContext = compiledContext.prompt;
  // A workflow retry is a newly synthesized, single-use confirmation. Put it
  // in the current turn rather than conversation context so the runtime can
  // distinguish it from stale historical envelopes.
  // If the user chose “the first/second…” item, pass only that projected
  // section to the capability. The full conversation remains in loopContext
  // for reasoning, but it must not leak unselected candidates into app input.
  const selectedSource = compiledContext.focus?.content || latestArtifact;
  await runWorkbuddyAgentLoop(user, taskId, currentTask.objective, loopContext, workflowContinuation || message, onEvent, signal, selectedSource, requestedCapabilityId, {
    sourceArtifactIds: artifactResolution.nodes.map(node => node.id),
    expectedOutputs: compiledContext.expectedOutputs,
    focusTitle: compiledContext.focus?.title ?? null,
  });
  const completedTask = await getWorkbuddyTask(userId, taskId);
  if (completedTask && ["waiting_approval", "completed"].includes(completedTask.status)) onEvent?.({ type: "task.completed", message: completedTask.status === "completed" ? "本轮回答完成" : completedTask.artifacts?.length ? "本轮执行完成，成果已更新" : "本轮已暂停，等待你补充信息", taskId, data: { task: completedTask } });
  return completedTask;
}

async function enqueueWorkbuddyMessage(userId: string, taskId: string, content: string, supplementalContext = "", requestedCapabilityId?: string) {
  const item = createQueuedWorkbuddyTurn({ id: crypto.randomUUID(), content, supplementalContext, requestedCapabilityId, createdAt: new Date().toISOString() });
  await query(`update workbuddy_tasks set context_json=jsonb_set(coalesce(context_json,'{}'::jsonb),'{queuedMessages}',coalesce(context_json->'queuedMessages','[]'::jsonb)||$3::jsonb,true),updated_at=now() where id=$1 and user_id=$2`, [taskId, userId, JSON.stringify([item])]);
  await query(`insert into workbuddy_task_messages(task_id,user_id,role,message_type,content,metadata_json) values($1,$2,'user','queued_followup',$3,$4)`, [taskId, userId, content, JSON.stringify({ visibility: "user_and_model", queueMode: item.mode, queueId: item.id, requestedCapabilityId })]);
}

async function drainQueuedWorkbuddyMessages(userId: string, taskId: string, executionId: string, kind: "steering" | "next-turn") {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const selected = await client.query<{ context_json: Record<string, unknown> }>(`select context_json from workbuddy_tasks where id=$1 and user_id=$2 and context_json->>'activeExecutionId'=$3 for update`, [taskId, userId, executionId]);
    const all = Array.isArray(selected.rows[0]?.context_json?.queuedMessages) ? selected.rows[0].context_json.queuedMessages as QueuedWorkbuddyTurn[] : [];
    const { selected: queued, remaining } = partitionQueuedWorkbuddyTurns(all, kind);
    if (queued.length) await client.query(`update workbuddy_tasks set context_json=jsonb_set(context_json,'{queuedMessages}',$3::jsonb,true) where id=$1 and user_id=$2`, [taskId, userId, JSON.stringify(remaining)]);
    await client.query("commit");
    return queued;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function restoreQueuedWorkbuddyMessages(userId: string, taskId: string, items: QueuedWorkbuddyTurn[]) {
  if (!items.length) return;
  await query(`update workbuddy_tasks set context_json=jsonb_set(coalesce(context_json,'{}'::jsonb),'{queuedMessages}',coalesce(context_json->'queuedMessages','[]'::jsonb)||$3::jsonb,true),updated_at=now() where id=$1 and user_id=$2`, [taskId, userId, JSON.stringify(items)]);
}

function extractLegacyTrafficTopicTitles(message: WorkbuddyMessage) {
  const presentation = message.metadata_json?.presentation as { blocks?: Array<{ type?: string; fields?: Array<{ id?: string; options?: Array<{ label?: string }> }> }> } | undefined;
  const options = presentation?.blocks?.flatMap(block => block.fields ?? []).find(field => field.id === "traffic_selected_topic_ids")?.options ?? [];
  return options.flatMap(option => option.label ? [option.label.replace(/^\d+[.、]\s*/, "")] : []).slice(0, 12);
}

export async function editAndContinueWorkbuddyTask(user: SessionUser, taskId: string, messageId: string, replacement: string, onEvent?: EventReporter, signal?: AbortSignal, supplementalContext = "", requestedCapabilityId?: string) {
  const client = await getPool().connect();
  let messageType = "followup";
  try {
    await client.query("begin");
    const target = await client.query<{ message_type: string; created_at: string }>(
      `select m.message_type,m.created_at from workbuddy_task_messages m join workbuddy_tasks t on t.id=m.task_id where m.id=$1 and m.task_id=$2 and m.role='user' and t.user_id=$3 for update`,
      [messageId, taskId, user.id],
    );
    if (!target.rows[0]) throw new Error("要编辑的消息不存在");
    messageType = target.rows[0].message_type;
    const cutoff = target.rows[0].created_at;
    await client.query(`delete from workbuddy_capability_invocations where task_id=$1 and created_at >= $2`, [taskId, cutoff]);
    await client.query(`delete from workbuddy_artifacts where task_id=$1 and created_at >= $2`, [taskId, cutoff]);
    await client.query(`delete from workbuddy_task_steps where task_id=$1 and created_at >= $2`, [taskId, cutoff]);
    await client.query(`delete from workbuddy_audit_events where task_id=$1 and created_at >= $2`, [taskId, cutoff]);
    await client.query(`delete from workbuddy_task_messages where task_id=$1 and created_at >= $2`, [taskId, cutoff]);
    await client.query(`insert into workbuddy_task_messages(task_id,user_id,role,message_type,content,metadata_json) values($1,$2,'user',$3,$4,$5)`, [taskId, user.id, messageType, replacement, JSON.stringify({ editedFrom: messageId })]);
    if (messageType === "objective") {
      const title = replacement.replace(/\s+/g, " ").slice(0, 34) + (replacement.length > 34 ? "…" : "");
      await client.query(`update workbuddy_tasks set objective=$3,title=$4,status='running',progress=5,summary='',error_message=null,completed_at=null,updated_at=now() where id=$1 and user_id=$2`, [taskId, user.id, replacement, title]);
    } else {
      await client.query(`update workbuddy_tasks set status='running',progress=5,summary='',error_message=null,completed_at=null,updated_at=now() where id=$1 and user_id=$2`, [taskId, user.id]);
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
  onEvent?.({ type: "conversation.branched", message: "已从编辑位置重新执行，后续旧回答与产物已移出当前分支", taskId, data: { messageId } });
  const currentTask = await getWorkbuddyTask(user.id, taskId);
  if (!currentTask) return null;
  const latestArtifact = currentTask.artifacts?.at(-1)?.content ?? "";
  const loopContext = [String(currentTask.context_json?.supplementalContext ?? ""), supplementalContext, latestArtifact && `编辑位置之前的已有成果：\n${latestArtifact}`].filter(Boolean).join("\n\n");
  await runWorkbuddyAgentLoop(user, taskId, messageType === "objective" ? replacement : currentTask.objective, loopContext, messageType === "objective" ? "" : replacement, onEvent, signal, "", requestedCapabilityId);
  const completedTask = await getWorkbuddyTask(user.id, taskId);
  if (completedTask?.status === "waiting_approval") onEvent?.({ type: "task.completed", message: completedTask.artifacts?.length ? "编辑后的分支已执行完成" : "本轮已暂停，等待你补充信息", taskId, data: { task: completedTask } });
  return completedTask;
}

export async function resolveWorkbuddyApproval(user: SessionUser, taskId: string, approvalId: string, decision: "approved" | "rejected", note: string) {
  const userId = user.id;
  const currentTask = await getWorkbuddyTask(userId, taskId);
  if (!currentTask) return false;
  const result = await query<{ id: string }>(`update workbuddy_approvals a set status=$4,note=$5,resolved_by=$1,resolved_at=now() from workbuddy_tasks t where a.id=$3 and a.task_id=t.id and t.id=$2 and t.user_id=$1 and a.status='pending' returning a.id`, [userId, taskId, approvalId, decision, note]);
  if (!result.rows[0]) return false;
  if (decision === "approved") {
    await query(`update workbuddy_tasks set status='completed',progress=100,completed_at=now(),updated_at=now() where id=$1 and user_id=$2`, [taskId, userId]);
    await query(`update workbuddy_artifacts set status='approved',updated_at=now() where task_id=$1`, [taskId]);
    const latest = currentTask.artifacts?.at(-1);
    const nested = latest?.content_json?.contentJson;
    const customerDraft = nested && typeof nested === "object" ? (nested as Record<string, unknown>).customerDraft : null;
    if (customerDraft && typeof customerDraft === "object") {
      const draft = customerDraft as Record<string, unknown>;
      const displayName = typeof draft.displayName === "string" ? draft.displayName.trim().slice(0, 80) : "";
      if (displayName) {
        await query(
          `insert into workbuddy_customers(user_id,display_name,stage,needs_summary,next_action)
           values($1,$2,$3,$4,$5)`,
          [userId, displayName, typeof draft.stage === "string" ? draft.stage : "contacted", typeof draft.needsSummary === "string" ? draft.needsSummary : "", typeof draft.nextAction === "string" ? draft.nextAction : ""],
        );
      }
    }
  } else {
    await query(`update workbuddy_tasks set status='running',progress=80,summary=summary || $3,updated_at=now() where id=$1 and user_id=$2`, [taskId, userId, note ? `\n验收反馈：${note}` : "\n用户要求调整交付成果。"]).catch(() => undefined);
    await query(`update workbuddy_artifacts set status='rejected',updated_at=now() where task_id=$1`, [taskId]);
  }
  await query(`insert into workbuddy_audit_events(user_id,task_id,event_type,detail_json) values($1,$2,$3,$4)`, [userId, taskId, `approval.${decision}`, JSON.stringify({ approvalId, note })]);
  if (decision === "rejected") {
    const supplementalContext = typeof currentTask.context_json?.supplementalContext === "string" ? currentTask.context_json.supplementalContext : "";
    const revisionContext = [supplementalContext, `上一版成果：\n${currentTask.artifacts?.at(-1)?.content ?? "无"}`, "这是一次退回修改，保留必要的事实核验提示。"].filter(Boolean).join("\n\n");
    await runWorkbuddyAgentLoop(user, taskId, currentTask.objective, revisionContext, note || "请重新检查并优化本次交付。", undefined);
  }
  return true;
}

export async function cancelWorkbuddyTask(userId: string, taskId: string) {
  const activeInvocations = await query<{ id:string;work_id:string|null;app_run_id:string|null }>(`select id,work_id,app_run_id from workbuddy_capability_invocations where task_id=$1 and user_id=$2 and status='running'`, [taskId,userId]).catch(()=>({rows:[]}));
  const result = await query<{ id: string }>(`update workbuddy_tasks set status='cancelled',summary='用户已停止本次执行',error_message=null,updated_at=now() where id=$1 and user_id=$2 and status in ('planning','running') returning id`, [taskId, userId]);
  if (!result.rows[0]) return getWorkbuddyTask(userId, taskId);
  await query(`update workbuddy_task_steps set status=case when status='running' then 'cancelled' else status end,completed_at=case when status='running' then now() else completed_at end where task_id=$1`, [taskId]);
  for(const invocation of activeInvocations.rows)if(invocation.work_id)cancelBackgroundWorkRun(invocation.work_id);
  await query(`update workbuddy_capability_invocations set status='cancelled',error_message='用户已停止本次执行',completed_at=now(),updated_at=now() where task_id=$1 and user_id=$2 and status in ('running','failed')`, [taskId,userId]);
  const appRunIds=activeInvocations.rows.flatMap(item=>item.app_run_id?[item.app_run_id]:[]);
  if(appRunIds.length)await query(`update app_runs set status='cancelled',error_message='用户已停止本次执行',completed_at=now() where id=any($1::uuid[]) and status='running'`, [appRunIds]);
  await query(`insert into workbuddy_audit_events(user_id,task_id,event_type,detail_json) values($1,$2,'task.cancelled','{}')`, [userId, taskId]);
  return getWorkbuddyTask(userId, taskId);
}

export async function saveWorkbuddyMessageFeedback(userId: string, taskId: string, messageId: string, rating: "up" | "down" | null) {
  const updated = await query<{ id: string }>(
    `update workbuddy_task_messages m
        set metadata_json=case when $4::text is null then coalesce(m.metadata_json,'{}'::jsonb)-'feedback' else jsonb_set(coalesce(m.metadata_json,'{}'::jsonb),'{feedback}',to_jsonb($4::text),true) end
       from workbuddy_tasks t
      where m.id=$1 and m.task_id=$2 and t.id=m.task_id and t.user_id=$3 and m.role='assistant'
      returning m.id`,
    [messageId, taskId, userId, rating],
  );
  if (!updated.rows[0]) return false;
  await query(
    `insert into workbuddy_audit_events(user_id,task_id,event_type,detail_json)
     values($1,$2,'message.feedback',$3)`,
    [userId, taskId, JSON.stringify({ messageId, rating })],
  );
  return true;
}

function extractSummary(content: string) {
  return content.replace(/[#*_>`-]/g, " ").replace(/\s+/g, " ").trim().slice(0, 180);
}
