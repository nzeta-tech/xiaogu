import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { trySaveCreationDiagnostic } from "@/lib/creation/diagnostics";
import { checkRateLimit, requestClientKey } from "@/lib/security/rate-limit";

const payload = z.object({ traceId: z.string().max(96), appSlug: z.string().max(80), eventType: z.enum(["page_view", "submit_click", "prepare_started", "prepare_finished", "prepare_failed", "navigation_started", "client_error"]), outcome: z.string().max(48).optional(), errorCode: z.string().max(80).optional(), detail: z.record(z.string(), z.unknown()).optional() });
export async function POST(request: Request) {
  const limit = checkRateLimit(`creation-diagnostics:${requestClientKey(request)}`, 60, 60_000);
  if (!limit.ok) return new Response(null, { status: 429 });
  const parsed = payload.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response(null, { status: 400 });
  const user = await getSessionUser({ allowTermsMismatch: true });
  const allowedDetailKeys = new Set(["clientSessionId", "online", "userAgent", "durationMs", "visibility", "errorName", "errorMessage", "errorStack", "errorSource", "errorLine", "errorColumn"]);
  const detail = Object.fromEntries(Object.entries(parsed.data.detail ?? {}).flatMap(([key, value]) => {
    if (!allowedDetailKeys.has(key) || !["string", "number", "boolean"].includes(typeof value)) return [];
    return [[key, typeof value === "string" ? value.slice(0, 65_536) : value]];
  }));
  await trySaveCreationDiagnostic({ userId: user?.id, userEmail: user?.email, ...parsed.data, detail });
  return new Response(null, { status: 204 });
}
