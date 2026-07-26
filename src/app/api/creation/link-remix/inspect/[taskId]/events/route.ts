import { requireSessionUser } from "@/lib/auth/session";
import { getOwnedLocalAgentTask, listOwnedLocalAgentTaskEvents } from "@/lib/local-agent/repository";

export const maxDuration = 600;

export async function GET(request: Request, context: { params: Promise<{ taskId: string }> }) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  const { taskId } = await context.params;
  const task = await getOwnedLocalAgentTask(taskId, user.id);
  if (!task || task.taskType !== "source.inspect") return Response.json({ error: "任务不存在。" }, { status: 404 });

  const url = new URL(request.url);
  const headerCursor = Number(request.headers.get("last-event-id") ?? 0);
  const queryCursor = Number(url.searchParams.get("after") ?? 0);
  let cursor = Math.max(Number.isSafeInteger(headerCursor) ? headerCursor : 0, Number.isSafeInteger(queryCursor) ? queryCursor : 0, 0);
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let lastKeepAlive = Date.now();
      let lastStatusCheck = 0;
      const send = (value: string) => controller.enqueue(encoder.encode(value));
      try {
        while (!request.signal.aborted) {
          const events = await listOwnedLocalAgentTaskEvents({ id: taskId, userId: user.id, afterId: cursor });
          for (const event of events) {
            cursor = event.id;
            send(`id: ${event.id}\ndata: ${JSON.stringify({ type: event.eventType, ...event.payload, attemptCount: event.attemptCount })}\n\n`);
          }
          if (Date.now() - lastStatusCheck >= 2000) {
            const current = await getOwnedLocalAgentTask(taskId, user.id);
            lastStatusCheck = Date.now();
            if (!current) {
              send(`event: error\ndata: ${JSON.stringify({ message: "任务不存在。" })}\n\n`);
              break;
            }
            if (current.status === "succeeded") {
              send(`event: done\ndata: ${JSON.stringify({ status: current.status })}\n\n`);
              break;
            }
            if (current.status === "failed" || current.status === "cancelled") {
              send(`event: failed\ndata: ${JSON.stringify({ status: current.status, message: current.errorMessage ?? "本地 Agent 未能完成解析。" })}\n\n`);
              break;
            }
          }
          if (Date.now() - lastKeepAlive >= 10_000) {
            send(`: keep-alive ${Date.now()}\n\n`);
            lastKeepAlive = Date.now();
          }
          await abortableDelay(500, request.signal);
        }
      } catch (error) {
        if (!request.signal.aborted) send(`event: error\ndata: ${JSON.stringify({ message: error instanceof Error ? error.message : "事件流中断。" })}\n\n`);
      } finally {
        try { controller.close(); } catch {}
      }
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "private, no-cache, no-transform",
      "x-accel-buffering": "no",
      connection: "keep-alive",
    },
  });
}

function abortableDelay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const onAbort = () => { clearTimeout(timer); resolve(); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", onAbort); resolve(); }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
