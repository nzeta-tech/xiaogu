import { z } from "zod";
import { requireSessionUser } from "@/lib/auth/session";
import { cancelWorkbuddyTask, continueWorkbuddyTask, getWorkbuddyTask, resolveWorkbuddyApproval, saveWorkbuddyMessageFeedback } from "@/lib/workbuddy/store";

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("cancel-task") }),
  z.object({ action: z.literal("resolve-approval"), approvalId: z.string().uuid(), decision: z.enum(["approved", "rejected"]), note: z.string().trim().max(1000).default("") }),
  z.object({ action: z.literal("continue-task"), message: z.string().trim().min(1).max(6000) }),
  z.object({ action: z.literal("message-feedback"), messageId: z.string().uuid(), rating: z.enum(["up", "down"]).nullable() }),
]);

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  const { id } = await context.params;
  const task = await getWorkbuddyTask(user.id, id).catch(() => null);
  return task ? Response.json({ task }, { headers: { "cache-control": "private, no-store" } }) : Response.json({ error: "任务不存在" }, { status: 404 });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "验收操作不完整" }, { status: 400 });
  const { id } = await context.params;
  if (parsed.data.action === "cancel-task") {
    const task = await cancelWorkbuddyTask(user.id, id).catch(() => null);
    return task ? Response.json({ task }) : Response.json({ error: "任务不存在或无法停止" }, { status: 404 });
  }
  if (parsed.data.action === "continue-task") {
    const task = await continueWorkbuddyTask(user, id, parsed.data.message).catch(() => null);
    return task ? Response.json({ task }) : Response.json({ error: "任务不存在或继续执行失败" }, { status: 404 });
  }
  if (parsed.data.action === "message-feedback") {
    const ok = await saveWorkbuddyMessageFeedback(user.id, id, parsed.data.messageId, parsed.data.rating).catch(() => false);
    return ok ? Response.json({ ok: true }) : Response.json({ error: "消息不存在" }, { status: 404 });
  }
  const ok = await resolveWorkbuddyApproval(user, id, parsed.data.approvalId, parsed.data.decision, parsed.data.note).catch(() => false);
  if (!ok) return Response.json({ error: "该验收项不存在或已处理" }, { status: 409 });
  return Response.json({ task: await getWorkbuddyTask(user.id, id) });
}
