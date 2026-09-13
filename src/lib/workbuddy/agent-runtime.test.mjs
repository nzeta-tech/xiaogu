import assert from "node:assert/strict";
import test from "node:test";
import { runAgentRuntime } from "./agent-runtime.ts";
import { evaluateAgentCase, evaluateAgentSuite } from "./agent-evaluator.ts";
import { evaluateHumanControl, hasExplicitExternalWriteApproval } from "./agent-policies.ts";
import { needsTrafficTopicSelection } from "./traffic-workflow.ts";
import { executionExhaustionMessage } from "./execution-budget.ts";

test("runtime follows observe-decide-act loop and stops on final", async () => {
  const actions = [
    { type: "tool_call", capabilityId: "agent.deep-research", instruction: "核验今天的公开事实", reason: "需要当前证据" },
    { type: "final", content: "这是基于来源的候选方向。", reason: "证据已足够" },
  ];
  let delivered = "";
  const result = await runAgentRuntime({
    maxIterations: 5,
    decide: async ({ iteration }) => actions[iteration - 1],
    control: async () => ({ outcome: "allow" }),
    invoke: async action => ({ capabilityId: action.capabilityId, status: "success", summary: "检索完成" }),
    deliver: async action => { delivered = action.content; },
    askUser: async () => assert.fail("should not ask user"),
  });
  assert.equal(result.status, "completed");
  assert.equal(result.iterations, 2);
  assert.equal(result.observations.length, 1);
  assert.equal(delivered, "这是基于来源的候选方向。");
});

test("runtime starts from concurrently collected prerequisite observations", async () => {
  let decisions = 0;
  const result = await runAgentRuntime({
    maxIterations: 3,
    initialObservations: [
      { capabilityId: "agent.fast-research", status: "success", summary: "定向检索完成" },
      { capabilityId: "tool.hot-topic-discovery", status: "success", summary: "热点发现完成" },
    ],
    decide: async ({ observations }) => {
      decisions += 1;
      assert.equal(observations.length, 2);
      return { type: "final", content: "综合结果", reason: "证据足够" };
    },
    control: async () => ({ outcome: "allow" }),
    invoke: async () => assert.fail("prerequisites must not be invoked again"),
    deliver: async () => {},
    askUser: async () => assert.fail("should not ask user"),
  });
  assert.equal(result.status, "completed");
  assert.equal(decisions, 1);
  assert.equal(result.observations.length, 2);
});

test("slow successful tool gets a finalization grace cycle after duration budget", async () => {
  let delivered = "";
  const traces = [];
  const result = await runAgentRuntime({
    maxIterations: 4,
    budget: { maxDurationMs: 5 },
    decide: async ({ observations }) => observations.length
      ? { type: "final", content: observations[0].summary, reason: "工具已完成" }
      : { type: "tool_call", capabilityId: "app.traffic-copy", instruction: "生成口播", reason: "执行创作" },
    control: async () => ({ outcome: "allow" }),
    invoke: async action => {
      await new Promise(resolve => setTimeout(resolve, 15));
      return { capabilityId: action.capabilityId, status: "success", summary: "完整口播正文" };
    },
    deliver: async action => { delivered = action.content; },
    askUser: async () => assert.fail("should not ask user"),
    trace: async event => { traces.push(event.type); },
  });
  assert.equal(result.status, "completed");
  assert.equal(delivered, "完整口播正文");
  assert.ok(traces.includes("cycle.finalization_grace"));
  assert.ok(!traces.includes("cycle.budget_exhausted"));
});

test("successful result on the last action still gets finalization grace", async () => {
  let delivered = "";
  const result = await runAgentRuntime({
    maxIterations: 1,
    decide: async ({ observations }) => observations.length
      ? { type: "final", content: observations[0].summary, reason: "完成" }
      : { type: "tool_call", capabilityId: "app.traffic-copy", instruction: "生成口播", reason: "创作" },
    control: async () => ({ outcome: "allow" }),
    invoke: async action => ({ capabilityId: action.capabilityId, status: "success", summary: "最后一轮产物" }),
    deliver: async action => { delivered = action.content; },
    askUser: async () => assert.fail("should not ask user"),
  });
  assert.equal(result.status, "completed");
  assert.equal(delivered, "最后一轮产物");
  assert.equal(result.iterations, 2);
});

test("execution exhaustion messages preserve the actual budget reason", () => {
  assert.match(executionExhaustionMessage("duration_limit"), /时间预算/);
  assert.match(executionExhaustionMessage("observation_limit"), /上下文容量/);
  assert.match(executionExhaustionMessage("diminishing_returns"), /没有取得新的有效进展/);
  assert.match(executionExhaustionMessage("iteration_limit"), /最大行动次数/);
});

test("delivery stop gate can block final and return the deficit to the loop", async () => {
  let decisions = 0;
  let delivered = 0;
  const result = await runAgentRuntime({
    maxIterations: 3,
    decide: async () => ++decisions === 1 ? { type: "final", content: "one", reason: "done" } : { type: "final", content: "two", reason: "fixed" },
    control: async () => ({ outcome: "allow" }),
    invoke: async () => ({ capabilityId: "unused", status: "success", summary: "unused" }),
    validateDelivery: async () => decisions === 1 ? { outcome: "continue", reason: "图片交付不完整：要求2张，实际1张" } : { outcome: "allow" },
    deliver: async () => { delivered += 1; },
    askUser: async () => {},
  });
  assert.equal(result.status, "completed");
  assert.equal(decisions, 2);
  assert.equal(delivered, 1);
});

