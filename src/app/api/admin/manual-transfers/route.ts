import { z } from "zod";
import { requireSessionUser } from "@/lib/auth/session";
import { grantCredits } from "@/lib/billing/openmeter";
import { accrueAffiliateCredits } from "@/lib/affiliate/service";
import { queueCreditChangeEmail } from "@/lib/billing/notifications";
import { tryCreateAdminAuditLog, tryGetOrderForCreditRetry, tryListManualReviews, tryMarkOrderCompleted, tryReviewManualTransfer, tryUpdateAdminOrderStatus } from "@/lib/db/repositories";

async function requireAdmin() { const user = await requireSessionUser(); if (user instanceof Response) return user; return user.role === "admin" ? user : Response.json({ error: "无权审核手工转账" }, { status: 403 }); }

export async function GET(request: Request) {
  const user = await requireAdmin(); if (user instanceof Response) return user;
  return Response.json({ reviews: await tryListManualReviews(new URL(request.url).searchParams.get("status") ?? undefined) });
}

export async function PATCH(request: Request) {
  const user = await requireAdmin(); if (user instanceof Response) return user;
  const parsed = z.object({ orderId: z.string().uuid(), status: z.enum(["approved", "rejected"]), note: z.string().trim().max(1000).optional() }).safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "审核参数不正确" }, { status: 400 });
  const order = await tryGetOrderForCreditRetry(parsed.data.orderId);
  if (!order || order.provider !== "manual") return Response.json({ error: "手工订单不存在" }, { status: 404 });
  if (parsed.data.status === "rejected") {
    await tryReviewManualTransfer({ ...parsed.data, adminUserId: user.id });
    await tryUpdateAdminOrderStatus({ orderId: order.id, status: "failed", expectedStatus: "pending" });
    await tryCreateAdminAuditLog({ adminUserId: user.id, action: "manual_transfer.reject", targetType: "order", targetId: order.id, detail: { note: parsed.data.note ?? "" } });
    return Response.json({ ok: true });
  }
  if (order.status !== "pending") return Response.json({ error: "订单状态已变化" }, { status: 409 });
  const reviewed = await tryReviewManualTransfer({ ...parsed.data, adminUserId: user.id });
  if (!reviewed) return Response.json({ error: "审核记录已被处理" }, { status: 409 });
  const paid = await tryUpdateAdminOrderStatus({ orderId: order.id, status: "paid", expectedStatus: "pending" });
  if (!paid) return Response.json({ error: "订单状态更新失败" }, { status: 409 });
  const grant = await grantCredits({ customerId: order.user_id, amount: order.quota_amount, reason: "manual_transfer_approved", eventId: `manual:${order.id}`, metadata: { orderId: order.id } });
  if (!grant.ok) return Response.json({ error: "积分发放失败，可稍后重试" }, { status: 502 });
  await tryMarkOrderCompleted(order.id);
  await queueCreditChangeEmail({ eventKey: `payment:${order.id}`, userId: order.user_id, orderId: order.id, deltaCredits: order.quota_amount, changeKind: "purchase", changeLabel: "充值" });
  await accrueAffiliateCredits({ orderId: order.id, inviteeUserId: order.user_id, purchasedCredits: order.quota_amount });
  await tryCreateAdminAuditLog({ adminUserId: user.id, action: "manual_transfer.approve", targetType: "order", targetId: order.id, detail: { note: parsed.data.note ?? "" } });
  return Response.json({ ok: true, grant });
}
