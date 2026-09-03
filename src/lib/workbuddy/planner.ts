import { z } from "zod";
import type { SessionUser } from "@/lib/auth/session";
import { runInsuranceContentAgent } from "@/lib/agent/insurance-agent";
import type { WorkbuddyScenario } from "./catalog";
import { listActiveWorkbuddyCapabilities } from "./capabilities";
import { buildAgentPolicyPrompt } from "./agent-policies";
import { needsTrafficTopicSelection } from "./traffic-workflow";

const decisionSchema = z.object({
  intent: z.string().min(2).max(120),
  scenario: z.enum(["content", "video", "customer", "product", "team", "research", "general"]),
  capabilityId: z.string().min(3),
  requiresFreshInformation: z.boolean(),
  searchQueries: z.array(z.string().min(2).max(180)).max(5),
  rationale: z.string().min(2).max(300),
});

export type WorkbuddyPlanDecision = z.infer<typeof decisionSchema>;

const requestRouteSchema = z.object({
  mode: z.enum(["chat", "direct", "fast-research", "deep-research", "capability"]),
  intent: z.string().min(2).max(160),
  targetCapabilityId: z.string().nullable(),
  requiresFreshInformation: z.boolean(),
  rationale: z.string().min(2).max(300),
});

export type WorkbuddyRequestRoute = z.infer<typeof requestRouteSchema>;

const agentActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("tool_call"), capabilityId: z.string().min(3), instruction: z.string().min(2).max(3000), searchQueries: z.array(z.string().min(2).max(180)).max(5).optional(), reason: z.string().min(2).max(300) }),
  z.object({ type: z.literal("final"), content: z.string().min(2).max(30000), reason: z.string().min(2).max(300) }),
  z.object({ type: z.literal("ask_user"), question: z.string().min(2).max(1000), reason: z.string().min(2).max(300) }),
]);

export type WorkbuddyAgentAction = z.infer<typeof agentActionSchema>;

export async function routeWorkbuddyRequest(user: SessionUser, input: { objective: string; context?: string; followup?: string }) {
  const currentRequest = input.followup?.trim() || input.objective.trim();
  const text = [input.followup, input.context, input.objective].filter(Boolean).join("\n");
  const selectedId = text.match(/能力 ID[：:]\s*([^\s。]+)/)?.[1];
  const confirmedApp = input.followup?.match(/\[应用参数:([^\]]+)\]/)?.[1];
  const forced = selectedId || (confirmedApp ? `app.${confirmedApp}` : "");
  const deterministic = forced ? null : deterministicWorkbuddyRoute(currentRequest, Boolean(input.context?.trim()));
  if (deterministic) return deterministic;
  const capabilities = await listActiveWorkbuddyCapabilities();
  if (forced && capabilities.some((item) => item.id === forced)) return {
    mode: "capability", intent: currentRequest.slice(0, 160), targetCapabilityId: forced,
    requiresFreshInformation: false, rationale: "用户已经明确选择并确认具体 Skill 或应用",
  } satisfies WorkbuddyRequestRoute;
  const available = capabilities.filter((item) => item.id !== "agent.orchestrator").map((item) => ({ id: item.id, name: item.name, description: item.description, kind: item.kind, risk: item.riskLevel, mode: item.executionMode }));
  const now = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "full", timeStyle: "medium" }).format(new Date());
  const prompt = `你是小谷主对话的入口路由器，只判断执行模式，不回答问题。\n当前北京时间：${now}\n当前请求（路由必须以此为准）：${currentRequest}\n原始会话目标（仅作背景）：${input.objective}\n最近对话与补充上下文：${(input.context || "无").slice(0, 5000)}\n可用能力：${JSON.stringify(available)}\n\n路由规则：\n- chat：问候、寒暄、情绪回应、询问小谷能力。\n- direct：不依赖外部最新信息，依据常识或用户现有资料即可快速回答。\n- fast-research：依赖当前外部信息，预计1–4个查询可解决；热点发现也属于此层，但目标能力选择 tool.hot-topic-discovery。\n- deep-research：需要多轮检索、多跳综合、证据冲突处理或高风险完整研究。\n- capability：用户要求明确专业产物，且有匹配的 Skill/应用。应用需要实时素材时仍选 capability，并将 requiresFreshInformation=true，由执行循环先研究再交付。\n不要按字数判断复杂度。targetCapabilityId 仅在 capability 模式或热点发现时填写。\n只输出JSON：{"mode":"chat|direct|fast-research|deep-research|capability","intent":"...","targetCapabilityId":null,"requiresFreshInformation":false,"rationale":"..."}`;
  for (let attempt = 0, previous = ""; attempt < 2; attempt += 1) {
    try {
      previous = await runInsuranceContentAgent([{ role: "user", content: attempt ? `${prompt}\n上次输出无法解析：${previous.slice(0, 800)}。只返回合法JSON。` : prompt }], user.id, "general");
      const json = previous.match(/\{[\s\S]*\}/)?.[0];
      const parsed = requestRouteSchema.safeParse(json ? JSON.parse(json) : null);
      if (!parsed.success) continue;
      if (parsed.data.targetCapabilityId && !capabilities.some((item) => item.id === parsed.data.targetCapabilityId)) continue;
      return parsed.data;
    } catch { /* repair once */ }
  }
  return { mode: "direct", intent: currentRequest.slice(0, 160), targetCapabilityId: null, requiresFreshInformation: false, rationale: "路由器异常时采用安全的直接回答模式" } satisfies WorkbuddyRequestRoute;
}

