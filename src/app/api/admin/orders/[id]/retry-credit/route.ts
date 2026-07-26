import { requireSessionUser } from "@/lib/auth/session";
import { grantCredits } from "@/lib/billing/openmeter";
import { accrueAffiliateCredits } from "@/lib/affiliate/service";
import { tryCreateAdminAuditLog, tryGetOrderForCreditRetry, tryMarkOrderCompleted } from "@/lib/db/repositories";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  if (user.role !== "admin") return Response.json({ error: "无权重试积分到账" }, { status: 403 });
  const { id } = await context.params;
  const order = await tryGetOrderForCreditRetry(id);
  if (!order || !["paid", "failed", "completed"].includes(order.status)) return Response.json({ error: "订单不存在或状态不支持重试" }, { status: 404 });
  const grant = await grantCredits({ customerId: order.user_id, amount: order.quota_amount, reason: "admin_credit_retry", eventId: `order-credit:${order.id}`, metadata: { orderId: order.id } });
  if (!grant.ok) return Response.json({ error: "积分发放失败" }, { status: 502 });
  await tryMarkOrderCompleted(order.id);
  await accrueAffiliateCredits({ orderId: order.id, inviteeUserId: order.user_id, purchasedCredits: order.quota_amount });
  await tryCreateAdminAuditLog({ adminUserId: user.id, action: "order.credit_retry", targetType: "order", targetId: order.id, detail: {} });
  return Response.json({ ok: true, grant });
}
