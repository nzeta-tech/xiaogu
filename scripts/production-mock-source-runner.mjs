#!/usr/bin/env node
/**
 * Deterministic production contract check for the Local Agent task protocol.
 *
 * It deliberately does not fetch a third-party source: a disposable user queues a
 * normal source.inspect task, then this runner acts as a short-lived authenticated
 * Agent and drives the task through lease, event, completion, user result, and SSE.
 * The real-source runner remains available for scheduled dependency monitoring.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [repoPath, releaseSha, baseUrl, agentEnvPath] = process.argv.slice(2);
void repoPath;
void releaseSha;

if (!baseUrl || !agentEnvPath) {
  throw new Error("Usage: production-mock-source-runner.mjs <repo-path> <release-sha> <base-url> <production-agent-env>");
}

const base = new URL(baseUrl).origin;
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const email = `xiaogu-release-mock-${suffix}@example.invalid`;
const password = `Release-${crypto.randomUUID()}-A1`;
const agentId = `xiaogu-release-mock-${suffix}`;
const fixtureUrl = "https://www.douyin.com/video/7123456789012345678";
let cookie = "";

function redactError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replaceAll(base, "<base-url>").slice(0, 500);
}

async function readAgentToken(path) {
  const contents = await readFile(path, "utf8");
  const line = contents.split(/\r?\n/).find((value) => value.startsWith("LOCAL_AGENT_TOKEN="));
  const token = line?.slice("LOCAL_AGENT_TOKEN=".length).trim().replace(/^['"]|['"]$/g, "");
  if (!token) throw new Error("LOCAL_AGENT_TOKEN is missing from production agent env");
  return token;
}

function userHeaders(extra = {}) {
  return { accept: "application/json", ...(cookie ? { cookie } : {}), ...extra };
}

async function json(path, init = {}, headers = userHeaders(init.headers)) {
  const response = await fetch(`${base}${path}`, { ...init, headers });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function register() {
  const { response, payload } = await json("/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.83" },
    body: JSON.stringify({ name: "发布 Mock 回归", email, password, acceptedTerms: true }),
  });
  if (!response.ok) throw new Error(`temporary regression registration failed (${response.status}): ${String(payload.error ?? "unknown")}`);
  const cookies = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [response.headers.get("set-cookie") ?? ""];
  cookie = cookies.map((value) => value.split(";")[0]).filter(Boolean).join("; ");
  if (!cookie) throw new Error("temporary regression registration did not establish a session");
}

async function agentJson(token, path, body) {
  const { response, payload } = await json(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }, { accept: "application/json", authorization: `Bearer ${token}` });
  if (!response.ok) throw new Error(`agent endpoint ${path} failed (${response.status}): ${String(payload.error ?? "unknown")}`);
  return payload;
}

async function readEvents(taskId) {
  const response = await fetch(`${base}/api/creation/link-remix/inspect/${encodeURIComponent(taskId)}/events?after=0`, { headers: userHeaders() });
  if (!response.ok) throw new Error(`SSE endpoint failed (${response.status})`);
  const raw = await response.text();
  const events = raw.split("\n\n").filter(Boolean);
  const deltas = events.filter((event) => /"type":"delta"/.test(event));
  const done = events.some((event) => /^event: done$/m.test(event));
  return { deltas: deltas.length, done };
}

try {
  const agentToken = await readAgentToken(agentEnvPath);
  await register();
  const { response: inspectResponse, payload: inspect } = await json("/api/creation/link-remix/inspect", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: fixtureUrl }),
  });
  if (inspectResponse.status !== 202 || typeof inspect.taskId !== "string") {
    throw new Error(`mock source inspection did not queue a task (${inspectResponse.status})`);
  }

  const leased = await agentJson(agentToken, "/api/internal/local-agent/tasks/lease", {
    agentId,
    capabilities: ["source.inspect"],
    leaseSeconds: 60,
    protocolVersion: 1,
  });
  if (leased.task?.id !== inspect.taskId || typeof leased.leaseToken !== "string") {
    throw new Error("mock source task was not available for deterministic lease");
  }
  const taskId = inspect.taskId;
  const leaseToken = leased.leaseToken;
  await agentJson(agentToken, `/api/internal/local-agent/tasks/${encodeURIComponent(taskId)}/events`, {
    agentId, leaseToken, eventType: "status", payload: { message: "Mock Agent 正在校验任务协议。" },
  });
  await agentJson(agentToken, `/api/internal/local-agent/tasks/${encodeURIComponent(taskId)}/events`, {
    agentId, leaseToken, eventType: "delta", payload: { content: "这是一条确定性的发布回归转写片段。" },
  });
  const result = {
    status: "succeeded",
    finalUrl: fixtureUrl,
    fields: {
      source_type: "douyin",
      source_title: "发布 Mock 回归样本",
      source_author: "xiaogu-release",
      source_transcript: "这是一条确定性的发布回归转写片段。",
    },
    note: "Mock regression fixture; no external media was requested.",
  };
  await agentJson(agentToken, `/api/internal/local-agent/tasks/${encodeURIComponent(taskId)}/complete`, { agentId, leaseToken, result });

  const { response: taskResponse, payload: task } = await json(`/api/creation/link-remix/inspect/${encodeURIComponent(taskId)}`);
  if (!taskResponse.ok) throw new Error(`task status endpoint failed (${taskResponse.status})`);
  assert.equal(task.status, "succeeded", "mock task did not complete");
  assert.equal(task.result?.fields?.source_transcript, result.fields.source_transcript, "persisted transcript differs from Agent result");
  assert(!task.result?.mediaUrl && !task.result?.mediaDecryptKey, "sensitive media fields leaked in task result");
  const events = await readEvents(taskId);
  assert(events.deltas > 0, "task emitted no SSE transcript delta");
  assert(events.done, "task SSE stream did not finish with done");
  console.log(JSON.stringify({ taskId, status: "succeeded", sseDeltas: events.deltas, assertions: 8, externalSourceRequested: false }));
} catch (error) {
  console.error(JSON.stringify({ status: "failed", error: redactError(error) }));
  process.exitCode = 1;
}