test("runtime stops when the stop gate reports the identical deficit twice", async () => {
  const result = await runAgentRuntime({
    maxIterations: 9,
    decide: async () => ({ type: "final", content: "done", reason: "done" }),
    control: async () => ({ outcome: "allow" }),
    invoke: async () => ({ capabilityId: "unused", status: "success", summary: "unused" }),
    validateDelivery: async () => ({ outcome: "continue", reason: "data:1 缺失" }),
    deliver: async () => assert.fail("should not deliver"),
    askUser: async () => assert.fail("should not ask user"),
  });
  assert.equal(result.status, "failed");
  assert.equal(result.iterations, 2);
  assert.match(result.errorSummary, /已停止重复执行/);
});

test("runtime preserves successful partial output when repair cannot progress", async () => {
  const actions = [
    { type: "tool_call", capabilityId: "app.image-card", instruction: "生成两张", reason: "创作" },
    { type: "final", content: "已生成一张", reason: "检查" },
    { type: "final", content: "已生成一张", reason: "再次检查" },
  ];
  let delivered = false;
  const result = await runAgentRuntime({
    maxIterations: 4,
    decide: async ({ iteration }) => actions[iteration - 1],
    control: async () => ({ outcome: "allow" }),
    invoke: async () => ({ capabilityId: "app.image-card", status: "success", summary: "已生成一张", protocol: { protocolVersion: "workbuddy.v1", observationId: "o1", runId: "r1", stepId: "s1", attempt: 1, status: "partial", retryable: true, preview: "一张", outputs: [{ slotId: "image:1", kind: "image", artifactId: "a1", downloadUrl: "/a1.png" }] } }),
    validateDelivery: async () => ({ outcome: "continue", reason: "image:2 缺失" }),
    deliver: async () => { delivered = true; },
    askUser: async () => {},
  });
  assert.equal(result.status, "completed");
  assert.equal(delivered, true);
  assert.match(result.errorSummary, /部分成果已交付/);
});

test("runtime circuit-breaks a repeated call to the same failed capability", async () => {
  let calls = 0;
  const result = await runAgentRuntime({
    maxIterations: 7,
    decide: async () => ({ type: "tool_call", capabilityId: "app.traffic-copy", instruction: "生成正文", reason: "用户要求生成" }),
    control: async () => ({ outcome: "allow" }),
    invoke: async action => { calls += 1; return { capabilityId: action.capabilityId, status: "error", summary: "原选题作品已经进入正文创作" }; },
    deliver: async () => assert.fail("should not deliver"),
    askUser: async () => assert.fail("should not ask user"),
  });
  assert.equal(result.status, "failed");
  assert.equal(result.errorSummary, "原选题作品已经进入正文创作");
  assert.equal(calls, 1);
});

test("human control pauses interactive and external-write tools", () => {
  const base = { id: "connector.crm", kind: "connector", name: "CRM", description: "CRM", executionMode: "sync", outputTypes: ["data"], autoInvoke: true, buildInput: () => ({}) };
  const action = { type: "tool_call", capabilityId: "connector.crm", instruction: "修改客户状态", reason: "执行跟进" };
  assert.equal(evaluateHumanControl(action, { ...base, riskLevel: "external-write" }).outcome, "ask_user");
  assert.equal(evaluateHumanControl(action, { ...base, riskLevel: "read" }).outcome, "allow");
  assert.equal(evaluateHumanControl(action, { ...base, riskLevel: "generate", autoInvoke: false }).outcome, "ask_user");
});

test("OpenChatCut external write requires a narrow explicit confirmation", () => {
  assert.equal(hasExplicitExternalWriteApproval("确认本次 OpenChatCut 剪辑", "mcp.openchatcut"), true);
  assert.equal(hasExplicitExternalWriteApproval("继续", "mcp.openchatcut"), true);
  assert.equal(hasExplicitExternalWriteApproval("先看看有什么素材", "mcp.openchatcut"), false);
  assert.equal(hasExplicitExternalWriteApproval("确认", "connector.crm"), false);
});

test("deterministic eval catches freshness, scope expansion and insurance promises", () => {
  const suite = evaluateAgentSuite([
    {
      id: "fresh-with-source",
      objective: "今天有哪些保险行业热点",
      currentInformationRequired: true,
      observations: [{ capabilityId: "agent.deep-research", status: "success", summary: "有来源" }],
      action: { type: "final", content: "这里是三个有来源的候选方向。", reason: "研究完成" },
    },
    {
      id: "no-invented-format",
      objective: "看看今天有什么热点",
      action: { type: "tool_call", capabilityId: "app.write-copy", instruction: "生成75秒口播稿", reason: "直接创作" },
    },
  ]);
  assert.equal(suite.results[0].passed, true);
  assert.deepEqual(suite.results[1].violations, ["invented_content_format"]);
  assert.equal(evaluateAgentCase({ id: "promise", objective: "介绍产品", action: { type: "final", content: "保证收益并且一定理赔", reason: "完成" } }).passed, false);
});

test("traffic copy pauses after topic analysis instead of writing immediately", () => {
  assert.equal(needsTrafficTopicSelection([{ capabilityId: "app.traffic-copy:topics", status: "success" }]), true);
  assert.equal(needsTrafficTopicSelection([{ capabilityId: "app.link-remix:topics", status: "success" }]), true);
  assert.equal(needsTrafficTopicSelection([{ capabilityId: "app.traffic-copy", status: "success" }]), false);
});
