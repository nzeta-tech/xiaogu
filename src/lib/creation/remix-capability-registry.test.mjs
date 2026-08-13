import assert from "node:assert/strict";
import test from "node:test";

import { getCreationAppBySlug } from "../apps/catalog.ts";
import {
  adaptRemixCapabilityInput,
  buildPendingRemixContentJson,
  getRemixCapabilityDefaults,
  getRemixCapabilityDefinition,
  getRemixCapabilitySettings,
  getRemixResultMeta,
} from "./remix-capability-registry.ts";
import { buildRemixStudioSource } from "./remix-studio-source.ts";

const cases = [
  ["traffic-copy", "traffic-copy", ["tone"]],
  ["wechat-studio", "wechat-studio", ["audience", "tone", "lengthMode"]],
  ["xiaohongshu-studio", "xiaohongshu-studio", ["length_mode"]],
  ["moments", "write-copy", ["tone"]],
];

test("every remix target reuses fields from its formal creation app", () => {
  for (const [capability, appSlug, fieldIds] of cases) {
    const app = getCreationAppBySlug(appSlug);
    assert.ok(app, `missing target app ${appSlug}`);
    const fields = getRemixCapabilitySettings(capability);
    assert.deepEqual(fields.map((field) => field.id), fieldIds);
    for (const field of fields) {
      assert.equal(field, app.fields.find((candidate) => candidate.id === field.id));
    }
  }
});

test("capability defaults and locked values match the formal app contract", () => {
  assert.deepEqual(getRemixCapabilityDefaults("traffic-copy"), {
    tone: "default",
    creator_skill_version_ids: ["default"],
  });
  assert.deepEqual(getRemixCapabilityDefaults("wechat-studio"), {
    audience: "young-family",
    tone: "professional",
    lengthMode: "minimal",
  });
  assert.deepEqual(getRemixCapabilityDefaults("xiaohongshu-studio"), {
    length_mode: "standard",
    creation_mode: "rewrite",
  });
  assert.deepEqual(getRemixCapabilityDefaults("moments"), {
    tone: "self",
    targets: ["moments"],
  });
});

test("adapter only forwards target fields and enforces hidden target values", () => {
  assert.deepEqual(adaptRemixCapabilityInput("xiaohongshu-studio", {
    length_mode: "long",
    creation_mode: "original",
    tone: "stale-value-from-another-target",
  }, "source material"), {
    length_mode: "long",
    creation_mode: "rewrite",
    topic: "source material",
  });
  assert.deepEqual(adaptRemixCapabilityInput("moments", {
    tone: "professional",
    targets: ["wechat"],
  }, "source material"), {
    tone: "professional",
    targets: ["moments"],
    source: "source material",
  });
});

test("result view metadata is owned by the same capability definition", () => {
  for (const [capability, appSlug] of cases) {
    const definition = getRemixCapabilityDefinition(capability);
    assert.equal(definition.appSlug, appSlug);
    assert.equal(getRemixResultMeta(capability), definition.result);
  }
});

test("studio source restores parsed body and the creator's added thought", () => {
  assert.equal(buildRemixStudioSource({
    source_title: "参考标题",
    source_text: "公众号原始正文",
    source_evidence: "明确事实",
    remix_angle: "加入我的客户沟通经验",
  }), "公众号原始正文\n\n事实证据摘要：明确事实\n\n我的补充想法：加入我的客户沟通经验");
  assert.equal(buildRemixStudioSource({
    source_title: "视频标题",
    source_transcript: "视频口播转写",
  }), "视频口播转写");
});

test("pending studio snapshot keeps the selected step and original material before the run attaches", () => {
  const xhs = buildPendingRemixContentJson({
    remix_target: "xiaohongshu-studio",
    source_transcript: "原视频口播",
    remix_angle: "我的补充判断",
    length_mode: "long",
  });
  assert.equal(xhs.effectiveAppSlug, "xiaohongshu-studio");
  assert.equal(xhs.xiaohongshuStudioState.tab, "note");
  assert.equal(xhs.xiaohongshuStudioState.generationPending, true);
  assert.match(xhs.xiaohongshuStudioState.topic, /原视频口播/);
  assert.match(xhs.xiaohongshuStudioState.topic, /我的补充判断/);
});
