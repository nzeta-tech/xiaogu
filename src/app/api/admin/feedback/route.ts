import { z } from "zod";
import { requireSessionUser } from "@/lib/auth/session";
import { tryCreateAdminAuditLog, tryListAdminFeedbackTickets, tryUpdateAdminFeedbackTicket } from "@/lib/db/repositories";

const updateSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["open", "in_progress", "resolved", "closed"]).optional(),
  priority: z.enum(["low", "normal", "high"]).optional(),
  adminReply: z.string().trim().max(3000).optional(),
});

async function requireAdmin() {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  if (user.role !== "admin") return Response.json({ error: "无权访问反馈管理" }, { status: 403 });
  return user;
}

export async function GET() {
  const user = await requireAdmin();
  if (user instanceof Response) return user;

  const tickets = await tryListAdminFeedbackTickets();
  return Response.json({ tickets, mode: "server" });
}

export async function PATCH(request: Request) {
  const user = await requireAdmin();
  if (user instanceof Response) return user;

  const input = updateSchema.parse(await request.json());
  const ticket = await tryUpdateAdminFeedbackTicket({ ...input, assignedAdminId: user.id });
  if (!ticket) return Response.json({ error: "反馈更新失败" }, { status: 503 });

  await tryCreateAdminAuditLog({
    adminUserId: user.id,
    action: "feedback.update",
    targetType: "feedback_ticket",
    targetId: input.id,
    detail: input,
  });

  return Response.json({ ticket, mode: "server" });
}