export function deterministicWorkbuddyRoute(objective: string, hasContext = false): WorkbuddyRequestRoute | null {
  const text = objective.trim();
  if (/^(你好|您好|嗨|hi|hello|在吗|早上好|下午好|晚上好)[呀啊吗!！,.，。\s]*$/i.test(text) || /^(你是谁|你能做什么|介绍一下你自己)[?？。\s]*$/.test(text)) {
    return { mode: "chat", intent: text.slice(0, 160), targetCapabilityId: null, requiresFreshInformation: false, rationale: "属于问候、闲聊或能力介绍" };
  }
  if (/(今天|今日|现在|当前|最近).{0,12}(热点|热搜|热议|选题)|有什么.{0,8}(热点|热搜)/.test(text)) {
    return { mode: "fast-research", intent: text.slice(0, 160), targetCapabilityId: "tool.hot-topic-discovery", requiresFreshInformation: true, rationale: "需要结合热榜与搜索发现当前热点" };
  }
  if (hasContext && /^(总结|概括|润色|改写|翻译|提炼|整理)/.test(text)) {
    return { mode: "direct", intent: text.slice(0, 160), targetCapabilityId: null, requiresFreshInformation: false, rationale: "已有资料足够完成简单处理" };
  }
  if (/^(什么是|什么叫|.+是什么意思|怎么理解|请解释|解释一下)/.test(text) && !/(今天|今日|现在|当前|最近|最新|政策|价格|行情|在任|现任)/.test(text)) {
    return { mode: "direct", intent: text.slice(0, 160), targetCapabilityId: null, requiresFreshInformation: false, rationale: "属于不依赖当前外部信息的简单解释问题" };
  }
  return null;
}

