import { z } from "zod";
import { requireSessionUser } from "@/lib/auth/session";
import { grantCredits } from "@/lib/billing/openmeter";
import { tryConsumeDiscountRedemption, tryCountPendingOrders, tryCreateOrder, tryExpirePendingOrders, tryGetAvailableDiscountRedemption, tryGetBillingPlan, tryGetSystemSettings, tryGetTodayPaidAmountCents, tryListOrders, tryReleaseDiscountRedemption, tryUpdateAdminOrderStatus, tryUpdateOrderCheckout } from "@/lib/db/repositories";
import { createStripeCheckoutSession, isStripeConfigured } from "@/lib/payments/stripe";
import { isDemoModeEnabled } from "@/lib/config/runtime";
import { accrueAffiliateCredits } from "@/lib/affiliate/service";
import { calculatePaymentAmounts, paymentAmountAllowed } from "@/lib/payments/amounts";

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
  const settings = await tryGetSystemSettings();
  if (settings.site.maintenanceMode && user.role !== "admin") return Response.json({ error: settings.site.maintenanceMessage }, { status: 503 });
  if (input.provider === "stripe" && settings.payment.enableStripe === false) {
    return Response.json({ error: "在线支付暂未开放" }, { status: 403 });
  }
  if (input.provider === "demo" && !isDemoModeEnabled()) {
    return Response.json({ error: "生产模式已关闭 demo 充值，请使用真实支付通道" }, { status: 403 });
  }

  if (input.provider === "wechat" || input.provider === "alipay") {
    return Response.json({ error: "微信/支付宝通道尚未接入真实支付网关" }, { status: 501 });
  }

  const plan = await tryGetBillingPlan(input.planCode);

  if (!plan) {
    return Response.json({ error: "套餐不存在" }, { status: 404 });
  }
  if (plan.quotaAmount < settings.payment.minPurchaseCredits || plan.quotaAmount > settings.payment.maxPurchaseCredits) {
    return Response.json({ error: "该套餐不在当前允许购买的积分范围内" }, { status: 403 });
  }
  const expiredOrderIds = await tryExpirePendingOrders(user.id, settings.payment.orderTimeoutMinutes);
  await Promise.all(expiredOrderIds.map((orderId) => tryReleaseDiscountRedemption(orderId)));
  if (await tryCountPendingOrders(user.id) >= settings.payment.maxPendingOrders) {
    return Response.json({ error: "待支付订单过多，请先完成或等待旧订单超时" }, { status: 429 });
  }
  if (input.provider === "stripe" && !isStripeConfigured()) {
    return Response.json({ error: "Stripe 未配置，请检查 STRIPE_SECRET_KEY" }, { status: 503 });
  }

  const discount = await tryGetAvailableDiscountRedemption(user.id);
  const effectivePlan = discount
    ? { ...plan, amountCents: Math.max(0, Math.round(plan.amountCents * (100 - discount.discount_percent) / 100)) }
    : plan;
  const baseAmountCents = effectivePlan.amountCents;
  if (!paymentAmountAllowed(baseAmountCents, settings.payment)) {
    return Response.json({ error: "该套餐价格不在当前允许支付的金额范围内" }, { status: 403 });
  }
  const { feeCents, finalAmountCents } = calculatePaymentAmounts(baseAmountCents, settings.payment.feeRatePercent);
  if (settings.payment.dailyPaidAmountLimitCents > 0) {
    const paidToday = await tryGetTodayPaidAmountCents(user.id);
    if (paidToday + finalAmountCents > settings.payment.dailyPaidAmountLimitCents) {
      return Response.json({ error: "今日支付金额已达到平台限制" }, { status: 429 });
    }
  }
  effectivePlan.amountCents = finalAmountCents;

  const order = await tryCreateOrder({
    userId: user.id,
    provider: input.provider,
    plan: effectivePlan,
    status: input.provider === "demo" ? "paid" : "pending",
    baseAmountCents,
    feeCents,
    metadata: { checkoutMode: input.provider === "demo" ? "instant_grant" : "redirect", originalAmountCents: plan.amountCents, baseAmountCents, feeCents, feeRatePercent: settings.payment.feeRatePercent, promoCode: discount?.code ?? null, discountPercent: discount?.discount_percent ?? 0 },
  });

  if (!order) {
    return Response.json({ error: "数据库不可用，无法创建支付订单" }, { status: 503 });
  }
  if (discount) {
    const consumed = await tryConsumeDiscountRedemption({ redemptionId: discount.id, userId: user.id, orderId: order.id });
    if (!consumed) {
      await tryUpdateAdminOrderStatus({ orderId: order.id, status: "failed", expectedStatus: order.status });
      return Response.json({ error: "优惠权益状态已变化，请刷新后重试" }, { status: 409 });
    }
  }

  if (input.provider === "demo") {
    await grantCredits({
      customerId: user.id,
      amount: effectivePlan.quotaAmount,
      reason: "demo_order",
      metadata: { planCode: plan.code, orderId: order?.id ?? "demo-order" },
    });
    if (order) {
      await accrueAffiliateCredits({ orderId: order.id, inviteeUserId: user.id, purchasedCredits: effectivePlan.quotaAmount });
    }
  }

  if (input.provider === "stripe") {
    let session;
    try {
      session = await createStripeCheckoutSession({ orderId: order.id, userId: user.id, userEmail: user.email, plan: effectivePlan, productName: settings.payment.productName });
    } catch {
      await tryUpdateAdminOrderStatus({ orderId: order.id, status: "failed", expectedStatus: "pending" });
      await tryReleaseDiscountRedemption(order.id);
      return Response.json({ error: "支付会话创建失败，请稍后重试" }, { status: 502 });
    }
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
