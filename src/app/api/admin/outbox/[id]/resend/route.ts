import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireSessionUser } from "@/lib/auth/session";
import { previewCreditChangeEmail, queueCreditChangeEmail } from "@/lib/billing/notifications";
import { tryCreateAdminAuditLog, tryGetAdminCreditChangeEmailOutbox } from "@/lib/db/repositories";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  if (user.role !== "admin") return Response.json({ error: "无权重新发送邮件" }, { status: 403 });

  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return Response.json({ error: "邮件记录不存在" }, { status: 404 });
  const source = await tryGetAdminCreditChangeEmailOutbox(id);
  if (!source) return Response.json({ error: "邮件记录不存在" }, { status: 404 });
  if (source.user_status !== "active") return Response.json({ error: "收件人账号已停用，无法重新发送" }, { status: 409 });

  const email = await previewCreditChangeEmail({
    name: source.user_name,
    orderId: source.order_id,
    changeLabel: source.change_label,
    deltaCredits: source.delta_credits,
    balanceAfter: source.balance_after,
    subjectOverride: source.subject_override,
    bodyOverride: source.body_override,
  });
  const resent = await queueCreditChangeEmail({
    eventKey: `outbox-resend:${source.id}:${randomUUID()}`,
    userId: source.user_id,
    orderId: source.order_id,
    deltaCredits: source.delta_credits,
    changeKind: source.change_kind,
    changeLabel: source.change_label,
    subjectOverride: email.subject,
    bodyOverride: email.text,
  });
  if (!resent) return Response.json({ error: "邮件重新入队失败" }, { status: 503 });

  await tryCreateAdminAuditLog({
    adminUserId: user.id,
    action: "outbox.resend",
    targetType: "credit_change_email",
    targetId: resent.id,
    detail: { sourceOutboxId: source.id, recipient: source.user_email },
  });
  return Response.json({ ok: true, messageId: resent.id }, { status: 202 });
}
