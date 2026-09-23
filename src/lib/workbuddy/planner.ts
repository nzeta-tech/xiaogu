import { z } from "zod";
import type { SessionUser } from "@/lib/auth/session";
import { runInsuranceContentAgent } from "@/lib/agent/insurance-agent";
import type { WorkbuddyScenario } from "./catalog";
import { listActiveWorkbuddyCapabilities, type WorkbuddyOperation } from "./capabilities";
import { buildAgentPolicyPrompt } from "./agent-policies";
import { needsTrafficTopicSelection } from "./traffic-workflow";
import { buildSemanticRoutingPrompt, requestRouteSchema, semanticRequestRouteSchema, intentRouteIssues } from "./route-intent";
import { parseConversationAppParameters } from "./app-conversation";
import { classifyWorkflowTurn, type WorkbuddyActiveWorkflow } from "./workflow-state";
import { capabilityManifest, discloseCapabilities } from "./capability-disclosure";
import { inferTurnEnvelope } from "./interaction-protocol";
import { buildLayeredPrompt } from "./prompt-architecture";
import type { DeliverableContract } from "./deliverable-contract";
import { matchNamedCapability, normalizeConversationEvidence, normalizeResearchDepth, normalizeSemanticRouteCandidate, reconcileSemanticRoute } from "./semantic-route";
import { parseConversationContinuation } from "./continuation-navigation";
import { query } from "@/lib/db/client";

const decisionSchema = z.object({
  intent: z.string().min(2).max(120),
  scenario: z.enum(["content", "video", "customer", "product", "team", "research", "general"]),
  capabilityId: z.string().min(3),
  requiresFreshInformation: z.boolean(),
  searchQueries: z.array(z.string().min(2).max(180)).max(5),
  rationale: z.string().min(2).max(300),
});

export type WorkbuddyPlanDecision = z.infer<typeof decisionSchema>;

export type WorkbuddyRequestRoute = z.infer<typeof requestRouteSchema>;

const agentActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("tool_call"), capabilityId: z.string().min(3), instruction: z.string().min(2).max(3000), searchQueries: z.array(z.string().min(2).max(180)).max(5).optional(), outputSlotIds: z.array(z.string().min(1)).max(10).optional(), reason: z.string().min(2).max(300) }),
  z.object({ type: z.literal("final"), content: z.string().min(2).max(30000), reason: z.string().min(2).max(300) }),
  z.object({ type: z.literal("ask_user"), question: z.string().min(2).max(1000), reason: z.string().min(2).max(300) }),
]);

export type WorkbuddyAgentAction = z.infer<typeof agentActionSchema>;

