import { z } from "zod";
import { requireSessionUser } from "@/lib/auth/session";
import { continueWorkbuddyTask, editAndContinueWorkbuddyTask, type WorkbuddyExecutionEvent } from "@/lib/workbuddy/store";

const inputSchema = z.object({ message: z.string().trim().min(1).max(6000), context: z.string().max(30000).optional().default(""), editMessageId: z.string().uuid().optional() });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "请完整填写修改要求。" }, { status: 400 });
  const { id } = await context.params;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: WorkbuddyExecutionEvent) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify({ ...event, at: new Date().toISOString() })}\n\n`)); } catch { closed = true; }
      };
      try {
        const task = parsed.data.editMessageId
          ? await editAndContinueWorkbuddyTask(user, id, parsed.data.editMessageId, parsed.data.message, send, request.signal, parsed.data.context)
          : await continueWorkbuddyTask(user, id, parsed.data.message, send, request.signal, parsed.data.context);
        if (!task) throw new Error("任务不存在或继续执行失败");
        send({ type: "done", message: "本轮任务流已完成", taskId: id, data: { task } });
      } catch (error) {
        send({ type: "error", message: error instanceof Error ? error.message : "继续执行失败", taskId: id });
      } finally {
        if (!closed) controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "private, no-cache, no-transform", connection: "keep-alive", "x-accel-buffering": "no" } });
}
