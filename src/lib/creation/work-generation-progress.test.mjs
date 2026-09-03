import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  readGenerationProgress,
  resolveGenerationProgress,
  shouldPollWorkGeneration,
  TRAFFIC_COPY_INITIAL_PROGRESS,
} from "./work-generation-progress.ts";

test("a running traffic work has an immediate visible first stage", () => {
  assert.deepEqual(resolveGenerationProgress({
    platform: "traffic-copy",
    status: "running",
    persisted: [],
    live: [],
  }), [TRAFFIC_COPY_INITIAL_PROGRESS]);
});

test("persisted progress survives refresh and live progress wins by phase", () => {
  const persisted = readGenerationProgress({ generationProgress: [
    { phase: "task_started", status: "completed", label: "任务准备完成", detail: "已准备" },
    { phase: "source_understanding", status: "active", label: "正在理解素材" },
    { phase: 123, status: "active", label: "非法事件" },
  ] });
  const resolved = resolveGenerationProgress({
    platform: "traffic-copy",
    status: "running",
    persisted,
    live: [{ phase: "source_understanding", status: "completed", label: "素材理解完成", detail: "已完成" }],
  });
  assert.equal(resolved.length, 2);
  assert.equal(resolved[1].status, "completed");
  assert.equal(resolved[1].label, "素材理解完成");
});

test("research follow-up stages stay visible while material and angle model calls run", () => {
  const resolved = resolveGenerationProgress({
    platform: "traffic-copy",
    status: "running",
    persisted: [
      { phase: "fast_research", status: "completed", label: "资料核验完成", detail: "已核验" },
    ],
    live: [
      { phase: "material_synthesis", status: "completed", label: "创作材料整理完成", detail: "已整理" },
      { phase: "angle_refinement", status: "active", label: "正在确定核心切入角度", detail: "正在确认主线" },
    ],
  });

  assert.deepEqual(resolved.map((item) => [item.phase, item.status]), [
    ["fast_research", "completed"],
    ["material_synthesis", "completed"],
    ["angle_refinement", "active"],
  ]);
});

test("creation prepare and background startup never reconcile the full catalog", () => {
  const prepareSource = readFileSync(new URL("../../app/api/creation/apps/[slug]/prepare/route.ts", import.meta.url), "utf8");
  const executionSource = readFileSync(new URL("./execute-app-run.ts", import.meta.url), "utf8");
  assert.doesNotMatch(prepareSource, /trySyncCreationCatalog/);
  assert.doesNotMatch(executionSource, /trySyncCreationCatalog/);
  assert.match(prepareSource, /tryCreateWork/);
  assert.match(prepareSource, /waitForBackgroundWorkRunStart/);
});

test("completed work no longer shows a synthetic generation stage", () => {
  assert.deepEqual(resolveGenerationProgress({
    platform: "traffic-copy",
    status: "succeeded",
    persisted: [],
    live: [],
  }), []);
});

test("polling is only a disconnected or stale streaming fallback", () => {
  const base = {
    status: "running",
    platform: "traffic-copy",
    supportsStreaming: true,
    streamConnected: true,
    streamError: "",
    lastProgressAt: 10_000,
    now: 15_000,
  };
  assert.equal(shouldPollWorkGeneration(base), false);
  assert.equal(shouldPollWorkGeneration({ ...base, now: 22_000 }), true);
  assert.equal(shouldPollWorkGeneration({ ...base, streamConnected: false }), true);
  assert.equal(shouldPollWorkGeneration({ ...base, platform: "write-copy" }), false);
  assert.equal(shouldPollWorkGeneration({ ...base, supportsStreaming: false }), true);
  assert.equal(shouldPollWorkGeneration({ ...base, status: "succeeded", hasResult: true }), false);
});

test("a completed work briefly polls again when its persisted result has not arrived", () => {
  const base = {
    status: "succeeded",
    platform: "traffic-copy",
    supportsStreaming: true,
    streamConnected: false,
    streamError: "",
    lastProgressAt: 0,
    now: 20_000,
    hasResult: false,
    completedRecoveryAttempts: 0,
  };
  assert.equal(shouldPollWorkGeneration(base), true);
  assert.equal(shouldPollWorkGeneration({ ...base, hasResult: true }), false);
  assert.equal(shouldPollWorkGeneration({ ...base, completedRecoveryAttempts: 5 }), false);
  assert.equal(shouldPollWorkGeneration({ ...base, status: "failed" }), false);
});
