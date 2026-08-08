import { normalizeCreationTraceId, saveCreationDiagnostic, type CreationDiagnosticEvent } from "@/lib/creation/diagnostics-log";

export { normalizeCreationTraceId, type CreationDiagnosticEvent } from "@/lib/creation/diagnostics-log";

export async function trySaveCreationDiagnostic(input: {
  userId?: string | null; userEmail?: string | null; traceId: string; requestId?: string | null; appSlug?: string | null;
  eventType: CreationDiagnosticEvent; outcome?: string | null; errorCode?: string | null; detail?: Record<string, unknown>;
}) {
  const traceId = normalizeCreationTraceId(input.traceId);
  if (!traceId) return null;
  return await saveCreationDiagnostic({
    user_id: input.userId ?? null,
    email: input.userEmail?.toLowerCase() ?? null,
    trace_id: traceId,
    request_id: input.requestId ?? null,
    app_slug: input.appSlug ?? "",
    event_type: input.eventType,
    outcome: input.outcome ?? "",
    error_code: input.errorCode ?? "",
    detail: input.detail ?? {},
  }) ? traceId : null;
}

export function creationRequestId() { return crypto.randomUUID(); }
