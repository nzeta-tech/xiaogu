"use client";

import { apiPath } from "@/lib/client/url";

type EventType = "page_view" | "submit_click" | "prepare_started" | "prepare_finished" | "prepare_failed" | "navigation_started" | "client_error";
const SESSION_KEY = "creation:diagnostic-session";

export function createCreationTraceId() { return `crt_${crypto.randomUUID().replaceAll("-", "")}`; }
function sessionId() {
  const stored = sessionStorage.getItem(SESSION_KEY);
  if (stored) return stored;
  const next = `cs_${crypto.randomUUID().replaceAll("-", "")}`;
  sessionStorage.setItem(SESSION_KEY, next); return next;
}
export function trackCreationDiagnostic(input: { traceId: string; appSlug: string; eventType: EventType; outcome?: string; errorCode?: string; detail?: Record<string, unknown> }) {
  const body = JSON.stringify({ ...input, detail: { clientSessionId: sessionId(), online: navigator.onLine, userAgent: navigator.userAgent.slice(0, 300), ...input.detail } });
  const url = apiPath("/api/creation/diagnostics");
  if (navigator.sendBeacon) { navigator.sendBeacon(url, new Blob([body], { type: "application/json" })); return; }
  void fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => undefined);
}
