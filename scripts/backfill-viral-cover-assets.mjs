import os from "node:os";

const remoteBase = required("LOCAL_AGENT_BASE_URL").replace(/\/$/, "");
const executorBase = (process.env.LOCAL_AGENT_EXECUTOR_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const token = required("LOCAL_AGENT_TOKEN");

const pending = await remote("/api/internal/local-agent/viral-covers/pending", { method: "GET" });
let cached = 0;
let refreshed = 0;
let failed = 0;

for (const item of pending.items ?? []) {
  if (await cache(item.id, item.thumbnailUrl)) {
    cached += 1;
    continue;
  }
  const thumbnailUrl = await refreshThumbnail(item.sourceUrl);
  if (thumbnailUrl && await cache(item.id, thumbnailUrl)) {
    refreshed += 1;
  } else {
    failed += 1;
  }
}

console.log(JSON.stringify({ host: os.hostname(), pending: pending.items?.length ?? 0, cached, refreshed, failed }));

async function refreshThumbnail(sourceUrl) {
  try {
    const response = await fetch(`${executorBase}/api/creation/link-remix/inspect`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ url: sourceUrl, agentUserId: "local-agent", deferTranscription: true }),
      signal: AbortSignal.timeout(180_000),
    });
    const result = await response.json().catch(() => ({}));
    return response.ok && typeof result.thumbnailUrl === "string" ? result.thumbnailUrl : "";
  } catch {
    return "";
  }
}

async function cache(contentId, thumbnailUrl) {
  try {
    const response = await remote("/api/internal/local-agent/viral-covers/cache", {
      method: "POST",
      body: { contentId, thumbnailUrl },
      acceptFailure: true,
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function remote(path, input) {
  const response = await fetch(`${remoteBase}${path}`, {
    method: input.method,
    headers: { authorization: `Bearer ${token}`, ...(input.method === "POST" ? { "content-type": "application/json" } : {}) },
    body: input.method === "POST" ? JSON.stringify(input.body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok && !input.acceptFailure) throw new Error(body.error || `remote HTTP ${response.status}`);
  return { ...body, ok: response.ok };
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}
