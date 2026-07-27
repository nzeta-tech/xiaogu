import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const remoteBase = required("LOCAL_AGENT_BASE_URL").replace(/\/$/, "");
const executorBase = (process.env.LOCAL_AGENT_EXECUTOR_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const token = required("LOCAL_AGENT_TOKEN");
const agentId = process.env.LOCAL_AGENT_ID?.trim() || `${os.hostname()}-${process.pid}`;
const pollIntervalMs = boundedNumber("LOCAL_AGENT_POLL_INTERVAL_MS", 3000, 500, 60000);
const leaseSeconds = boundedNumber("LOCAL_AGENT_LEASE_SECONDS", 600, 60, 1800);
const capabilities = (process.env.LOCAL_AGENT_CAPABILITIES || "source.inspect").split(",").map((value) => value.trim()).filter(Boolean);
const heartbeatIntervalMs = boundedNumber("LOCAL_AGENT_HEARTBEAT_INTERVAL_MS", 15000, 5000, 60000);
const transcriptBatchMs = boundedNumber("LOCAL_AGENT_TRANSCRIPT_BATCH_MS", 400, 300, 1000);
const protocolVersion = boundedNumber("LOCAL_AGENT_PROTOCOL_VERSION", 1, 1, 1000);
const readyFile = process.env.LOCAL_AGENT_READY_FILE || "/tmp/local-agent.ready";
let activeTaskCount = 0;
let stopping = false;
let readyForTasks = false;

await waitForExecutor();
await sendPresenceHeartbeat().catch((error) => console.error(`[local-agent] initial presence heartbeat failed: ${messageOf(error)}`));
const presenceTimer = setInterval(() => sendPresenceHeartbeat().catch((error) => console.error(`[local-agent] presence heartbeat failed: ${messageOf(error)}`)), heartbeatIntervalMs);
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    stopping = true;
    clearInterval(presenceTimer);
    sendPresenceHeartbeat("offline").finally(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
console.log(`[local-agent] ${agentId} polling ${remoteBase} with capabilities: ${capabilities.join(", ")}`);

while (!stopping) {
  try {
    const leased = await remote("/api/internal/local-agent/tasks/lease", {
      agentId, capabilities: readyForTasks ? capabilities : [], leaseSeconds, protocolVersion,
    });
    if (!leased.task) {
      await delay(pollIntervalMs);
      continue;
    }
    await executeLeasedTask(leased.task, leased.leaseToken);
  } catch (error) {
    console.error(`[local-agent] polling failed: ${messageOf(error)}`);
    await delay(Math.max(pollIntervalMs, 5000));
  }
}

async function executeLeasedTask(task, leaseToken) {
  activeTaskCount += 1;
  void sendPresenceHeartbeat();
  console.log(`[local-agent] leased ${task.id} (${task.taskType}), attempt ${task.attemptCount}/${task.maxAttempts}`);
  const heartbeat = setInterval(() => {
    remote(`/api/internal/local-agent/tasks/${task.id}/heartbeat`, { agentId, leaseToken, leaseSeconds })
      .catch((error) => console.error(`[local-agent] heartbeat ${task.id} failed: ${messageOf(error)}`));
  }, Math.max(30000, Math.floor(leaseSeconds * 500)));
  heartbeat.unref();
  try {
    const result = await executeTask(task, leaseToken);
    await remote(`/api/internal/local-agent/tasks/${task.id}/complete`, { agentId, leaseToken, result });
    console.log(`[local-agent] completed ${task.id}`);
  } catch (error) {
    const message = messageOf(error);
    const retryable = !/unsupported task type|invalid task payload/i.test(message);
    console.error(`[local-agent] task ${task.id} failed: ${message}`);
    await remote(`/api/internal/local-agent/tasks/${task.id}/fail`, { agentId, leaseToken, error: message, retryable }).catch((reportError) => {
      console.error(`[local-agent] could not report failure ${task.id}: ${messageOf(reportError)}`);
    });
  } finally {
    clearInterval(heartbeat);
    activeTaskCount = Math.max(0, activeTaskCount - 1);
    void sendPresenceHeartbeat();
  }
}

async function executeTask(task, leaseToken) {
  if (task.taskType !== "source.inspect") throw new Error(`unsupported task type: ${task.taskType}`);
  const url = typeof task.payload?.url === "string" ? task.payload.url : "";
  const userId = typeof task.payload?.userId === "string" ? task.payload.userId : "";
  if (!url) throw new Error("invalid task payload: url is required");
  await publishTaskEvent(task, leaseToken, "status", { message: "正在解析作品信息..." });
  const response = await fetch(`${executorBase}/api/creation/link-remix/inspect`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ url, agentUserId: userId, deferTranscription: true }),
    signal: AbortSignal.timeout(boundedNumber("LOCAL_AGENT_TASK_TIMEOUT_MS", 900000, 60000, 1800000)),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `local executor HTTP ${response.status}`);
  if (!result.fields || typeof result.fields !== "object") throw new Error("local executor returned an invalid result");
  if (typeof result.mediaUrl === "string" && result.mediaUrl) {
    const transcript = await streamMediaTranscription(task, leaseToken, result.mediaUrl, result.mediaDecryptKey);
    if (transcript) {
      result.fields.source_transcript = transcript;
      result.note = `${result.note || "作品信息已回填。"} 本地语音转写已完成。`;
    }
  }
  return sanitizeResult(result);
}

