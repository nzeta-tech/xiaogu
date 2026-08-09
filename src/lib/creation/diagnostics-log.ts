import { appendFile, mkdir, readdir, readFile } from "node:fs/promises";
import path from "node:path";

export type CreationDiagnosticEvent =
  | "page_view" | "submit_click" | "prepare_started" | "prepare_received"
  | "prepare_finished" | "prepare_failed" | "navigation_started" | "client_error" | "submit_blocked";

export type CreationDiagnosticRecord = {
  created_at: string;
  user_id: string | null;
  email: string | null;
  trace_id: string;
  request_id: string | null;
  app_slug: string;
  event_type: CreationDiagnosticEvent;
  outcome: string;
  error_code: string;
  detail: Record<string, unknown>;
};

const logDirectory = process.env.CREATION_DIAGNOSTICS_LOG_DIR ?? "/var/log/xiaogu/creation-diagnostics";
const tracePattern = /^[a-zA-Z0-9_-]{12,96}$/;

export function normalizeCreationTraceId(value: string | null | undefined) {
  return value && tracePattern.test(value) ? value : null;
}

export async function saveCreationDiagnostic(input: Omit<CreationDiagnosticRecord, "created_at">) {
  const traceId = normalizeCreationTraceId(input.trace_id);
  if (!traceId) return false;
  const createdAt = new Date();
  const record: CreationDiagnosticRecord = { ...input, trace_id: traceId, created_at: createdAt.toISOString() };
  try {
    await mkdir(logDirectory, { recursive: true, mode: 0o700 });
    await appendFile(logFileFor(createdAt), `${JSON.stringify(record)}\n`, { encoding: "utf8", mode: 0o600 });
    return true;
  } catch {
    return false;
  }
}

export async function listCreationDiagnostics(input: { email?: string; traceId?: string; limit?: number }) {
  const email = input.email?.trim().toLowerCase() ?? "";
  const traceId = input.traceId?.trim() ?? "";
  const limit = Math.min(Math.max(input.limit ?? 200, 1), 200);
  if (!email && !traceId) return [];
  try {
    const names = (await readdir(logDirectory)).filter((name) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(name)).sort().reverse();
    const records: CreationDiagnosticRecord[] = [];
    for (const name of names) {
      const contents = await readFile(path.join(logDirectory, name), "utf8");
      const lines = contents.split("\n").filter(Boolean).reverse();
      for (const line of lines) {
        try {
          const record = JSON.parse(line) as CreationDiagnosticRecord;
          if ((email && record.email?.toLowerCase() !== email) || (traceId && record.trace_id !== traceId)) continue;
          records.push(record);
          if (records.length >= limit) return records;
        } catch {
          // Ignore a malformed or partial line so a single interrupted write does not hide later events.
        }
      }
    }
    return records;
  } catch {
    return [];
  }
}

function logFileFor(date: Date) {
  return path.join(logDirectory, `${date.toISOString().slice(0, 10)}.jsonl`);
}
