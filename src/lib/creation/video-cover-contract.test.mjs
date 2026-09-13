import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { assertVideoCoverMaterial, deriveVideoCoverHeadline, renderVideoCoverHeadline, renderVideoCoverHeadlines } from "./video-cover-contract.ts";

test("derives a bounded headline from actual copy", () => {
  assert.equal(deriveVideoCoverHeadline("40年房贷，不只是把月供变小。\n真正被拉长的是家庭风险。"), "40年房贷");
  assert.equal(deriveVideoCoverHeadline("## “提前退休”最容易算错的一笔账：不是攒够多少钱 · 李璞IFA · V1版\n正文"), "提前退休最容易算错的一笔账");
});

test("rejects harness instructions as video-cover source", () => {
  const source = "交付门禁：image-card 应交付 1 个 image 成果。\n\n请基于刚完成的产物继续处理。";
  assert.equal(deriveVideoCoverHeadline(source), "");
  assert.throws(() => assertVideoCoverMaterial(source), /缺少可用的正文素材/);
});

test("renders a deterministic title layer onto a generated cover", async () => {
  const blank = await sharp({ create: { width: 540, height: 960, channels: 3, background: "#eee8dc" } }).jpeg().toBuffer();
  const [rendered] = await renderVideoCoverHeadline([{ id: "cover", url: `data:image/jpeg;base64,${blank.toString("base64")}` }], "40年房贷");
  const output = Buffer.from(rendered.url.slice(rendered.url.indexOf(",") + 1), "base64");
  assert.ok(output.length > blank.length);
  assert.deepEqual(await sharp(output).metadata().then(({ width, height }) => ({ width, height })), { width: 540, height: 960 });
});

test("renders a different deterministic headline for every source cover", async () => {
  const blank = await sharp({ create: { width: 480, height: 800, channels: 3, background: "#dfe7e4" } }).jpeg().toBuffer();
  const images = [1, 2].map(index => ({ id: `image-${index}`, url: `data:image/jpeg;base64,${blank.toString("base64")}` }));
  const rendered = await renderVideoCoverHeadlines(images, ["提前退休先算缺口", "家庭不靠一份工资"]);
  assert.equal(rendered.length, 2);
  assert.notEqual(rendered[0].url, images[0].url);
  assert.notEqual(rendered[1].url, images[1].url);
  assert.notEqual(rendered[0].url, rendered[1].url);
});
