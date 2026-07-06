import { z } from "zod";
import { requireSessionUser } from "@/lib/auth/session";
import { getBillingPlan } from "@/lib/billing/plans";
import { grantCredits } from "@/lib/billing/openmeter";
import { tryCreateOrder, tryListOrders, tryUpdateOrderCheckout } from "@/lib/db/repositories";
import { createStripeCheckoutSession, isStripeConfigured } from "@/lib/payments/stripe";
import { isDemoModeEnabled } from "@/lib/config/runtime";

const createOrderSchema = z
  .object({
    planCode: z.string().min(1).optional(),
    planId: z.string().min(1).optional(),
    provider: z.enum(["demo", "stripe", "wechat", "alipay"]).default("stripe"),
  })
  .transform((input) => ({
    planCode: input.planCode ?? input.planId,
    provider: input.provider,
  }))
  .pipe(
    z.object({
      planCode: z.string().min(1),
      provider: z.enum(["demo", "stripe", "wechat", "alipay"]),
    }),
  );

export async function GET() {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const orders = await tryListOrders(user.id);
  return Response.json({ orders, mode: "server" });
}

export async function POST(request: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const input = createOrderSchema.parse(await request.json());
  if (input.provider === "demo" && !isDemoModeEnabled()) {
    return Response.json({ error: "生产模式已关闭 demo 充值，请使用真实支付通道" }, { status: 403 });
  }

  if (input.provider === "wechat" || input.provider === "alipay") {
    return Response.json({ error: "微信/支付宝通道尚未接入真实支付网关" }, { status: 501 });
  }

  const plan = getBillingPlan(input.planCode);

  if (!plan) {
    return Response.json({ error: "套餐不存在" }, { status: 404 });
  }

  const order = await tryCreateOrder({
    userId: user.id,
    provider: input.provider,
    plan,
    status: input.provider === "demo" ? "paid" : "pending",
    metadata: { checkoutMode: input.provider === "demo" ? "instant_grant" : "redirect" },
  });

  if (!order) {
    return Response.json({ error: "数据库不可用，无法创建支付订单" }, { status: 503 });
  }

  if (input.provider === "demo") {
    await grantCredits({
      customerId: user.id,
      amount: plan.quotaAmount,
      reason: "demo_order",
      metadata: { planCode: plan.code, orderId: order?.id ?? "demo-order" },
    });
  }

  if (input.provider === "stripe") {
    if (!isStripeConfigured()) {
      return Response.json({ error: "Stripe 未配置，请检查 STRIPE_SECRET_KEY" }, { status: 503 });
    }

    const session = await createStripeCheckoutSession({
      orderId: order.id,
      userId: user.id,
      userEmail: user.email,
      plan,
    });
    await tryUpdateOrderCheckout({
      orderId: order.id,
      providerOrderId: session.id,
      checkoutUrl: session.url,
    });

    return Response.json({
      order: { ...order, provider_order_id: session.id, checkout_url: session.url },
      checkout: {
        mode: "stripe",
        url: session.url,
      },
    });
  }

  return Response.json({
    order,
    checkout: {
      mode: input.provider,
      url: null,
    },
  });
}
