import { getPool, query } from "@/lib/db/client";
import type { SessionUser } from "@/lib/auth/session";
import { checkCompliance } from "@/lib/compliance/check";
import { streamInsuranceContentAgent } from "@/lib/agent/insurance-agent";
import type { WorkbuddyScenario } from "./catalog";
import { resolveActiveWorkbuddyCapability } from "./capabilities";
import { invokeWorkbuddyCapability, type WorkbuddyRuntimeEvent } from "./runtime";
import { decideWorkbuddyAgentAction, routeWorkbuddyRequest } from "./planner";
import { runAgentRuntime, type AgentObservation, type AgentRuntimeState } from "./agent-runtime";
import { buildFinalAnswerPolicy, evaluateHumanControl } from "./agent-policies";
import { planWorkbuddyPresentation } from "./presentation";
import { applicationNeedsConversationForm, appNextActions, assessApplicationReadiness, buildConversationAppFields, hasConversationAppParameters, resolveConversationAppSource } from "./app-conversation";
import { tryGetCreationAppBySlug } from "@/lib/db/repositories";

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
  return { ...task.rows[0], steps: steps.rows, artifacts: artifacts.rows, approvals: approvals.rows, messages: messages.rows, invocations: invocations.rows };
}

export async function createWorkbuddyTask(user: SessionUser, input: { objective: string; scenario?: WorkbuddyScenario; context?: string; priority?: string }, onEvent?: EventReporter, signal?: AbortSignal) {
  const userId = user.id;
  const scenario = input.scenario ?? "general";
  const title = input.objective.replace(/\s+/g, " ").slice(0, 34) + (input.objective.length > 34 ? "…" : "");
  const client = await getPool().connect();
  let taskId = "";
  try {
    await client.query("begin");
    const task = await client.query<{ id: string }>(`insert into workbuddy_tasks(user_id,title,objective,scenario,status,priority,progress,context_json,started_at) values($1,$2,$3,$4,'running',$5,5,$6,now()) returning id`, [userId, title, input.objective, scenario, input.priority ?? "normal", JSON.stringify({ supplementalContext: input.context ?? "", source: "workbuddy", runtime: "modular-agent-v2" })]);
    taskId = task.rows[0].id;
    await client.query(`insert into workbuddy_task_messages(task_id,user_id,role,message_type,content) values($1,$2,'user','objective',$3)`, [taskId, userId, input.objective]);
    await client.query(`insert into workbuddy_audit_events(user_id,task_id,event_type,detail_json) values($1,$2,'task.created',$3)`, [userId, taskId, JSON.stringify({ scenario, runtime: "modular-agent-v2" })]);
    await client.query("commit");
  } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
  onEvent?.({ type: "task.created", message: "任务已创建，小谷开始自主执行", taskId, data: { taskId, runtime: "modular-agent-v2" } });
  await runWorkbuddyAgentLoop(user, taskId, input.objective, input.context ?? "", "", onEvent, signal);
  const completedTask = await getWorkbuddyTask(userId, taskId);
  if (completedTask?.status === "waiting_approval") onEvent?.({ type: "task.completed", message: completedTask.artifacts?.length ? "执行完成，成果已进入验收" : "本轮已暂停，等待你补充信息", taskId, data: { task: completedTask } });
  return completedTask;
}

