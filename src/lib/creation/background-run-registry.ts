import { executeCreationAppRun, RetryableCreationRunError } from "@/lib/creation/execute-app-run";
import type { CreationFieldValue } from "@/lib/creation/output";

type FieldValue = CreationFieldValue;
type StreamImage = { id: string; url: string };
type WorkRunEvent =
  | { type: "meta"; runId?: string | null }
  | { type: "delta"; content?: string }
  | { type: "images"; images?: StreamImage[]; imageMode?: string | null; retryable?: boolean }
  | { type: "done"; content?: string; images?: StreamImage[]; imageMode?: string | null; retryable?: boolean }
  | { type: "error"; content?: string };

export type BackgroundWorkRunSnapshot = {
  status: "running" | "done" | "error";
  runId: string | null;
  content: string;
  images: StreamImage[];
  imageMode: string | null;
  retryable: boolean;
  error: string;
};

type BackgroundWorkRunEntry = {
  promise: Promise<void>;
  listeners: Set<(event: WorkRunEvent) => void>;
  snapshot: BackgroundWorkRunSnapshot;
};

const activeWorkRuns = new Map<string, BackgroundWorkRunEntry>();
const BACKGROUND_RETRY_DELAY_MS = 3000;
const MAX_BACKGROUND_RETRIES = 1;

export function isWorkRunActive(workId: string) {
  return activeWorkRuns.has(workId);
}

export function getBackgroundWorkRunSnapshot(workId: string) {
  return activeWorkRuns.get(workId)?.snapshot ?? null;
}

export function subscribeToBackgroundWorkRun(workId: string, listener: (event: WorkRunEvent) => void) {
  const entry = activeWorkRuns.get(workId);
  if (!entry) return null;
  entry.listeners.add(listener);
  return () => {
    entry.listeners.delete(listener);
  };
}

export function startBackgroundWorkRun(input: {
  workId: string;
  slug: string;
  userId: string;
  values: Record<string, FieldValue>;
  quotaCost: number;
  existingRunId?: string | null;
  retryAttempt?: number;
}) {
  const existing = activeWorkRuns.get(input.workId);
  if (existing) return existing.promise;

  const retryAttempt = input.retryAttempt ?? 0;
  const listeners = new Set<(event: WorkRunEvent) => void>();
  const snapshot: BackgroundWorkRunSnapshot = {
    status: "running",
    runId: input.existingRunId ?? null,
    content: "",
    images: [],
    imageMode: null,
    retryable: false,
    error: "",
  };

  function emit(event: WorkRunEvent) {
    if (event.type === "meta") {
      snapshot.runId = event.runId ?? snapshot.runId;
    }
    if (event.type === "delta" && event.content) {
      snapshot.content += event.content;
    }
    if (event.type === "images") {
      snapshot.images = event.images ?? [];
      snapshot.imageMode = event.imageMode ?? null;
      snapshot.retryable = event.retryable ?? false;
    }
    if (event.type === "done") {
      snapshot.status = "done";
      snapshot.content = event.content ?? snapshot.content;
      snapshot.images = event.images ?? snapshot.images;
      snapshot.imageMode = event.imageMode ?? snapshot.imageMode;
      snapshot.retryable = event.retryable ?? snapshot.retryable;
      snapshot.error = "";
    }
    if (event.type === "error") {
      snapshot.status = "error";
      snapshot.error = event.content ?? "内容生成失败";
    }

    for (const listener of listeners) {
      listener(event);
    }
  }

  const task = runBackgroundWorkAttempt({
    ...input,
    retryAttempt,
    onEvent: emit,
  })
    .then(() => undefined)
    .finally(() => {
      activeWorkRuns.delete(input.workId);
    });

  activeWorkRuns.set(input.workId, { promise: task, listeners, snapshot });
  return task;
}

export function ensureBackgroundWorkRun(input: {
  workId: string;
  slug: string;
  userId: string;
  values: Record<string, FieldValue>;
  quotaCost?: number;
  existingRunId?: string | null;
  retryAttempt?: number;
}) {
  if (activeWorkRuns.has(input.workId)) {
    return activeWorkRuns.get(input.workId)?.promise ?? Promise.resolve();
  }

  return startBackgroundWorkRun({
    workId: input.workId,
    slug: input.slug,
    userId: input.userId,
    values: input.values,
    quotaCost: input.quotaCost ?? 0,
    existingRunId: input.existingRunId ?? null,
    retryAttempt: input.retryAttempt ?? 0,
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runBackgroundWorkAttempt(input: {
  workId: string;
  slug: string;
  userId: string;
  values: Record<string, FieldValue>;
  quotaCost: number;
  existingRunId?: string | null;
  retryAttempt: number;
  onEvent: (event: WorkRunEvent) => void;
}) {
  try {
    await executeCreationAppRun({
      slug: input.slug,
      userId: input.userId,
      values: input.values,
      workId: input.workId,
      quotaCost: input.quotaCost,
      existingRunId: input.existingRunId ?? null,
      onEvent: input.onEvent,
    });
  } catch (error) {
    const shouldRetry =
      error instanceof RetryableCreationRunError &&
      input.retryAttempt < MAX_BACKGROUND_RETRIES;

    if (shouldRetry) {
      console.warn("background work run retrying once after retryable image failure", {
        workId: input.workId,
        slug: input.slug,
        userId: input.userId,
        retryAttempt: input.retryAttempt,
      });
      await sleep(BACKGROUND_RETRY_DELAY_MS);
      return runBackgroundWorkAttempt({
        ...input,
        retryAttempt: input.retryAttempt + 1,
      });
    }

    console.error("background work run failed", {
      workId: input.workId,
      slug: input.slug,
      userId: input.userId,
      retryAttempt: input.retryAttempt,
      error,
    });
  }
}
