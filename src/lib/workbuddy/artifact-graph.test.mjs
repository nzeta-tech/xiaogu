import test from "node:test";
import assert from "node:assert/strict";
import { buildArtifactGraph, resolveArtifactReferences } from "./artifact-graph.ts";

test("resolves two structured scripts as two independent artifact references", () => {
  const graph = buildArtifactGraph([{
    id: "delivery-1", artifact_type: "delivery", title: "两篇口播", content: "合并展示",
    content_json: { contentJson: { scripts: [{ title: "案例A", content: "A正文" }, { title: "案例B", content: "B正文" }] } },
    created_at: "2026-09-12T00:00:00Z",
  }]);
  const resolved = resolveArtifactReferences("这两个例子分别做一张知识图片", graph);
  assert.equal(resolved.nodes.length, 2);
  assert.deepEqual(resolved.nodes.map(item => item.content), ["A正文", "B正文"]);
});

test("does not inject artifacts for a new unrelated request", () => {
  const graph = buildArtifactGraph([{ id: "a", artifact_type: "text", title: "旧稿", content: "旧内容", created_at: "2026-09-12T00:00:00Z" }]);
  assert.equal(resolveArtifactReferences("今天有什么热点", graph).nodes.length, 0);
});

test("forward-pointing inline material does not inherit previous artifacts", () => {
  const graph = buildArtifactGraph([
    { id: "old-1", artifact_type: "text", title: "旧成果一", content: "旧内容一", created_at: "2026-09-12T00:00:00Z" },
    { id: "old-2", artifact_type: "text", title: "旧成果二", content: "旧内容二", created_at: "2026-09-12T00:00:01Z" },
  ]);
  const resolved = resolveArtifactReferences("把下面两个例子分别做成图片：例子一，早睡；例子二，陪伴家人。", graph);
  assert.equal(resolved.referential, false);
  assert.equal(resolved.requestedCount, 2);
  assert.deepEqual(resolved.nodes, []);
});

test("legacy combined delivery is projected into heading-delimited children", () => {
  const graph = buildArtifactGraph([{ id: "old", artifact_type: "delivery", title: "旧交付", content: "## 口播一：案例A\n这是第一篇很长的正文内容。\n\n## 口播二：案例B\n这是第二篇很长的正文内容。", created_at: "2026-09-12T00:00:00Z" }]);
  const resolved = resolveArtifactReferences("把这两篇分别做成图片", graph);
  assert.equal(resolved.nodes.length, 2);
  assert.match(resolved.nodes[0].content, /案例A/);
  assert.match(resolved.nodes[1].content, /案例B/);
});

test("subjectless cross-format follow-up walks through a media result to its semantic source", () => {
  const graph = buildArtifactGraph([
    { id: "bund", artifact_type: "delivery", title: "外滩大会", content: "今年外滩大会聚焦智能体从生成走向执行，以及人工智能进入企业流程和真实经济活动。这里是完整的大会看点分析与事实素材。", content_json: {}, created_at: "2026-09-13T01:00:00Z" },
    { id: "image", artifact_type: "app-output", title: "知识图片", content: "https://example.com/bund.png", content_json: { derivedFromArtifactIds: ["bund"] }, created_at: "2026-09-13T02:00:00Z" },
    { id: "receipt", artifact_type: "delivery", title: "图片交付", content: "已成功生成 1 张知识图片。", content_json: { sourceArtifactId: "image", derivedFromArtifactIds: ["bund"] }, created_at: "2026-09-13T02:00:01Z" },
  ]);
  const resolved = resolveArtifactReferences("再帮我写一篇小红书", graph);
  assert.equal(resolved.nodes.length, 1);
  assert.equal(resolved.nodes[0].id, "bund");
  assert.match(resolved.nodes[0].content, /外滩大会/);
});

test("an explicit reference to topic material also walks past a media receipt", () => {
  const graph = buildArtifactGraph([
    { id: "research", artifact_type: "delivery", title: "提前退休素材", content: "年轻人规划提前退休的核心动因包括职业不确定性、对生活自主权的追求，以及更早建立储蓄和长期投资纪律。这里是完整研究素材。", content_json: {}, created_at: "2026-09-13T01:00:00Z" },
    { id: "image", artifact_type: "app-output", title: "知识卡片", content: "https://example.com/retire.png", content_json: { derivedFromArtifactIds: ["research"] }, created_at: "2026-09-13T02:00:00Z" },
    { id: "receipt", artifact_type: "delivery", title: "图片交付", content: "已按插画风格生成 1 张 3:4 图片。", content_json: { sourceArtifactId: "image", derivedFromArtifactIds: ["research"] }, created_at: "2026-09-13T02:00:01Z" },
  ]);
  const resolved = resolveArtifactReferences("再用这个话题素材帮我写一篇小红书", graph);
  assert.equal(resolved.nodes[0]?.id, "research");
  assert.match(resolved.nodes[0]?.content ?? "", /提前退休/);
});

test("an unrelated explicit topic does not inherit artifact lineage", () => {
  const graph = buildArtifactGraph([{ id: "bund", artifact_type: "delivery", title: "外滩大会", content: "外滩大会的完整内容素材超过八十个字符，用来验证显式新主题不会错误继承此前成果。这里继续补足测试正文长度。", content_json: {}, created_at: "2026-09-13T01:00:00Z" }]);
  assert.deepEqual(resolveArtifactReferences("写一篇关于养老规划的小红书", graph).nodes, []);
});

test("an ordinal selects one item from the latest visible list instead of counting historical artifacts", () => {
  const graph = buildArtifactGraph([
    { id: "old-1", artifact_type: "delivery", title: "旧话题", content: "第一份旧内容", content_json: {}, created_at: "2026-09-13T01:00:00Z" },
    { id: "old-2", artifact_type: "delivery", title: "旧话题", content: "第二份旧内容", content_json: {}, created_at: "2026-09-13T02:00:00Z" },
    { id: "latest", artifact_type: "delivery", title: "最新列表", content: "1. 新闻一\n2. 新闻二\n3. 新闻三\n4. 敬一丹退休", content_json: {}, created_at: "2026-09-13T03:00:00Z" },
  ]);
  const resolved = resolveArtifactReferences("用第四个帮我写一篇口播文案", graph);
  assert.equal(resolved.referential, true);
  assert.equal(resolved.requestedCount, null);
  assert.deepEqual(resolved.nodes, []);
});