export async function decideWorkbuddyAgentAction(user: SessionUser, input: { objective: string; context?: string; followup?: string; observations: Array<{ capabilityId: string; status: string; summary: string }>; iteration: number; route?: WorkbuddyRequestRoute }) {
  if (needsTrafficTopicSelection(input.observations)) {
    return { type: "ask_user", question: "选题分析已经完成。请选择 1—3 个选题，再进入口播正文创作。", reason: "traffic-topic-selection" } satisfies WorkbuddyAgentAction;
  }
  const completedApplication = [...input.observations].reverse().find((item) => item.status === "success" && item.capabilityId.startsWith("app."));
  if (completedApplication) {
    return { type: "final", content: completedApplication.summary, reason: "专业应用已成功生成本轮产物，直接进入交付，不重复调用" } satisfies WorkbuddyAgentAction;
  }
  if (input.iteration === 1 && input.observations.length === 0 && (input.route?.mode === "chat" || input.route?.mode === "direct")) return {
    type: "final", content: input.route.mode === "chat" ? "请自然、简短地回应用户。" : "请依据用户目标和现有上下文直接给出清楚、可用的回答。", reason: input.route.rationale,
  } satisfies WorkbuddyAgentAction;
  const capabilities = (await listActiveWorkbuddyCapabilities()).filter(item => item.id !== "agent.orchestrator");
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
    const confirmedCapability = capabilities.find((item) => item.id === `app.${confirmedAppSlug}`);
    if (confirmedCapability) return {
      type: "tool_call", capabilityId: confirmedCapability.id,
      instruction: `用户已经在对话中确认“${confirmedCapability.name}”的创作设置。沿用最近对话中已经选择的主题、素材和方向，按已确认参数直接执行；不要重新发现选题或扩大研究范围。`,
      reason: "用户已完成应用参数确认，继续执行当前应用",
    } satisfies WorkbuddyAgentAction;
  }
  const available = capabilities.map(item => ({ id: item.id, name: item.name, description: item.description, kind: item.kind, autoInvoke: item.autoInvoke, riskLevel: item.riskLevel, outputs: item.outputTypes }));
  const now = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "full", timeStyle: "medium" }).format(new Date());
  const prompt = `${buildAgentPolicyPrompt()}

当前北京时间：${now}
用户最终目标：${input.objective}
补充资料：${(input.context || "无").slice(0, 10000)}
本轮追问：${input.followup || "无"}
当前循环：${input.iteration}
入口路由：${input.route ? JSON.stringify(input.route) : "未提供"}
此前工具观察：${JSON.stringify(input.observations).slice(0, 24000)}
可用工具：${JSON.stringify(available)}

每轮只决定一个动作：
- tool_call：只有确实需要工具时调用一个工具。instruction 必须包含该工具本次所需的完整目标和已知约束。
- final：现有信息已经足够且不需要专业应用产物时，直接给用户可用的最终答案。必须综合工具观察，不要只描述过程。
- ask_user：缺少无法安全推断的关键资料，且任何只读工具都无法补足时才询问用户。

行动约束：先保持用户指定的通用、泛财经、家庭财富、保险或交叉领域；不得把纯财经任务强行转成保险。发现“当前大家在讨论什么、热榜上有什么、有哪些实时选题机会”时，优先用 tool.hot-topic-discovery 取得宽泛候选。范围清晰的单一事实、当前状态、简单定义核验或简单比较，优先用 agent.fast-research；它会动态执行 1–3 个并发查询。多跳推理、多主题综合、证据冲突、高风险专业结论或需要形成完整研究报告时，使用 agent.deep-research。用户明确要求的交付物若有名称和用途匹配的专业应用，必须调用该应用，不能由主 Agent 用 final 模拟专业应用产物；只读研究结束或失败后也要重新检查是否应调用专业应用。应用必填信息能从用户消息、上轮候选和工具观察中推断时直接调用，只有缺少会改变交付方向的参数才询问。你应根据目标复杂度和已有观察自主选择或升级，不按关键词硬路由。不要把榜单热度当作事实证据，不要重复没有新增目的的成功调用。最多还可执行 ${Math.max(0, 7 - input.iteration)} 轮。

只输出一个 JSON 对象：tool_call={"type":"tool_call","capabilityId":"...","instruction":"...","searchQueries":["短查询1","短查询2"],"reason":"..."}；final={"type":"final","content":"...","reason":"..."}；ask_user={"type":"ask_user","question":"...","reason":"..."}`;
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
  const available = capabilities.map(item => ({ id: item.id, name: item.name, description: item.description, kind: item.kind, outputs: item.outputTypes, autoInvoke: item.autoInvoke }));
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
