import { grantCredits } from "@/lib/billing/openmeter";
import { isDemoModeEnabled } from "@/lib/config/runtime";
import { tryMarkOrderPaidByProvider } from "@/lib/db/repositories";
import { constructStripeWebhookEvent } from "@/lib/payments/stripe";

export async function POST(request: Request) {
  const stripeSignature = request.headers.get("stripe-signature");

  if (stripeSignature) {
    try {
      const payload = await request.text();
      const event = constructStripeWebhookEvent(payload, stripeSignature);

      if (event.type === "checkout.session.completed") {
        const session = event.data.object;
        const order = await tryMarkOrderPaidByProvider({
          provider: "stripe",
          providerOrderId: session.id,
        });

        if (order) {
          const grant = await grantCredits({
            customerId: order.user_id,
            amount: order.quota_amount,
            reason: "stripe_checkout_completed",
            metadata: {
              orderId: order.id,
              stripeSessionId: session.id,
            },
          });

          return Response.json({ received: true, eventType: event.type, order, grant });
        }
      }

      return Response.json({ received: true, eventType: event.type });
    } catch {
      return Response.json({ error: "Stripe webhook signature verification failed" }, { status: 400 });
    }
  }

  if (!isDemoModeEnabled()) {
    return Response.json({ error: "生产模式必须使用已验签的支付 webhook" }, { status: 400 });
  }

  const payload = (await request.json().catch(() => ({}))) as {
    userId?: string;
    quotaAmount?: number;
    provider?: string;
    providerOrderId?: string;
  };

  if (payload.userId && payload.quotaAmount) {
    const grant = await grantCredits({
      customerId: payload.userId,
      amount: payload.quotaAmount,
      reason: "payment_webhook",
      metadata: {
        provider: payload.provider ?? "demo",
        providerOrderId: payload.providerOrderId,
      },
    });

    return Response.json({
      received: true,
      grant,
      note: "Demo webhook accepted.",
    });
  }

  return Response.json({
    received: true,
    note: "No grant issued. Production should verify Stripe/WeChat/Alipay signatures and include userId/quotaAmount.",
  });
}