async function runWorkbuddyAgentLoop(user: SessionUser, taskId: string, objective: string, context: string, followup: string, onEvent?: EventReporter, signal?: AbortSignal) {
  const executionId = crypto.randomUUID();
  await query(`update workbuddy_tasks set context_json=jsonb_set(coalesce(context_json,'{}'::jsonb),'{activeExecutionId}',to_jsonb($2::text),true),updated_at=now() where id=$1 and user_id=$3`, [taskId, executionId, user.id]);
  const assertActiveExecution = async () => {
    const active = await query<{ active_execution_id: string }>(`select context_json->>'activeExecutionId' as active_execution_id from workbuddy_tasks where id=$1 and user_id=$2`, [taskId, user.id]);
    if (active.rows[0]?.active_execution_id !== executionId) throw new StaleWorkbuddyExecutionError("旧执行分支已被新的任务运行替代");
  };
  let latestResult: Awaited<ReturnType<typeof invokeWorkbuddyCapability>> | null = null;
  let pendingAppInstruction = "";
  try {
    onEvent?.({ type: "router.started", message: "正在判断回答、研究或应用执行模式", taskId });
    const requestRoute = await routeWorkbuddyRequest(user, { objective, context, followup });
    await query(`update workbuddy_tasks set context_json=jsonb_set(coalesce(context_json,'{}'::jsonb),'{requestRoute}',$2::jsonb,true),updated_at=now() where id=$1 and user_id=$3`, [taskId, JSON.stringify(requestRoute), user.id]);
    await query(`insert into workbuddy_audit_events(user_id,task_id,event_type,detail_json) values($1,$2,'router.selected',$3)`, [user.id, taskId, JSON.stringify(requestRoute)]);
    onEvent?.({ type: "router.selected", message: routeDisplayMessage(requestRoute.mode), taskId, data: requestRoute });
    const result = await runAgentRuntime({
      maxIterations: 7,
      signal,
      decide: async ({ iteration, observations }) => {
        onEvent?.({ type: "agent.thinking", message: iteration === 1 ? "正在理解目标并决定下一步" : "正在观察工具结果并决定下一步", taskId, data: { iteration } });
        return decideWorkbuddyAgentAction(user, { objective, context, followup, observations, iteration, route: requestRoute });
      },
      control: async (action) => {
        await assertActiveExecution();
        const capability = action.type === "tool_call" ? await resolveActiveWorkbuddyCapability(action.capabilityId) : null;
        if (action.type === "tool_call" && capability?.appSlug) {
          const app = await tryGetCreationAppBySlug(capability.appSlug);
          const taskText = `${followup}\n${context}`;
          const currentRequest = followup.trim() || objective.trim();
          if (app && !hasConversationAppParameters(taskText, capability.appSlug)) {
            const readiness = assessApplicationReadiness(app, currentRequest);
            if (!readiness.ready) return { outcome: "ask_user" as const, question: readiness.question, reason: `app-readiness:${capability.appSlug}` };
          }
          const needsForm = capability.appSlug === "traffic-copy" || Boolean(app && applicationNeedsConversationForm(app));
          if (needsForm && !hasConversationAppParameters(taskText, capability.appSlug)) {
            pendingAppInstruction = action.instruction;
            return { outcome: "ask_user" as const, question: `执行“${capability.name}”前，请确认本次创作参数。`, reason: `app-parameters:${capability.appSlug}` };
          }
          if (hasConversationAppParameters(taskText, capability.appSlug) && capability.riskLevel !== "external-write") return { outcome: "allow" as const };
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
        const presentationSource = resolveConversationAppSource(pendingAppInstruction, followup, objective);
        const presentation = reason === "traffic-topic-selection" && latestResult
          ? buildTrafficTopicSelectionPresentation(latestResult, question)
          : appSlug ? await buildAppSettingsPresentation(user.id, appSlug, question, presentationSource) : readinessSlug ? buildAppReadinessPresentation(question) : null;
        await query(`insert into workbuddy_task_messages(task_id,role,message_type,content,metadata_json) values($1,'assistant','clarification',$2,$3)`, [taskId, question, JSON.stringify({ reason, iteration, pendingAppInstruction: pendingAppInstruction || undefined, ...(presentation ? { presentation: { blocks: [presentation] } } : {}) })]);
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
          const finalPrompt = `${buildFinalAnswerPolicy()}\n\n用户目标：${objective}\n用户提供的上下文：${context.slice(0, 16000) || "无"}\n本轮追问：${followup || "无"}\n主 Agent 草稿：${draft}\n工具观察：${state.observations.map(item => item.summary).join("\n\n").slice(0, 24000) || "无"}`;
          for await (const chunk of streamInsuranceContentAgent([{ role: "user", content: finalPrompt }], user.id, "general")) {
            if (signal?.aborted) throw new Error("任务已停止");
            content += chunk;
            onEvent?.({ type: "content.delta", message: chunk, taskId });
          }
        }
        if (!content.trim()) content = draft;
        await saveAgentLoopDelivery(user.id, taskId, objective, content, state.observations, latestResult);
        onEvent?.({ type: "agent.completed", message: `目标已完成，共执行 ${state.iteration} 轮决策、调用 ${state.observations.length} 次工具`, taskId, data: { iteration: state.iteration, toolCalls: state.observations.length } });
      },
      invoke: async (action, state) => {
        await assertActiveExecution();
        const observation = await invokeAgentTool({ user, taskId, action, state, context, followup, onEvent, signal, setLatestResult: value => { latestResult = value; } });
        await assertActiveExecution();
        return observation;
      },
      trace: async event => {
        await query(`insert into workbuddy_audit_events(user_id,task_id,event_type,detail_json) values($1,$2,$3,$4)`, [user.id, taskId, `agent.${event.type}`, JSON.stringify({ iteration: event.iteration, action: event.action, detail: event.detail })]);
      },
    });
    if (result.status === "exhausted") throw new Error("小谷达到本轮最大行动次数，仍未形成可交付结果");
  } catch (error) {
    if (error instanceof StaleWorkbuddyExecutionError) return;
    const rawMessage = error instanceof Error ? error.message : "任务执行失败";
    const message = /fetch failed|network error|econnreset|socket hang up/i.test(rawMessage)
      ? "主模型连接暂时失败，本轮尚未开始生成，也不会扣除应用点数。请直接重试。"
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

async function buildAppSettingsPresentation(userId: string, appSlug: string, question: string, source: string) {
  const app = await tryGetCreationAppBySlug(appSlug);
  if (!app) return null;
  const fields = buildConversationAppFields(app, source).map((field) =>
    (field.type === "text" || field.type === "textarea" || field.type === "file") && typeof field.initialValue === "string" && field.initialValue.trim()
      ? { ...field, presentation: "data" as const }
      : field,
  );
  if (appSlug !== "traffic-copy") return { type: "form" as const, appSlug, title: app.name, description: question, submitLabel: `确认并执行${app.name}`, fields };
  const coaches = await query<{ id: string; name: string; identity_card: { summary?: string } | null }>(
    `select versions.id,coaches.name,coaches.identity_card
       from creative_coach_versions versions
       join creative_coaches coaches on coaches.id=versions.coach_id
      where coaches.status='active' and coaches.is_system=false and versions.status in ('active','restored')
        and (coaches.coach_scope='platform' or (coaches.coach_scope='personal' and coaches.user_id=$1))
      order by case when coaches.coach_scope='personal' then 0 else 1 end,coaches.updated_at desc,versions.version desc`,
    [userId],
  ).catch(() => ({ rows: [] as Array<{ id: string; name: string; identity_card: { summary?: string } | null }> }));
  return { type: "form" as const, appSlug, title: app.name, description: question, submitLabel: "分析并推荐选题", fields: [
    { id: "traffic_arena_coach_version_ids", label: "参与选题分析的教练（最多 8 位）", type: "multiple" as const, required: true, multiple: true, initialValue: ["default"], options: [
      { label: "小谷教练", value: "default", description: "平台内置的财经、财富、保险与通用专业内容创作方法" },
      ...coaches.rows.slice(0, 7).map((coach) => ({ label: coach.name, value: coach.id, description: coach.identity_card?.summary || "使用该教练的方法与表达风格" })),
    ] },
    ...fields,
  ] };
}

function buildTrafficTopicSelectionPresentation(result: Awaited<ReturnType<typeof invokeWorkbuddyCapability>>, question: string) {
  const contentJson = result.contentJson as Record<string, unknown>;
  const arena = contentJson.trafficTopicArena as { topics?: Array<{ id?: string; title?: string; recommendationReason?: string; editorialVerdict?: string; assignedCoachLabel?: string }> } | undefined;
  const topics = Array.isArray(arena?.topics) ? arena.topics : [];
  if (!result.workId || !topics.length) return null;
  return {
    type: "form" as const,
    appSlug: "traffic-copy",
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
    ],
  };
}

async function invokeAgentTool(input: {
  user: SessionUser; taskId: string; action: Extract<Awaited<ReturnType<typeof decideWorkbuddyAgentAction>>, { type: "tool_call" }>;
  state: AgentRuntimeState; context: string; followup: string; onEvent?: EventReporter; signal?: AbortSignal;
  setLatestResult: (value: Awaited<ReturnType<typeof invokeWorkbuddyCapability>>) => void;
}): Promise<AgentObservation> {
  const capability = await resolveActiveWorkbuddyCapability(input.action.capabilityId);
  if (!capability) return { capabilityId: input.action.capabilityId, status: "error", summary: "工具不存在或当前不可用" };
  const position = await query<{ position: number }>(`select coalesce(max(position),0)+1 as position from workbuddy_task_steps where task_id=$1`, [input.taskId]).then(result => result.rows[0]?.position ?? input.state.iteration);
  const step = await query<{ id: string }>(`insert into workbuddy_task_steps(task_id,position,title,description,expert_key,skill_key,status,started_at) values($1,$2,$3,$4,'orchestrator',$5,'running',now()) returning id`, [input.taskId, position, `调用${capability.name}`, input.action.reason, capability.id]);
  input.onEvent?.({ type: "tool.started", message: `调用 ${capability.name}：${input.action.reason}`, taskId: input.taskId, data: { iteration: input.state.iteration, capabilityId: capability.id, stepId: step.rows[0].id } });
  try {
    const result = await invokeWorkbuddyCapability({ user: input.user, taskId: input.taskId, stepId: step.rows[0].id, capabilityId: capability.id, taskInput: { objective: input.action.instruction, context: [input.context, ...input.state.observations.map(item => item.summary)].filter(Boolean).join("\n\n"), followup: input.followup, searchQueries: input.action.searchQueries }, onEvent: event => input.onEvent?.({ ...event, taskId: input.taskId }), signal: input.signal });
    input.setLatestResult(result);
    await query(`update workbuddy_task_steps set status='completed',output_summary=$2,completed_at=now() where id=$1`, [step.rows[0].id, extractSummary(result.content)]);
    input.onEvent?.({ type: "tool.completed", message: `${capability.name}已返回结果，小谷正在检查是否满足目标`, taskId: input.taskId, data: { iteration: input.state.iteration, capabilityId: capability.id, resultUrl: result.resultUrl } });
    const completedCapabilityId = (result.contentJson as Record<string, unknown>).workbuddyStage === "traffic-topics" ? "app.traffic-copy:topics" : capability.id;
    return { capabilityId: completedCapabilityId, status: "success", summary: result.content.slice(0, 7000) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "工具调用失败";
    await query(`update workbuddy_task_steps set status='failed',output_summary=$2,completed_at=now() where id=$1`, [step.rows[0].id, message.slice(0, 500)]);
    input.onEvent?.({ type: "tool.failed", message: `${capability.name}调用失败，小谷将根据错误重新决策`, taskId: input.taskId, data: { iteration: input.state.iteration, capabilityId: capability.id, error: message } });
    return { capabilityId: capability.id, status: "error", summary: message };
  }
}

async function saveAgentLoopDelivery(userId: string, taskId: string, objective: string, content: string, observations: AgentObservation[], latestResult: Awaited<ReturnType<typeof invokeWorkbuddyCapability>> | null) {
  const compliance = checkCompliance(content);
  const sourceArtifact = latestResult ? await query<{ id: string }>(
    `insert into workbuddy_artifacts(task_id,artifact_type,title,content,content_json,status) values($1,$2,$3,$4,$5,'ready') returning id`,
    [taskId, latestResult.appSlug ? "app-output" : "agent-output", latestResult.title, latestResult.content, JSON.stringify({ original: true, capabilityId: latestResult.capabilityId, appSlug: latestResult.appSlug, workId: latestResult.workId, resultUrl: latestResult.resultUrl, contentJson: latestResult.contentJson })],
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
    presentation.push({ type: "choices", question: "接下来想怎么继续？", options: appNextActions(latestResult.appSlug, app?.resultType ?? "text") });
  }
  const presentationEnvelope = { blocks: presentation };
  const artifact = await query<{ id: string }>(`insert into workbuddy_artifacts(task_id,artifact_type,title,content,content_json,status) values($1,'delivery',$2,$3,$4,'ready') returning id`, [taskId, `${objective.slice(0, 40)} · 小谷交付`, content, JSON.stringify({ runtime: "modular-agent-v2", presentation: presentationEnvelope, sourceArtifactId: sourceArtifact?.rows[0]?.id, observations: observations.map(item => ({ capabilityId: item.capabilityId, status: item.status })), compliance, workId: latestResult?.workId, resultUrl: latestResult?.resultUrl, contentJson: latestResult?.contentJson })]);
  await query(`insert into workbuddy_task_messages(task_id,role,message_type,content,metadata_json) values($1,'assistant','delivery',$2,$3)`, [taskId, content, JSON.stringify({ artifactId: artifact.rows[0].id, sourceArtifactId: latestResult?.appSlug ? sourceArtifact?.rows[0]?.id : undefined, presentation: presentationEnvelope, runtime: "modular-agent-v2", toolCalls: observations.length, workId: latestResult?.workId, resultUrl: latestResult?.resultUrl })]);
  await query(`insert into workbuddy_approvals(task_id,artifact_id,approval_type,status,note) values($1,$2,'delivery','pending','请核对事实、客户信息和对外表达后验收。')`, [taskId, sourceArtifact?.rows[0]?.id ?? artifact.rows[0].id]);
  await query(`update workbuddy_tasks set status='waiting_approval',progress=95,summary=$2,error_message=null,updated_at=now() where id=$1`, [taskId, extractSummary(content)]);
}

export async function continueWorkbuddyTask(user: SessionUser, taskId: string, message: string, onEvent?: EventReporter, signal?: AbortSignal, supplementalContext = "") {
  const userId = user.id;
  const currentTask = await getWorkbuddyTask(userId, taskId);
  if (!currentTask) return null;
  onEvent?.({ type: "request.accepted", message: "已收到补充要求，正在读取已有成果", taskId });
  await query(`insert into workbuddy_task_messages(task_id,user_id,role,message_type,content) values($1,$2,'user','followup',$3)`, [taskId, userId, message]);
  await query(`update workbuddy_tasks set status='running',progress=82,updated_at=now() where id=$1 and user_id=$2`, [taskId, userId]);
  const latestArtifact = currentTask.artifacts?.at(-1)?.content ?? "尚无已有交付。";
  const pendingAppInstruction = [...(currentTask.messages ?? [])].reverse().find((item) => item.message_type === "clarification" && typeof item.metadata_json?.pendingAppInstruction === "string")?.metadata_json.pendingAppInstruction;
  const recentConversation = (currentTask.messages ?? []).slice(-10).map((item) => `${item.role === "user" ? "用户" : "小谷"}：${item.content}`).join("\n\n");
  const loopContext = [String(currentTask.context_json?.supplementalContext ?? ""), supplementalContext, pendingAppInstruction && `参数确认前已经确定的应用任务（必须继续保留）：\n${pendingAppInstruction}`, recentConversation && `最近对话：\n${recentConversation}`, `上一版成果：\n${latestArtifact}`].filter(Boolean).join("\n\n");
  await runWorkbuddyAgentLoop(user, taskId, currentTask.objective, loopContext, message, onEvent, signal);
  const completedTask = await getWorkbuddyTask(userId, taskId);
  if (completedTask?.status === "waiting_approval") onEvent?.({ type: "task.completed", message: completedTask.artifacts?.length ? "本轮执行完成，成果已更新" : "本轮已暂停，等待你补充信息", taskId, data: { task: completedTask } });
  return completedTask;
}

export async function editAndContinueWorkbuddyTask(user: SessionUser, taskId: string, messageId: string, replacement: string, onEvent?: EventReporter, signal?: AbortSignal, supplementalContext = "") {
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
  await runWorkbuddyAgentLoop(user, taskId, messageType === "objective" ? replacement : currentTask.objective, loopContext, messageType === "objective" ? "" : replacement, onEvent, signal);
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
  const result = await query<{ id: string }>(`update workbuddy_tasks set status='cancelled',summary='用户已停止本次执行',error_message=null,updated_at=now() where id=$1 and user_id=$2 and status in ('planning','running') returning id`, [taskId, userId]);
  if (!result.rows[0]) return getWorkbuddyTask(userId, taskId);
  await query(`update workbuddy_task_steps set status=case when status='running' then 'cancelled' else status end,completed_at=case when status='running' then now() else completed_at end where task_id=$1`, [taskId]);
  await query(`insert into workbuddy_audit_events(user_id,task_id,event_type,detail_json) values($1,$2,'task.cancelled','{}')`, [userId, taskId]);
  return getWorkbuddyTask(userId, taskId);
}

export async function saveWorkbuddyMessageFeedback(userId: string, taskId: string, messageId: string, rating: "up" | "down" | null) {
  const ownedMessage = await query<{ id: string }>(
    `select m.id from workbuddy_task_messages m
     join workbuddy_tasks t on t.id=m.task_id
     where m.id=$1 and m.task_id=$2 and t.user_id=$3 and m.role='assistant'`,
    [messageId, taskId, userId],
  );
  if (!ownedMessage.rows[0]) return false;
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
