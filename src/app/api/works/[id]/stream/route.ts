import { requireSessionUser } from "@/lib/auth/session";
import {
  ensureBackgroundWorkRun,
  getBackgroundWorkRunPromise,
  getBackgroundWorkRunSnapshot,
  subscribeToBackgroundWorkRun,
} from "@/lib/creation/background-run-registry";
import { tryGetWorkDetail } from "@/lib/db/repositories";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const { id } = await context.params;
  const work = await tryGetWorkDetail({ userId: user.id, workId: id });
  if (!work) {
    return Response.json({ error: "作品不存在或无权访问" }, { status: 404 });
  }

  const payload = work.app_run?.input_payload;
  const activeRunPromise = getBackgroundWorkRunPromise(work.id);
  const canStream =
    work.app_run?.status === "running" &&
    payload &&
    typeof payload === "object" &&
    Object.keys(payload).length > 0;

  if (!canStream && !activeRunPromise) {
    return Response.json({ error: "当前作品没有可连接的生成流" }, { status: 409 });
  }

  const encoder = new TextEncoder();
  const encodeEvent = (payloadValue: unknown) => encoder.encode(`data: ${JSON.stringify(payloadValue)}\n\n`);

  const stream = new ReadableStream({
    async start(controller) {
      let streamClosed = false;
      let heartbeat: ReturnType<typeof setInterval> | null = null;

      const safeClose = () => {
        if (streamClosed) return;
        streamClosed = true;
        if (heartbeat) clearInterval(heartbeat);
        controller.close();
      };

      const safeEnqueue = (payloadValue: Uint8Array) => {
        if (streamClosed) return false;
        try {
          controller.enqueue(payloadValue);
          return true;
        } catch {
          streamClosed = true;
          return false;
        }
      };

      safeEnqueue(encoder.encode(": stream\n\n"));
      heartbeat = setInterval(() => {
        safeEnqueue(encoder.encode(": heartbeat\n\n"));
      }, 15000);

      const runPromise = activeRunPromise ?? ensureBackgroundWorkRun({
        workId: work.id,
        slug: work.platform,
        userId: user.id,
        values: payload as Record<string, string | string[]>,
        quotaCost: Number(work.app_run?.quota_cost ?? 0),
        existingRunId: work.app_run?.id ?? null,
      });

      const snapshot = getBackgroundWorkRunSnapshot(work.id);
      if (snapshot) {
        safeEnqueue(encodeEvent({ type: "meta", runId: snapshot.runId ?? work.app_run?.id ?? null }));
        if (snapshot.content) {
          safeEnqueue(encodeEvent({ type: "delta", content: snapshot.content }));
        }
        if (snapshot.images.length > 0 || snapshot.imageMode || snapshot.retryable) {
          safeEnqueue(encodeEvent({
            type: "images",
            images: snapshot.images,
            imageMode: snapshot.imageMode,
            retryable: snapshot.retryable,
          }));
        }
        if (snapshot.status === "done") {
          safeEnqueue(encodeEvent({
            type: "done",
            work: { id: work.id, title: work.title },
            result: snapshot.content,
            images: snapshot.images,
            imageMode: snapshot.imageMode,
            retryable: snapshot.retryable,
          }));
          safeClose();
          return;
        }
        if (snapshot.status === "error") {
          safeEnqueue(encodeEvent({ type: "error", content: snapshot.error || "内容生成失败" }));
          safeClose();
          return;
        }
      }

      const unsubscribe = subscribeToBackgroundWorkRun(work.id, (event) => {
        if (event.type === "meta") {
          safeEnqueue(encodeEvent({ type: "meta", runId: event.runId ?? null }));
          return;
        }
        if (event.type === "delta" && event.content) {
          safeEnqueue(encodeEvent({ type: "delta", content: event.content }));
          return;
        }
        if (event.type === "images") {
          safeEnqueue(encodeEvent({
            type: "images",
            images: event.images ?? [],
            imageMode: event.imageMode ?? null,
            retryable: event.retryable ?? false,
          }));
          return;
        }
        if (event.type === "done") {
          safeEnqueue(encodeEvent({
            type: "done",
            work: { id: work.id, title: work.title },
            result: event.content ?? "",
            images: event.images ?? [],
            imageMode: event.imageMode ?? null,
            retryable: event.retryable ?? false,
          }));
          unsubscribe?.();
          safeClose();
          return;
        }
        if (event.type === "error") {
          safeEnqueue(encodeEvent({ type: "error", content: event.content ?? "内容生成失败" }));
          unsubscribe?.();
          safeClose();
        }
      });

      await runPromise.finally(() => {
        unsubscribe?.();
        safeClose();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