async function streamMediaTranscription(task, leaseToken, mediaUrl, mediaDecryptKey) {
  await publishTaskEvent(task, leaseToken, "status", { message: "正在获取视频音频..." });
  const isLocalMedia = mediaUrl.startsWith("/");
  const isEncryptedWechatMedia = typeof mediaDecryptKey === "string" && /^\d+$/.test(mediaDecryptKey) && isAllowedWechatMediaUrl(mediaUrl);
  const mediaSource = isEncryptedWechatMedia ? buildWechatMediaProxyUrl(mediaUrl, mediaDecryptKey) : isLocalMedia ? `${executorBase}${mediaUrl}` : mediaUrl;
  const response = await fetch(mediaSource, {
    headers: isLocalMedia ? { authorization: `Bearer ${token}` } : undefined,
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`video download HTTP ${response.status}`);
  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (declaredLength > 25 * 1024 * 1024) throw new Error("video file exceeds the local transcription limit");
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > 25 * 1024 * 1024) throw new Error("video file exceeds the local transcription limit");

  await publishTaskEvent(task, leaseToken, "status", { message: "正在识别语音..." });
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: response.headers.get("content-type") || "video/mp4" }), "source-media.mp4");
  form.append("language", "zh");
  const transcriberBase = (process.env.VIRAL_TRANSCRIBE_API_BASE || "http://transcriber:8000").replace(/\/$/, "");
  const upstream = await fetch(`${transcriberBase}/transcribe/stream`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(boundedNumber("LOCAL_AGENT_TASK_TIMEOUT_MS", 900000, 60000, 1800000)),
  });
  if (!upstream.ok || !upstream.body) throw new Error(`local transcriber HTTP ${upstream.status}`);

  let transcript = "";
  let finalText = "";
  let pending = "";
  let uploadFailure;
  let uploadChain = Promise.resolve();
  const flush = () => {
    if (!pending) return uploadChain;
    const content = pending;
    pending = "";
    uploadChain = uploadChain.then(() => publishTaskEvent(task, leaseToken, "delta", { content }));
    return uploadChain;
  };
  const flushTimer = setInterval(() => void flush().catch((error) => { uploadFailure = error; }), transcriptBatchMs);
  try {
    await consumeSse(upstream.body, (event) => {
      if (event.type === "delta" && typeof event.content === "string") {
        transcript = `${transcript}${event.content}`.slice(0, 12000);
        pending += event.content;
        if (pending.length >= 2000) void flush().catch((error) => { uploadFailure = error; });
      }
      if (event.type === "done" && typeof event.text === "string") finalText = event.text.trim().slice(0, 12000);
      if (event.type === "error") throw new Error(typeof event.message === "string" ? event.message : "本地语音转写失败。");
    });
    await flush();
    if (uploadFailure) throw uploadFailure;
    return finalText || transcript.trim();
  } finally {
    clearInterval(flushTimer);
  }
}

async function consumeSse(stream, onEvent) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const messages = buffer.split("\n\n");
    buffer = messages.pop() || "";
    for (const message of messages) {
      const data = message.split("\n").find((line) => line.startsWith("data: "));
      if (data) onEvent(JSON.parse(data.slice(6)));
    }
  }
}

function publishTaskEvent(task, leaseToken, eventType, payload) {
  return remote(`/api/internal/local-agent/tasks/${task.id}/events`, { agentId, leaseToken, eventType, payload });
}