export async function routeWorkbuddyRequest(user: SessionUser, input: { objective: string; context?: string; sourceContext?: string; followup?: string; activeWorkflow?: WorkbuddyActiveWorkflow | null; requestedCapabilityId?: string; taskId?: string }): Promise<WorkbuddyRequestRoute> {
  const currentRequest = input.followup?.trim() || input.objective.trim();
  const text = [input.followup, input.context, input.objective].filter(Boolean).join("\n");
  const requestedCapabilityId = input.requestedCapabilityId?.trim();
  const continuation = parseConversationContinuation(currentRequest);
  const selectedId = requestedCapabilityId || continuation?.targetCapabilityId || text.match(/能力 ID[：:]\s*([^\s。]+)/)?.[1];
  if (!selectedId && classifyWorkflowTurn(currentRequest, input.activeWorkflow) === "retry") return {
    mode: "capability", intent: currentRequest.slice(0, 160), targetCapabilityId: `app.${input.activeWorkflow!.appSlug}`,
    requiresFreshInformation: false, rationale: "用户正在口播选题阶段要求更换候选，沿用原素材重新运行选题分析", operation: "reselect", preserve: ["material", "research"],
  } satisfies WorkbuddyRequestRoute;
  const confirmedApp = input.followup?.match(/\[应用参数:([^\]]+)\]/)?.[1];
  const confirmedValues = confirmedApp ? parseConversationAppParameters(input.followup ?? "", confirmedApp) : null;
  const confirmedOperation = isWorkbuddyOperation(confirmedValues?._workbuddy_operation) ? confirmedValues._workbuddy_operation : undefined;
  const forced = selectedId || (confirmedApp ? confirmedApp === "xiaohongshu-assets" ? "skill.xiaohongshu-assets" : `app.${confirmedApp}` : "");
  const capabilities = await listActiveWorkbuddyCapabilities();
  const selectedCapability = forced ? capabilities.find((item) => item.id === forced) : null;
  if (requestedCapabilityId && !selectedCapability) throw new Error("你明确选择的 Skill 当前不可用，请重新选择；本轮不会自动替换成其他能力。");
  if (continuation?.targetCapabilityId && !selectedCapability) throw new Error("当前作品声明的下一步能力不可用，本轮已停止，未替换为其他应用。");
  if (selectedCapability) return {
    mode: "capability", intent: currentRequest.slice(0, 160), targetCapabilityId: forced,
    requiresFreshInformation: false, rationale: continuation ? "继续当前作品已声明的下一工作流步骤" : "用户已经明确选择并确认具体 Skill 或应用", operation: confirmedOperation ?? preferredOperation(selectedCapability.operations ?? inferCapabilityOperations(selectedCapability.kind)), preserve: continuation ? ["topic", "material", "format"] : confirmedOperation === "regenerate" ? ["topic", "material", "research", "coach", "format"] : [],
  } satisfies WorkbuddyRequestRoute;
  const available = capabilityManifest(discloseCapabilities({ request: currentRequest, capabilities: capabilities.filter((item) => item.id !== "agent.orchestrator"), max: 8 }));
  const now = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "full", timeStyle: "medium" }).format(new Date());
  const prompt = buildSemanticRoutingPrompt({ request: currentRequest, objective: input.objective, context: input.context, sourceContext: input.sourceContext, activeWorkflow: input.activeWorkflow, capabilityManifest: available, now });
  let requiresResearchFallback = false;
  let routeFeedback = "";
  for (let attempt = 0, previous = ""; attempt < 2; attempt += 1) {
    try {
      previous = await runInsuranceContentAgent([{ role: "user", content: attempt ? `${prompt}\n上次路由无法通过契约校验：${previous.slice(0, 1200)}。具体问题：${routeFeedback}。重新核对当前意图、证据需求和能力契约，只返回合法JSON。` : prompt }], user.id, "general", { creatorContextMode: "none", responseFormat: "json_object", temperature: 0.1, timeoutSeconds: 20 });
      const json = previous.match(/\{[\s\S]*\}/)?.[0];
      const rawCandidate = json ? JSON.parse(json) : null;
      if (rawCandidate && typeof rawCandidate === "object") {
        const signal = rawCandidate as Record<string, unknown>;
        requiresResearchFallback ||= signal.requiresFreshInformation === true || signal.evidenceRequirement === "current" || signal.evidenceRequirement === "verification" || (signal.intentAssessment as { externalEvidenceNeeded?: boolean } | undefined)?.externalEvidenceNeeded === true || signal.mode === "fast-research" || signal.mode === "deep-research";
      }
      const parsed = semanticRequestRouteSchema.safeParse(normalizeSemanticRouteCandidate(rawCandidate));
      if (!parsed.success) {
        routeFeedback = JSON.stringify(parsed.error.issues);
        await auditRouteAttempt(input.taskId, user.id, attempt + 1, "schema_invalid", previous, parsed.error.issues);
        continue;
      }
      const intentIssues = intentRouteIssues(parsed.data);
      if (intentIssues.length) {
        routeFeedback = intentIssues.join("；");
        await auditRouteAttempt(input.taskId, user.id, attempt + 1, "intent_mismatch", previous, intentIssues.map(message => ({ path: ["intentAssessment"], message })));
        continue;
      }
      if (parsed.data.targetCapabilityId && !capabilities.some((item) => item.id === parsed.data.targetCapabilityId)) {
        routeFeedback = `能力不存在：${parsed.data.targetCapabilityId}`;
        await auditRouteAttempt(input.taskId, user.id, attempt + 1, "unknown_capability", previous, [{ path: ["targetCapabilityId"], message: parsed.data.targetCapabilityId }]);
        continue;
      }
      const reconciled = reconcileSemanticRoute(parsed.data, capabilities);
      if (!reconciled) {
        routeFeedback = "交付物格式与能力不匹配，请根据能力清单重新选择";
        await auditRouteAttempt(input.taskId, user.id, attempt + 1, "contract_mismatch", previous, []);
        continue;
      }
      const route = normalizeResearchDepth(normalizeConversationEvidence(reconciled));
      const operation = route.operation ?? operationForMode(route.mode);
      const selected = route.targetCapabilityId ? capabilities.find(item => item.id === route.targetCapabilityId) : null;
      if (route.mode === "capability" && selected && !(selected.operations ?? inferCapabilityOperations(selected.kind)).includes(operation)) {
        routeFeedback = `所选能力不支持操作：${operation}`;
        await auditRouteAttempt(input.taskId, user.id, attempt + 1, "operation_mismatch", previous, [{ path: ["operation"], message: operation }]);
        continue;
      }
      await auditRouteAttempt(input.taskId, user.id, attempt + 1, "accepted", previous, []);
      return { ...route, operation, preserve: route.preserve ?? [], prerequisites: route.prerequisites ?? [] };
    } catch (error) {
      routeFeedback = "模型调用或 JSON 解析失败，请返回符合指定契约的 JSON";
      await auditRouteAttempt(input.taskId, user.id, attempt + 1, "parse_or_model_error", previous, [{ path: [], message: error instanceof Error ? error.message : String(error) }]);
    }
  }
  const fallbackTurn = inferTurnEnvelope({ request: currentRequest, hasActiveRun: Boolean(input.followup || input.activeWorkflow) });
  // A failed model route must never erase an explicitly named registered app.
  // This registry-backed fallback covers both creation and transformations.
  const namedCapability = ["create", "transform", "edit", "repair"].includes(fallbackTurn.mode)
    ? matchNamedCapability(currentRequest, capabilities)
    : null;
  if (namedCapability) {
    const kind = namedCapability.outputTypes[0] ?? "text";
    const operation = fallbackTurn.mode === "create"
      ? "create"
      : fallbackTurn.mode === "edit" ? "revise" : fallbackTurn.mode === "repair" ? "regenerate" : "transform";
    return {
      mode: "capability", operation,
      intent: currentRequest.slice(0, 160), targetCapabilityId: namedCapability.id,
      requiresFreshInformation: false, evidenceRequirement: "none", preserve: ["topic", "material"],
      deliverable: { required: true, kind, format: namedCapability.outputFormats?.[0] ?? namedCapability.appSlug ?? null, count: 1, sourceRelation: fallbackTurn.relation === "new_objective" ? "conversation" : "previous-artifact" },
      rationale: `用户明确点名“${namedCapability.name}”，按能力注册表绑定并承接已有素材`,
    } satisfies WorkbuddyRequestRoute;
  }
  const resumableCapability = input.activeWorkflow?.workId
    ? capabilities.find(item => item.id === `app.${input.activeWorkflow?.appSlug}`)
    : null;
  if (resumableCapability && input.activeWorkflow?.phase === "completed") {
    const kind = resumableCapability.outputTypes[0] ?? "text";
    return {
      mode: "capability",
      operation: "transform",
      intent: currentRequest.slice(0, 160),
      targetCapabilityId: resumableCapability.id,
      requiresFreshInformation: false,
      evidenceRequirement: "none",
      preserve: ["topic", "material", "format"],
      deliverable: { required: true, kind, format: resumableCapability.outputFormats?.[0] ?? resumableCapability.appSlug ?? null, count: 1, sourceRelation: "previous-artifact" },
      rationale: "语义路由输出异常；沿用最近完成的应用作品和素材继续处理，不启动无关检索",
    } satisfies WorkbuddyRequestRoute;
  }
  // Router failure means intent is uncertain. Outside the deterministic chat
  // cases, research is the safer generic
  // fallback: it gathers evidence instead of confidently answering from memory.
  if (requiresResearchFallback) return {
    mode: "fast-research", operation: "research", intent: currentRequest.slice(0, 160), targetCapabilityId: "agent.fast-research",
    requiresFreshInformation: true, evidenceRequirement: "current", preserve: ["topic", "research"], prerequisites: [],
    deliverable: { required: true, kind: "data", format: null, count: 1, sourceRelation: "conversation" },
    rationale: "路由结构未完全通过校验，但已确认任务依赖当前外部信息；保留该语义并安全回退到只读研究",
  } satisfies WorkbuddyRequestRoute;
  return input.context?.trim()
    ? { mode: "direct", operation: "answer", intent: currentRequest.slice(0, 160), targetCapabilityId: null, requiresFreshInformation: false, evidenceRequirement: "none", preserve: ["topic", "material"], rationale: "语义路由输出异常；已有对话成果时优先保留上下文直接处理，禁止无依据启动检索" } satisfies WorkbuddyRequestRoute
    : { mode: "fast-research", operation: "verify", intent: currentRequest.slice(0, 160), targetCapabilityId: "agent.fast-research", requiresFreshInformation: true, evidenceRequirement: "verification", preserve: [], rationale: "语义路由暂时无法确认意图，先用最小检索核实用户线索" } satisfies WorkbuddyRequestRoute;
}

