import test from "node:test";
import assert from "node:assert/strict";
import { buildDeliverableContract, inspectDeliverables } from "./deliverable-contract.ts";

test("two separate images form a hard completion contract", () => {
  const contract = buildDeliverableContract({ request: "这两个例子帮我分别做一张知识图片", expectedOutputs: 2, sourceArtifactIds: ["a", "b"] });
  assert.deepEqual(contract, { kind: "image", expectedCount: 2, independent: true, sourceArtifactIds: ["a", "b"] });
  assert.equal(inspectDeliverables(contract, { contentJson: { images: [{ url: "a.webp" }] } }).complete, false);
  assert.equal(inspectDeliverables(contract, { contentJson: { images: [{ url: "a.webp" }, { url: "b.webp" }] } }).complete, true);
});

test("single text delivery remains compatible", () => {
  const contract = buildDeliverableContract({ request: "用这个写一篇口播文案" });
  assert.equal(inspectDeliverables(contract, { content: "口播正文" }).complete, true);
});
