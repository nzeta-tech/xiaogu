import { z } from "zod";
import { requireSessionUser } from "@/lib/auth/session";
import { tryCreateFeedbackTicket, tryGetSystemSettings, tryListUserFeedbackTickets } from "@/lib/db/repositories";

const schema = z.object({
  title: z.string().trim().min(1).max(120),
  content: z.string().trim().min(1).max(3000),
  category: z.enum(["general", "bug", "billing", "content", "account"]).default("general"),
  priority: z.enum(["low", "normal", "high"]).default("normal"),
});

export async function GET() {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  if (!(await tryGetSystemSettings()).features.feedbackEnabled) return Response.json({ error: "反馈功能当前已关闭" }, { status: 403 });

  const tickets = await tryListUserFeedbackTickets(user.id);
  return Response.json({ tickets, mode: "server" });
}

export async function POST(request: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  if (!(await tryGetSystemSettings()).features.feedbackEnabled) return Response.json({ error: "反馈功能当前已关闭" }, { status: 403 });

  const input = schema.parse(await request.json());
  const ticket = await tryCreateFeedbackTicket({ userId: user.id, ...input });
  if (!ticket) return Response.json({ error: "反馈提交失败" }, { status: 503 });

  return Response.json({ ticket, mode: "server" });
}
