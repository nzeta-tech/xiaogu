import assert from "node:assert/strict";

const [repoPath, releaseSha, baseUrl] = process.argv.slice(2);
void repoPath;
void releaseSha;

if (!baseUrl) throw new Error("Usage: production-real-source-runner.mjs <repo-path> <release-sha> <base-url> <agent-env>");

const base = new URL(baseUrl).origin;
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const email = `xiaogu-release-${suffix}@example.invalid`;
const password = `Release-${crypto.randomUUID()}-A1`;
let cookie = "";

function headers(extra = {}) {
  return { accept: "application/json", ...(cookie ? { cookie } : {}), ...extra };
}

function redactError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replaceAll(base, "<base-url>").slice(0, 500);
}

async function json(path, init = {}) {
  const response = await fetch(`${base}${path}`, { ...init, headers: headers(init.headers) });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function register() {
  const { response, payload } = await json("/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.72" },
    body: JSON.stringify({ name: "发布回归", email, password, acceptedTerms: true }),
  });
  if (!response.ok) throw new Error(`temporary regression registration failed (${response.status}): ${String(payload.error ?? "unknown")}`);
  const cookies = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [response.headers.get("set-cookie") ?? ""];
  cookie = cookies.map((value) => value.split(";")[0]).filter(Boolean).join("; ");
  if (!cookie) throw new Error("temporary regression registration did not establish a session");
}

function supportedSource(items) {
  return items.find((item) => {
    if (!item || typeof item.sourceUrl !== "string") return false;
    try {
      const host = new URL(item.sourceUrl).hostname;
      return /(^|\.)(douyin\.com|weixin\.qq\.com|channels\.weixin\.qq\.com)$/i.test(host);
    } catch {
      return false;
    }
  })?.sourceUrl;
}

async function readEvents(taskId) {
  const response = await fetch(`${base}/api/creation/link-remix/inspect/${encodeURIComponent(taskId)}/events?after=0`, { headers: headers() });
  if (!response.ok) throw new Error(`SSE endpoint failed (${response.status})`);
  const raw = await response.text();
  const events = raw.split("\n\n").filter(Boolean);
  let deltas = 0;
  let deltaCharacters = 0;
  let done = false;
  for (const event of events) {
    const name = event.match(/^event: (.+)$/m)?.[1];
    const data = event.match(/^data: (.+)$/m)?.[1];
    if (name === "done") done = true;
    if (!data) continue;
    const payload = JSON.parse(data);
    if (payload.type === "delta" && typeof payload.content === "string") {
      deltas += 1;
      deltaCharacters += payload.content.length;
    }
  }
  return { deltas, deltaCharacters, done };
}

async function waitForTask(taskId) {
  const deadline = Date.now() + 10 * 60 * 1000;
  while (Date.now() < deadline) {
    const { response, payload } = await json(`/api/creation/link-remix/inspect/${encodeURIComponent(taskId)}`);
    if (!response.ok) throw new Error(`task status failed (${response.status}): ${String(payload.error ?? "unknown")}`);
    if (payload.status === "succeeded") return payload.result;
    if (payload.status === "failed" || payload.status === "cancelled") throw new Error(`task ${payload.status}: ${String(payload.error ?? "unknown")}`);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error("task timed out after 10 minutes");
}

try {
  await register();
  const { response: examplesResponse, payload: examples } = await json("/api/viral-examples");
  if (!examplesResponse.ok) throw new Error(`viral examples request failed (${examplesResponse.status})`);
  const sourceUrl = process.env.XIAOGU_REAL_SOURCE_URL?.trim() || supportedSource(examples.items ?? []);
  if (!sourceUrl) throw new Error("no supported public Douyin or Video Channels source is available for release validation");

  const { response: inspectResponse, payload: inspect } = await json("/api/creation/link-remix/inspect", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: sourceUrl }),
  });
  if (inspectResponse.status !== 202 || !inspect.taskId) throw new Error(`source inspection did not queue a local Agent task (${inspectResponse.status})`);

  const result = await waitForTask(inspect.taskId);
  const events = await readEvents(inspect.taskId);
  const transcript = typeof result?.fields?.source_transcript === "string" ? result.fields.source_transcript.trim() : "";
  assert(transcript.length > 0, "completed task has no source transcript");
  assert(events.deltas > 0, "task emitted no SSE transcript deltas");
  assert(events.done, "task SSE stream did not finish with done");
  assert(!result?.mediaUrl && !result?.mediaDecryptKey, "sensitive media fields leaked in task result");
  console.log(JSON.stringify({ taskId: inspect.taskId, status: "succeeded", sseDeltas: events.deltas, sseDeltaCharacters: events.deltaCharacters, transcriptCharacters: transcript.length, mediaUrlPresent: false, mediaDecryptKeyPresent: false }));
} catch (error) {
  console.error(JSON.stringify({ status: "failed", error: redactError(error) }));
  process.exitCode = 1;
}
