import Stripe from "stripe";
import type { BillingPlan } from "@/lib/billing/plans";

export function isStripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function getStripe() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }

  return new Stripe(secretKey, {
    appInfo: {
      name: "xiaogu-insurance-agent",
      version: "0.1.0",
    },
  });
}

export async function createStripeCheckoutSession(input: {
  orderId: string;
  userId: string;
  userEmail: string;
  plan: BillingPlan;
}) {
  const stripe = getStripe();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  return stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: input.userEmail,
    client_reference_id: input.orderId,
    success_url: `${appUrl}/billing?checkout=success&order_id=${input.orderId}`,
    cancel_url: `${appUrl}/billing?checkout=cancel&order_id=${input.orderId}`,
    metadata: {
      orderId: input.orderId,
      userId: input.userId,
      planCode: input.plan.code,
      quotaAmount: String(input.plan.quotaAmount),
    },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: input.plan.currency.toLowerCase(),
          unit_amount: input.plan.amountCents,
          product_data: {
            name: `小谷 - ${input.plan.name}`,
            description: `${input.plan.quotaAmount} 创作点数`,
          },
        },
      },
    ],
  });
}

export async function refundStripeCheckoutSession(sessionId: string) {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  const paymentIntent = typeof session.payment_intent === "string"
    ? session.payment_intent
    : session.payment_intent?.id;
  if (!paymentIntent) {
    throw new Error("该订单没有可退款的 Stripe 支付记录");
  }
  return stripe.refunds.create({ payment_intent: paymentIntent });
}

export function constructStripeWebhookEvent(payload: string, signature: string) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
  }

  return getStripe().webhooks.constructEvent(payload, signature, secret);
}
