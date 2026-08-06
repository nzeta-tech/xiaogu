import { query } from "@/lib/db/client";

export type CreationDiagnosticEvent =
  | "page_view" | "submit_click" | "prepare_started" | "prepare_received"
  | "prepare_finished" | "prepare_failed" | "navigation_started" | "client_error";

const tracePattern = /^[a-zA-Z0-9_-]{12,96}$/;

export function normalizeCreationTraceId(value: string | null | undefined) {
  return value && tracePattern.test(value) ? value : null;
}

export async function trySaveCreationDiagnostic(input: {
  userId?: string | null; traceId: string; requestId?: string | null; appSlug?: string | null;
  eventType: CreationDiagnosticEvent; outcome?: string | null; errorCode?: string | null; detail?: Record<string, unknown>;
}) {
  const traceId = normalizeCreationTraceId(input.traceId);
  if (!traceId) return null;
  try {
    const result = await query<{ id: string }>(
      `insert into creation_diagnostics(user_id,trace_id,request_id,app_slug,event_type,outcome,error_code,detail)
       values($1,$2,$3,$4,$5,$6,$7,$8::jsonb) returning id`,
      [input.userId ?? null, traceId, input.requestId ?? null, input.appSlug ?? "", input.eventType, input.outcome ?? "", input.errorCode ?? "", JSON.stringify(input.detail ?? {})],
    );
    return result.rows[0]?.id ?? null;
  } catch { return null; }
}

export function creationRequestId() { return crypto.randomUUID(); }