async function auditRouteAttempt(taskId: string | undefined, userId: string, attempt: number, outcome: string, raw: string, issues: unknown[]) {
  if (!taskId) return;
  await query(`insert into workbuddy_audit_events(user_id,task_id,event_type,detail_json) values($1,$2,'router.model_attempt',$3)`, [userId, taskId, JSON.stringify({ attempt, outcome, raw: raw.slice(0, 4000), issues })]).catch(() => undefined);
}

function isWorkbuddyOperation(value: unknown): value is WorkbuddyOperation {
  return typeof value === "string" && ["chat", "answer", "research", "create", "regenerate", "revise", "reselect", "transform", "verify"].includes(value);
}

function inferCapabilityOperations(kind: string): WorkbuddyOperation[] {
  return kind === "agent" || kind === "connector" || kind === "mcp" ? ["research", "verify"] : ["create", "regenerate", "revise", "transform"];
}

function preferredOperation(operations: WorkbuddyOperation[]): WorkbuddyOperation {
  return (["create", "transform", "revise", "research", "verify", "answer", "chat"] as WorkbuddyOperation[]).find(operation => operations.includes(operation)) ?? operations[0] ?? "create";
}

function operationForMode(mode: WorkbuddyRequestRoute["mode"]): WorkbuddyOperation {
  return mode === "chat" ? "chat" : mode === "direct" ? "answer" : mode === "fast-research" || mode === "deep-research" ? "research" : "create";
}

