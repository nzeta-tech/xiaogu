import test from "node:test";
import assert from "node:assert/strict";
import { creationApps } from "../apps/catalog.ts";
import { contractForCreationApp, isAppClarificationResponse, normalizeAppDeliverables, previewDeliverableContent } from "./app-execution-contract.ts";
import { buildCapabilitySourceText } from "./capability-material.ts";

test("every creation app has an executable output contract", () => {
  for (const app of creationApps) {
    const contract = contractForCreationApp(app);
    assert.equal(contract.appSlug, app.slug);
    assert.ok(["text", "image", "presentation", "video", "data"].includes(contract.outputKind));
    assert.ok(contract.defaultCount >= 1);
  }
});

test("text adapter flattens every publishable item from output batches", () => {
  const contract = contractForCreationApp({ slug: "write-copy", resultType: "text" });
  const items = normalizeAppDeliverables({ contract, contentJson: { batches: [
    { label: "口播", items: [{ id: "s1", title: "口播1", body: "正文1" }, { id: "s2", title: "口播2", body: "正文2" }] },
    { label: "朋友圈", items: [{ id: "m1", title: "朋友圈1", body: "正文3" }] },
  ] } });
  assert.equal(items.length, 3);
  assert.deepEqual(items.map(item => item.id), ["s1", "s2", "m1"]);
});

test("all image apps normalize image arrays", () => {
  for (const app of creationApps.filter(item => item.resultType === "image")) {
    const contract = contractForCreationApp(app);
    const items = normalizeAppDeliverables({ contract, contentJson: { images: [{ id: "i1", url: "https://example.com/1.webp" }] } });
    assert.equal(items.length, 1, app.slug);
    assert.equal(items[0].kind, "image");
  }
});

test("presentation adapter accepts downloadable files and editor result URLs", () => {
  const contract = contractForCreationApp({ slug: "ppt-maker", resultType: "presentation" });
  assert.equal(normalizeAppDeliverables({ contract, contentJson: { files: [{ filename: "deck.pptx", downloadUrl: "/api/ppt/1/download" }] } }).length, 1);
  assert.equal(normalizeAppDeliverables({ contract, resultUrl: "/ppt-maker" }).length, 1);
});

test("data adapter treats an aggregate research response as one completed result", () => {
  const contract = { appSlug: "tool.hot-topic-discovery", outputKind: "data", artifactMode: "collection", defaultCount: 1, retryStrategy: "retry-whole" };
  const items = normalizeAppDeliverables({ contract, content: "已取得并核验 12 个实时热点候选。", contentJson: { sources: [{ title: "榜单" }] } });
  assert.equal(items.length, 1);
  assert.equal(items[0].kind, "data");
  assert.equal(items[0].content, "已取得并核验 12 个实时热点候选。");
});

test("referential app creation uses the prior visible result rather than planner instruction", () => {
  const source = buildCapabilitySourceText({ objective: "基于已讨论内容执行目标应用", context: "内部上下文", previousArtifact: "《早春晴朗》的五个真实观点", followup: "帮我写一篇口播文案" });
  assert.match(source, /^【承接素材】/);
  assert.match(source, /《早春晴朗》的五个真实观点/);
  assert.doesNotMatch(source, /基于已讨论内容执行目标应用/);
});

test("wechat images defaults to four but explicit context can override later", () => {
  const contract = contractForCreationApp({ slug: "wechat-images", resultType: "image" });
  assert.equal(contract.defaultCount, 4);
  assert.equal(contract.retryStrategy, "retry-missing");
});

test("binary image payloads never enter agent observation previews", () => {
  assert.equal(previewDeliverableContent({ kind: "image", title: "头图", content: "data:image/jpeg;base64,/9j/very-long-binary" }), "[image binary omitted] 头图");
  assert.equal(previewDeliverableContent({ kind: "text", title: "正文", content: "可读正文" }), "可读正文");
});

test("a missing-material question is not accepted as an app deliverable", () => {
  assert.equal(isAppClarificationResponse("请把这次的**话题素材或原文**发我，我再继续创作。"), true);
  assert.equal(isAppClarificationResponse("这是基于话题素材生成的完整小红书正文，包含标题、正文和标签。"), false);
});
