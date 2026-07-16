import { z } from "zod";
import { requireSessionUser } from "@/lib/auth/session";
import { grantCredits, revokeCredits } from "@/lib/billing/openmeter";
import { refundStripeCheckoutSession } from "@/lib/payments/stripe";
import { tryCreateAdminAuditLog, tryListAdminOrders, tryUpdateAdminOrderStatus } from "@/lib/db/repositories";

const updateSchema = z.object({
  orderId: z.string().uuid(),
  status: z.enum(["pending", "paid", "failed", "cancelled", "refunded"]),
});

async function requireAdmin() {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  if (user.role !== "admin") return Response.json({ error: "无权访问订单管理" }, { status: 403 });
  return user;
}

export async function GET() {
  const user = await requireAdmin();
  if (user instanceof Response) return user;

  const orders = await tryListAdminOrders();
  return Response.json({ orders, mode: "server" });
}

export async function PATCH(request: Request) {
  const user = await requireAdmin();
  if (user instanceof Response) return user;

  const input = updateSchema.parse(await request.json());
  const orders = await tryListAdminOrders(500);
  const current = orders.find((order) => order.id === input.orderId);
  if (!current) return Response.json({ error: "订单不存在" }, { status: 404 });
  if (current.status === input.status) return Response.json({ order: current, mode: "server" });

  if (input.status === "paid") {
    if (current.provider === "stripe") {
      return Response.json({ error: "Stripe 订单只能由已验签 webhook 标记为已支付" }, { status: 409 });
    }
    const grant = await grantCredits({
      customerId: current.user_id,
      amount: current.quota_amount,
      reason: "admin_mark_paid",
      metadata: { orderId: current.id },
    });
    if (!grant.ok) return Response.json({ error: "积分发放失败，订单状态未修改" }, { status: 502 });
  }

  if (input.status === "refunded") {
    if (current.status !== "paid") {
      return Response.json({ error: "只有已支付订单可以退款" }, { status: 409 });
    }
    if (current.provider === "stripe") {
      if (!current.provider_order_id) return Response.json({ error: "订单缺少 Stripe 会话编号" }, { status: 409 });
      await refundStripeCheckoutSession(current.provider_order_id);
    }
    const refundedOrder = await tryUpdateAdminOrderStatus(input);
    if (!refundedOrder) return Response.json({ error: "退款已执行，但本地订单状态更新失败，请立即人工核对" }, { status: 502 });
    const revocation = await revokeCredits({
      customerId: current.user_id,
      amount: current.quota_amount,
      reason: "order_refunded",
      metadata: { orderId: current.id, provider: current.provider },
    });
    await tryCreateAdminAuditLog({
      adminUserId: user.id,
      action: "order.refund",
      targetType: "order",
      targetId: input.orderId,
      detail: { provider: current.provider, creditsRevoked: revocation.ok },
    });
    if (!revocation.ok) return Response.json({ error: "退款已完成，但远程积分回收失败，请人工核对", order: refundedOrder }, { status: 502 });
    return Response.json({ order: refundedOrder, mode: "server" });
  }

  const order = await tryUpdateAdminOrderStatus(input);
  if (!order) return Response.json({ error: "订单状态更新失败" }, { status: 503 });

  await tryCreateAdminAuditLog({
    adminUserId: user.id,
    action: "order.update_status",
    targetType: "order",
    targetId: input.orderId,
    detail: { status: input.status },
  });

  return Response.json({ order, mode: "server" });
}