export async function decideWorkbuddyAgentAction(user: SessionUser, input: { objective: string; context?: string; followup?: string; observations: Array<{ capabilityId: string; status: string; summary: string }>; iteration: number; route?: WorkbuddyRequestRoute; runId?: string; deliverableContract?: DeliverableContract | null; outputSlotIds?: string[] }) {
  if (needsTrafficTopicSelection(input.observations)) {
    return { type: "ask_user", question: "选题分析已经完成。请选择 1—3 个选题，再进入口播正文创作。", reason: "traffic-topic-selection" } satisfies WorkbuddyAgentAction;
  }
  const blockedApplication = [...input.observations].reverse().find((item) => item.status === "blocked" && item.capabilityId.startsWith("app."));
  if (blockedApplication) {
    return { type: "ask_user", question: blockedApplication.summary, reason: "app-output-needs-input" } satisfies WorkbuddyAgentAction;
  }
  // A declared capability target is already the authoritative execution plan.
  // Once it succeeds, finalize deterministically; sending media observations
  // back through the action model can turn image payloads into a bogus question.
  const completedTarget = input.route?.mode === "capability" && input.route.targetCapabilityId
    ? [...input.observations].reverse().find((item) => item.status === "success" && item.capabilityId === input.route?.targetCapabilityId)
    : undefined;
  if (completedTarget) {
    return { type: "final", content: completedTarget.summary, reason: "目标 Skill 已成功生成约定产物，直接进入结构化交付" } satisfies WorkbuddyAgentAction;
  }
  const completedApplication = [...input.observations].reverse().find((item) => item.status === "success" && item.capabilityId.startsWith("app."));
  if (completedApplication) {
    return { type: "final", content: completedApplication.summary, reason: "专业应用已成功生成本轮产物，直接进入交付，不重复调用" } satisfies WorkbuddyAgentAction;
  }
  // Research routes already have an authoritative execution plan. Once the
  // selected read-only capability returns usable evidence, do not ask the
  // action model to rediscover another research tool. This removes the common
  // fast -> hot-topic -> deep escalation chain. A genuinely empty evidence
  // packet still falls through so the Agent can recover or escalate.
  const completedResearch = input.route && ["fast-research", "deep-research"].includes(input.route.mode)
    ? [...input.observations].reverse().find(item =>
        item.status === "success"
        && [input.route?.targetCapabilityId, "agent.fast-research", "agent.deep-research", "tool.hot-topic-discovery"].includes(item.capabilityId)
        && !/没有获得可用的公开检索结果|没有取得可用的实时热点|不得声称已经联网核验/.test(item.summary),
      )
    : undefined;
  if (completedResearch) {
    return { type: "final", content: completedResearch.summary, reason: "既定研究节点已取得可用证据，直接进入一次最终综合" } satisfies WorkbuddyAgentAction;
  }
  if (input.iteration === 1 && input.observations.length === 0 && (input.route?.mode === "chat" || input.route?.mode === "direct")) return {
    type: "final", content: input.route.mode === "chat" ? "请自然、简短地回应用户。" : "请依据用户目标和现有上下文直接给出清楚、可用的回答。", reason: input.route.rationale,
  } satisfies WorkbuddyAgentAction;
  const capabilities = (await listActiveWorkbuddyCapabilities()).filter(item => item.id !== "agent.orchestrator");
  const pendingPrerequisite = input.route?.prerequisites?.find(prerequisite =>
    !input.observations.some(item => item.capabilityId === prerequisite.capabilityId && item.status === "success"),
  );
  if (pendingPrerequisite && capabilities.some(item => item.id === pendingPrerequisite.capabilityId)) {
    return { type: "tool_call", capabilityId: pendingPrerequisite.capabilityId, instruction: pendingPrerequisite.intent, reason: pendingPrerequisite.rationale } satisfies WorkbuddyAgentAction;
  }
  if (input.iteration === 1 && input.observations.length === 0 && input.route) {
    const capabilityId = input.route.mode === "deep-research" ? "agent.deep-research"
      : input.route.mode === "fast-research" ? (input.route.targetCapabilityId || "agent.fast-research")
      : input.route.requiresFreshInformation ? "agent.fast-research" : input.route.targetCapabilityId;
    if (capabilityId && capabilities.some((item) => item.id === capabilityId)) return {
      type: "tool_call", capabilityId, instruction: input.route.intent, reason: input.route.rationale,
    } satisfies WorkbuddyAgentAction;
  }
  if (input.route?.mode === "capability" && input.route.targetCapabilityId) {
    const targetDone = input.observations.some((item) => item.capabilityId === input.route?.targetCapabilityId && item.status === "success");
    const researchDone = input.observations.some((item) => ["agent.fast-research", "agent.deep-research", "tool.hot-topic-discovery"].includes(item.capabilityId) && item.status === "success");
    if (!targetDone && researchDone && capabilities.some((item) => item.id === input.route?.targetCapabilityId)) return {
      type: "tool_call", capabilityId: input.route.targetCapabilityId, instruction: `结合已取得的研究观察，执行用户要求的专业产物：${input.route.intent}`, reason: "前置信息已经取得，继续进入目标 Skill",
    } satisfies WorkbuddyAgentAction;
  }
  const explicitlySelectedId = [input.followup, input.context].filter(Boolean).join("\n").match(/能力 ID[：:]\s*([^\s。]+)/)?.[1];
  if (explicitlySelectedId) {
    const selected = capabilities.find((item) => item.id === explicitlySelectedId);
    const alreadyCompleted = input.observations.some((item) => item.capabilityId === explicitlySelectedId && item.status === "success");
    if (selected && !alreadyCompleted) return {
      type: "tool_call", capabilityId: selected.id,
      instruction: `用户已明确选择“${selected.name}”。请使用完整目标、上下文和本轮要求直接执行该 Skill，不要替换成其他能力。`,
      reason: "用户明确选择了指定 Skill",
    } satisfies WorkbuddyAgentAction;
  }
  const confirmedAppSlug = input.followup?.match(/\[应用参数:([^\]]+)\]/)?.[1];
  if (confirmedAppSlug) {
    const confirmedCapability = capabilities.find((item) => item.id === (confirmedAppSlug === "xiaohongshu-assets" ? "skill.xiaohongshu-assets" : `app.${confirmedAppSlug}`));
    if (confirmedCapability) return {
      type: "tool_call", capabilityId: confirmedCapability.id,
      instruction: `用户已经在对话中确认“${confirmedCapability.name}”的创作设置。沿用最近对话中已经选择的主题、素材和方向，按已确认参数直接执行；不要重新发现选题或扩大研究范围。`,
      reason: "用户已完成应用参数确认，继续执行当前应用",
    } satisfies WorkbuddyAgentAction;
  }
  const available = capabilityManifest(discloseCapabilities({ request: input.followup || input.objective, capabilities, operation: input.route?.operation, targetCapabilityId: input.route?.targetCapabilityId, max: 8 }));
  const now = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "full", timeStyle: "medium" }).format(new Date());
  const turn = inferTurnEnvelope({ request: input.followup || input.objective, runId: input.runId, sourceArtifactIds: input.deliverableContract?.sourceArtifactIds, outputKind: input.deliverableContract?.kind, expectedCount: input.deliverableContract?.expectedCount, hasActiveRun: Boolean(input.followup || input.iteration > 1) });
  const prompt = buildLayeredPrompt({ task: input.observations.some(item => item.status === "blocked") ? "repair" : "act", turn, capabilityManifest: available, runContext: `${buildAgentPolicyPrompt()}\n可信北京时间：${now}\n用户最终目标：${input.objective}\n补充资料：${(input.context || "无").slice(0, 10000)}\n本轮追问：${input.followup || "无"}\n当前循环：${input.iteration}\n入口路由：${input.route ? JSON.stringify(input.route) : "未提供"}\n交付契约：${JSON.stringify(input.deliverableContract ?? null)}\n输出槽位：${JSON.stringify(input.outputSlotIds ?? [])}`, observations: input.observations, taskInstructions: `每轮只决定一个动作：
- tool_call：只有确实需要工具时调用一个工具。instruction 必须包含该工具本次所需的完整目标和已知约束。
- final：现有信息已经足够且不需要专业应用产物时，直接给用户可用的最终答案。必须综合工具观察，不要只描述过程。
- ask_user：缺少无法安全推断的关键资料，且任何只读工具都无法补足时才询问用户。

行动约束：先保持用户指定的通用、泛财经、家庭财富、保险或交叉领域；不得把纯财经任务强行转成保险。发现“当前大家在讨论什么、热榜上有什么、有哪些实时选题机会”时，优先用 tool.hot-topic-discovery 取得宽泛候选。范围清晰的单一事实、当前状态、简单定义核验或简单比较，优先用 agent.fast-research；它会动态执行 1–3 个并发查询。多跳推理、多主题综合、证据冲突、高风险专业结论或需要形成完整研究报告时，使用 agent.deep-research。用户明确要求的交付物若有名称和用途匹配的专业应用，必须调用该应用，不能由主 Agent 用 final 模拟专业应用产物；只读研究结束或失败后也要重新检查是否应调用专业应用。应用必填信息能从用户消息、上轮候选和工具观察中推断时直接调用，只有缺少会改变交付方向的参数才询问。你应根据目标复杂度和已有观察自主选择或升级，不按关键词硬路由。不要把榜单热度当作事实证据，不要重复没有新增目的的成功调用。最多还可执行 ${Math.max(0, 7 - input.iteration)} 轮。

tool_call 必须原样携带仍需生成的 outputSlotIds。只输出一个 JSON 对象：tool_call={"type":"tool_call","capabilityId":"...","instruction":"...","searchQueries":["短查询1","短查询2"],"outputSlotIds":["..."],"reason":"..."}；final={"type":"final","content":"...","reason":"..."}；ask_user={"type":"ask_user","question":"...","reason":"..."}` }).prompt;
  let previous = "";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      previous = await runInsuranceContentAgent([{ role: "user", content: attempt ? `${prompt}\n上次输出无法解析：${previous.slice(0, 1500)}。只返回合法 JSON。` : prompt }], user.id, "general");
      const json = previous.match(/\{[\s\S]*\}/)?.[0];
      const parsed = agentActionSchema.safeParse(json ? JSON.parse(json) : null);
      if (!parsed.success) continue;
      const action = parsed.data;
      if (action.type === "tool_call" && !capabilities.some(item => item.id === action.capabilityId)) continue;
      return action;
    } catch { /* self-repair once */ }
  }
  const content = await runInsuranceContentAgent([{ role: "user", content: `你就是小谷。请直接完成下面任务，不要描述内部规划过程。\n\n目标：${input.objective}\n补充资料：${input.context || "无"}\n已有工具结果：${input.observations.map(item => item.summary).join("\n\n") || "无"}` }], user.id, "general");
  return { type: "final", content, reason: "结构化动作未能解析，当前小谷直接完成回答" } satisfies WorkbuddyAgentAction;
}

