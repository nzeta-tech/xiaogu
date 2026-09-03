import assert from "node:assert/strict";
import test from "node:test";
import { runAgentRuntime } from "./agent-runtime.ts";
import { evaluateAgentCase, evaluateAgentSuite } from "./agent-evaluator.ts";
import { evaluateHumanControl } from "./agent-policies.ts";
import { needsTrafficTopicSelection } from "./traffic-workflow.ts";

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

test("human control pauses interactive and external-write tools", () => {
  const base = { id: "connector.crm", kind: "connector", name: "CRM", description: "CRM", executionMode: "sync", outputTypes: ["data"], autoInvoke: true, buildInput: () => ({}) };
  const action = { type: "tool_call", capabilityId: "connector.crm", instruction: "修改客户状态", reason: "执行跟进" };
  assert.equal(evaluateHumanControl(action, { ...base, riskLevel: "external-write" }).outcome, "ask_user");
  assert.equal(evaluateHumanControl(action, { ...base, riskLevel: "read" }).outcome, "allow");
  assert.equal(evaluateHumanControl(action, { ...base, riskLevel: "generate", autoInvoke: false }).outcome, "ask_user");
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
  assert.equal(needsTrafficTopicSelection([{ capabilityId: "app.traffic-copy", status: "success" }]), false);
});
