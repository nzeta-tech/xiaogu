import assert from "node:assert/strict";
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
