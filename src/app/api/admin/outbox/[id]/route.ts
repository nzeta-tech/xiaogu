import { z } from "zod";
import { requireSessionUser } from "@/lib/auth/session";
import { previewCreditChangeEmail } from "@/lib/billing/notifications";
import { tryGetAdminCreditChangeEmailOutbox } from "@/lib/db/repositories";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  if (user.role !== "admin") return Response.json({ error: "无权查看邮件详情" }, { status: 403 });

  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return Response.json({ error: "邮件记录不存在" }, { status: 404 });
  const message = await tryGetAdminCreditChangeEmailOutbox(id);
  if (!message) return Response.json({ error: "邮件记录不存在" }, { status: 404 });

  const email = await previewCreditChangeEmail({
    name: message.user_name,
    orderId: message.order_id,
    changeLabel: message.change_label,
    deltaCredits: message.delta_credits,
    balanceAfter: message.balance_after,
    subjectOverride: message.subject_override,
    bodyOverride: message.body_override,
  });
  return Response.json({ message: { ...message, subject: email.subject, text: email.text, contentStored: Boolean(message.subject_override && message.body_override) } });
}