export async function planWorkbuddyTask(user: SessionUser, input: { objective: string; context?: string; scenario?: WorkbuddyScenario; followup?: string }) {
  const capabilities = await listActiveWorkbuddyCapabilities();
  const currentDateTime = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", weekday: "long", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
  const available = capabilityManifest(discloseCapabilities({ request: input.followup || input.objective, capabilities, max: 8 }));
  const prompt = `你是 Workbuddy 的任务规划器，不负责回答用户问题。请理解目标的真实信息依赖并选择执行能力，不得仅按单个关键词分类。

【可信系统时间】当前北京时间是 ${currentDateTime}。凡“今天、今日、最近、当前”等相对时间只能以此为准；不得使用模型记忆中的年份。搜索查询应写明正确日期或时间范围。

判断原则：
1. 开放式热点或实时选题发现选择 tool.hot-topic-discovery；范围清晰、预期用 1–3 个查询即可回答的简单事实问题选择 agent.fast-research；多跳、多主题、冲突证据、高风险专业结论或完整报告选择 agent.deep-research。
2. 只要正确答案依赖当前外部世界状态、近期事实、公开证据、用户未提供的事实或需要核验的事实，requiresFreshInformation=true，并选择上述合适的只读能力。
3. 如果用户已提供充分资料且任务只是整理、分析或改写，选择对应专业能力或应用，不要联网。
4. 用户明确选择的工作流是强偏好，但若缺少完成任务必需的实时信息，仍先选择合适的只读能力。
5. 不确定时优先选择能取得信息的只读能力，禁止随意回退到能力列表第一项。
6. searchQueries 只供深度研究使用，必须覆盖主题、时间范围、地域/行业限定；热点发现和非检索任务返回空数组。

用户目标：${input.objective}
补充资料摘要：${(input.context || "无").slice(0,3000)}
本轮追问：${input.followup || "无"}
用户选择工作流：${input.scenario || "general"}
可用能力：${JSON.stringify(available)}

只输出 JSON：{"intent":"...","scenario":"content|video|customer|product|team|research|general","capabilityId":"...","requiresFreshInformation":true,"searchQueries":["..."],"rationale":"..."}`;
  let previousOutput = "";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const repair = attempt === 0 ? "" : `\n\n上一次规划结果无法通过结构校验：\n${previousOutput.slice(0,2000)}\n请由你重新决策，不要沿用错误格式，只返回合法 JSON。`;
    try {
      previousOutput = await runInsuranceContentAgent([{ role: "user", content: `${prompt}${repair}` }], user.id, "general");
      const json = previousOutput.match(/\{[\s\S]*\}/)?.[0];
      const parsed = decisionSchema.safeParse(json ? JSON.parse(json) : null);
      if (!parsed.success || !capabilities.some(item => item.id === parsed.data.capabilityId)) continue;
      if (parsed.data.requiresFreshInformation) {
        const selected = capabilities.find(item => item.id === parsed.data.capabilityId && item.riskLevel === "read");
        if (!selected) throw new Error("任务需要外部信息，但规划器没有选择可用的只读能力");
        return { ...parsed.data, scenario: "research" as const };
      }
      return parsed.data;
    } catch { /* let the main planner repair its own decision once */ }
  }
  if (!capabilities.some(item => item.id === "agent.orchestrator")) throw new Error("小谷主 Agent 当前不可用");
  return { intent: input.objective.slice(0,120), scenario: input.scenario || "general", capabilityId: "agent.orchestrator", requiresFreshInformation: false, searchQueries: [], rationale: "专项计划未能通过结构校验，已由小谷主 Agent 按角色定位直接接管任务。" } satisfies WorkbuddyPlanDecision;
}
