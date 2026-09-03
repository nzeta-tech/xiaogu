import { z } from "zod";
import { requireSessionUser } from "@/lib/auth/session";
import { createWorkbuddyTask, type WorkbuddyExecutionEvent } from "@/lib/workbuddy/store";

const inputSchema = z.object({
  objective: z.string().trim().min(1).max(6000),
  scenario: z.enum(["content", "video", "customer", "product", "team", "research", "general"]).optional(),
  context: z.string().trim().max(20000).default(""),
  priority: z.enum(["low", "normal", "high"]).default("normal"),
});

export async function POST(request: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "请完整描述工作目标，内容不超过 6000 字。" }, { status: 400 });
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: WorkbuddyExecutionEvent) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify({ ...event, at: new Date().toISOString() })}\n\n`)); } catch { closed = true; }
      };
      send({ type: "request.accepted", message: "已收到目标，正在分析任务意图" });
      try {
        const task = await createWorkbuddyTask(user, parsed.data, send, request.signal);
        if (!task) throw new Error("任务执行完成但未能读取结果");
        send({ type: "done", message: "任务流已完成", taskId: task.id, data: { task } });
      } catch (error) {
        send({ type: "error", message: error instanceof Error ? error.message : "任务执行失败" });
      } finally {
        if (!closed) controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "private, no-cache, no-transform", connection: "keep-alive", "x-accel-buffering": "no" } });
}