function sanitizeResult(result) {
  const clean = { ...result };
  delete clean.mediaDecryptKey;
  for (const key of ["mediaUrl", "thumbnailUrl"]) {
    if (typeof clean[key] === "string" && (clean[key].startsWith("/api/") || (key === "mediaUrl" && isAllowedWechatMediaUrl(clean[key])))) delete clean[key];
  }
  return clean;
}

function buildWechatMediaProxyUrl(mediaUrl, decryptKey) {
  const base = (process.env.VIRAL_WECHAT_DISCOVERY_API_BASE || "http://wx-channel:2026").replace(/\/$/, "");
  const proxy = new URL("/api/video/stream", `${base}/`);
  proxy.searchParams.set("url", mediaUrl);
  proxy.searchParams.set("key", decryptKey);
  return proxy.toString();
}

function isAllowedWechatMediaUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && /(^|\.)finder\.video\.qq\.com$/i.test(url.hostname);
  } catch {
    return false;
  }
}

async function remote(path, payload) {
  const response = await fetch(`${remoteBase}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `remote HTTP ${response.status}`);
  return body;
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}
function boundedNumber(name, fallback, min, max) {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) ? Math.min(Math.max(value, min), max) : fallback;
}
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function messageOf(error) { return error instanceof Error ? error.message : String(error); }

async function waitForExecutor() {
  for (;;) {
    try {
      const response = await fetch(`${executorBase}/api/internal/local-agent/executor-health`, { redirect: "manual", signal: AbortSignal.timeout(3000) });
      if (response.status > 0) return;
    } catch {}
    await delay(1000);
  }
}

async function sendPresenceHeartbeat(forcedStatus) {
  const health = await collectHealth();
  const ready = health.executor === "healthy" && health.transcriber === "healthy" && health.chromium === "healthy" && health.wechatChannel === "healthy" && health.ytDlp === "healthy";
  readyForTasks = ready;
  await remote("/api/internal/local-agent/heartbeat", {
    agentId,
    version: process.env.LOCAL_AGENT_VERSION?.trim() || "development",
    protocolVersion,
    status: forcedStatus || (ready ? activeTaskCount > 0 ? "busy" : "ready" : "degraded"),
    capabilities: { "source.inspect": ready && capabilities.includes("source.inspect") },
    health,
    activeTaskCount,
  });
  await import("node:fs/promises").then(({ writeFile }) => writeFile(readyFile, new Date().toISOString()));
}

async function collectHealth() {
  const [executor, transcriber, chromium, wechatChannel, ytDlp, xiaohongshu, werss, wechatSogou] = await Promise.all([
    httpHealth(`${executorBase}/api/internal/local-agent/executor-health`),
    httpHealth(`${(process.env.VIRAL_TRANSCRIBE_API_BASE || "http://transcriber:8000").replace(/\/$/, "")}/health`),
    httpHealth(`${executorBase.replace(/:\d+$/, `:${process.env.CONTAINER_BROWSER_CDP_PORT || "9222"}`)}/json/version`),
    httpHealth(`${(process.env.VIRAL_WECHAT_DISCOVERY_API_BASE || "http://wx-channel:2026").replace(/\/$/, "")}/api/v1/certificate/download`),
    execHealth(process.env.DOUYIN_YT_DLP_PATH || "yt-dlp", ["--version"]),
    optionalHttpHealth(process.env.VIRAL_XHS_BROWSER_ENABLED === "1", `${executorBase.replace(/:\d+$/, `:${process.env.VIRAL_XHS_CDP_PORT || "9223"}`)}/json/version`),
    optionalHttpHealth(process.env.VIRAL_WERSS_ENABLED === "1", `${(process.env.VIRAL_WERSS_API_BASE || "http://127.0.0.1:8001").replace(/\/$/, "")}/`),
    optionalHttpHealth(process.env.VIRAL_WECHATSOGOU_ENABLED === "1", `${(process.env.VIRAL_WECHATSOGOU_API_BASE || "http://127.0.0.1:8010").replace(/\/$/, "")}/docs`),
  ]);
  return { executor, transcriber, chromium, wechatChannel, ytDlp, xiaohongshu, werss, wechatSogou };
}

async function optionalHttpHealth(enabled, url) {
  return enabled ? httpHealth(url) : "disabled";
}

async function httpHealth(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
    return response.ok ? "healthy" : "unhealthy";
  } catch { return "unhealthy"; }
}
async function execHealth(command, args) {
  try {
    await execFileAsync(command, args, { timeout: 5000 });
    return "healthy";
  } catch { return "unhealthy"; }
}
