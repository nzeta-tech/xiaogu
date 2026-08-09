"use client";

import { apiPath } from "@/lib/client/url";

type EventType = "page_view" | "submit_click" | "submit_blocked" | "prepare_started" | "prepare_finished" | "prepare_failed" | "navigation_started" | "client_error";
const SESSION_KEY = "creation:diagnostic-session";
const QUEUE_KEY = "creation:diagnostic-queue";
const MAX_QUEUED_EVENTS = 30;

export function createCreationTraceId() { return `crt_${crypto.randomUUID().replaceAll("-", "")}`; }
function sessionId() {
  const stored = sessionStorage.getItem(SESSION_KEY);
  if (stored) return stored;
  const next = `cs_${crypto.randomUUID().replaceAll("-", "")}`;
  sessionStorage.setItem(SESSION_KEY, next); return next;
}
export function trackCreationDiagnostic(input: { traceId: string; appSlug: string; eventType: EventType; outcome?: string; errorCode?: string; detail?: Record<string, unknown> }) {
  void flushQueuedCreationDiagnostics();
  const body = JSON.stringify({ ...input, detail: { clientSessionId: sessionId(), online: navigator.onLine, userAgent: navigator.userAgent.slice(0, 300), ...input.detail } });
  const url = apiPath("/api/creation/diagnostics");
  if (navigator.sendBeacon && navigator.sendBeacon(url, new Blob([body], { type: "application/json" }))) return;
  void postDiagnostic(body).catch(() => enqueueDiagnostic(body));
}

async function postDiagnostic(body: string) {
  const response = await fetch(apiPath("/api/creation/diagnostics"), { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true });
  if (!response.ok) throw new Error(`diagnostic_http_${response.status}`);
}

async function flushQueuedCreationDiagnostics() {
  const queued = readDiagnosticQueue();
  if (!queued.length || !navigator.onLine) return;
  const pending: string[] = [];
  for (let index = 0; index < queued.length; index += 1) {
    try { await postDiagnostic(queued[index]); } catch { pending.push(...queued.slice(index)); break; }
  }
  writeDiagnosticQueue(pending);
}

function enqueueDiagnostic(body: string) {
  const queued = readDiagnosticQueue();
  queued.push(body);
  writeDiagnosticQueue(queued.slice(-MAX_QUEUED_EVENTS));
}

function readDiagnosticQueue() {
  try {
    const value = localStorage.getItem(QUEUE_KEY);
    const parsed = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string").slice(-MAX_QUEUED_EVENTS) : [];
  } catch { return []; }
}

function writeDiagnosticQueue(entries: string[]) {
  try {
    if (entries.length) localStorage.setItem(QUEUE_KEY, JSON.stringify(entries));
    else localStorage.removeItem(QUEUE_KEY);
  } catch { /* Diagnostics must never block the product flow. */ }
}

export function browserErrorDetail(event: ErrorEvent) {
  const error = event.error;
  return {
    errorName: error instanceof Error ? error.name : "Error",
    errorMessage: limitText(error instanceof Error ? error.message : event.message),
    errorStack: limitText(error instanceof Error ? error.stack ?? "" : ""),
    errorSource: event.filename || "",
    errorLine: event.lineno || 0,
    errorColumn: event.colno || 0,
  };
}

export function rejectionErrorDetail(event: PromiseRejectionEvent) {
  const reason = event.reason;
  if (reason instanceof Error) {
    return { errorName: reason.name, errorMessage: limitText(reason.message), errorStack: limitText(reason.stack ?? "") };
  }
  return { errorName: typeof reason, errorMessage: limitText(stringifyReason(reason)), errorStack: "" };
}

function stringifyReason(reason: unknown) {
  if (typeof reason === "string") return reason;
  try { return JSON.stringify(reason); } catch { return String(reason); }
}

function limitText(value: string) {
  return value.length <= 65_536 ? value : `${value.slice(0, 65_536)}\n[truncated]`;
}
