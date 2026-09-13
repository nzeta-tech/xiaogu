import assert from "node:assert/strict";
import test from "node:test";
import { compileWorkbuddyContext, inferExpectedOutputCount, projectExplicitSelection } from "./context-compiler.ts";

test("referential creation keeps the latest delivery as the focused context", () => {
  const compiled = compileWorkbuddyContext({
    currentRequest: "用这个写一篇口播文案",
    messages: [
      { role: "assistant", message_type: "delivery", content: "## 铁头一审获刑8年\n法院已经一审宣判，维权与敲诈的边界是本次核心。" },
      { role: "user", message_type: "followup", content: "用这个写一篇口播文案" },
    ],
    discoveryPoolContext: "1. 无关热点\n2. 另一个无关热点",
  });
  assert.equal(compiled.focus?.title, "铁头一审获刑8年");
  assert.match(compiled.prompt, /当前焦点｜必须优先承接/);
  assert.doesNotMatch(compiled.prompt, /另一个无关热点/);
});

test("multi-deliverable requests persist a deterministic acceptance count", () => {
  const compiled = compileWorkbuddyContext({
    currentRequest: "这两个例子帮我分别做一张知识图片",
    messages: [{ role: "assistant", message_type: "delivery", content: "## 例子一\n正文一\n\n## 例子二\n正文二" }],
  });
  assert.equal(compiled.expectedOutputs, 2);
  assert.match(compiled.prompt, /期望独立交付数量：2/);
  assert.equal(inferExpectedOutputCount("请生成3张图片"), 3);
});

test("hot-topic exploration loads the discovery pool on demand", () => {
  const compiled = compileWorkbuddyContext({ currentRequest: "还有其他热点吗", messages: [], discoveryPoolContext: "候选池内容" });
  assert.equal(compiled.includeDiscoveryPool, true);
  assert.match(compiled.prompt, /候选池内容/);
});

test("ordinal creation projects only the selected numbered topic", () => {
  const source = `今天值得讨论 2 个热点。\n\n### 1. 40年房贷\n房贷正文素材。\n\n---\n\n### 2. 养老院收费\n养老院正文素材。`;
  const selected = projectExplicitSelection("用第一个帮我写一篇口播文案", source);
  assert.match(selected, /40年房贷/);
  assert.doesNotMatch(selected, /养老院/);
  const compiled = compileWorkbuddyContext({
    currentRequest: "用第一个帮我写一篇口播文案",
    messages: [{ role: "assistant", message_type: "delivery", content: source }],
  });
  assert.equal(compiled.focus?.content, selected);
  assert.doesNotMatch(compiled.prompt, /养老院正文素材/);
});

test("a vague formatting follow-up still carries the latest usable artifact", () => {
  const compiled = compileWorkbuddyContext({
    currentRequest: "帮我整理成可以一键复制发布的格式",
    latestArtifact: "# 40年房贷\n这是一篇已经完成并确认的小红书正文。",
    messages: [],
  });
  assert.match(compiled.prompt, /最近可用成果/);
  assert.match(compiled.prompt, /40年房贷/);
});

test("a natural reference prefers the latest visible result over an older artifact", () => {
  const compiled = compileWorkbuddyContext({
    currentRequest: "用这个热点帮我写一篇社区笔记",
    latestArtifact: "更早的40年房贷作品",
    messages: [{ role: "assistant", message_type: "delivery", content: "最新讨论的是黄金首饰与黄金配置的区别。" }],
  });
  assert.match(compiled.focus?.content ?? "", /黄金首饰/);
  assert.doesNotMatch(compiled.focus?.content ?? "", /40年房贷/);
});

test("a generic creation command transforms the latest visible delivery, not an older app artifact", () => {
  const result = compileWorkbuddyContext({
    currentRequest: "帮我制作一张知识图片",
    messages: [
      { role: "assistant", message_type: "delivery", content: "今年外滩大会最值得关注的是智能体从生成走向执行，以及 AI 新经济的真实落地。" },
    ],
    latestArtifact: "基于已核验的今天天气信息制作一张知识图片",
  });
  assert.equal(result.focus?.content, "今年外滩大会最值得关注的是智能体从生成走向执行，以及 AI 新经济的真实落地。");
  assert.doesNotMatch(result.prompt, /今天天气/);
});

test("topic switches keep the immediately preceding delivery as the only implicit creation source", () => {
  const result = compileWorkbuddyContext({
    currentRequest: "帮我制作一张知识图片",
    messages: [
      { role: "user", content: "帮我生成一张今天天气预报的图片" },
      { role: "assistant", message_type: "delivery", content: "今日天气为阵雨，气温13到20摄氏度。" },
      { role: "user", content: "今年就业形势如何" },
      { role: "assistant", message_type: "delivery", content: "今年就业总量稳定，但行业和技能之间的结构分化明显。" },
      { role: "user", content: "今年外滩大会有什么看点" },
      { role: "assistant", message_type: "delivery", content: "今年外滩大会聚焦智能体从生成走向执行，以及人工智能进入企业流程和真实经济活动。" },
    ],
    latestArtifact: "今日天气知识卡片",
    pendingInstruction: "",
    pendingSource: "",
  });
  assert.match(result.focus?.content ?? "", /外滩大会/);
  assert.doesNotMatch(result.focus?.content ?? "", /天气|就业/);
});
