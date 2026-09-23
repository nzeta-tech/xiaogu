import { recordVerifiedPayment, recordVerifiedRefund } from "@/lib/billing/paid-access";
import { verifiedStripePayment } from "@/lib/billing/paid-access-rules";
import { grantCredits } from "@/lib/billing/openmeter";
import { isDemoModeEnabled } from "@/lib/config/runtime";
import { tryFinishWebhookEvent, tryGetOrderByProvider, tryGetPaymentProvider, tryListPaymentProviders, tryMarkOrderCompleted, tryMarkOrderPaidByProvider, tryRecordWebhookEvent } from "@/lib/db/repositories";
import { query } from "@/lib/db/client";
import { constructStripeWebhookEvent } from "@/lib/payments/stripe";
import { accrueAffiliateCredits } from "@/lib/affiliate/service";
import { queueCreditChangeEmail } from "@/lib/billing/notifications";
import { hashWebhookPayload } from "@/lib/payments/provider";

export async function POST(request: Request) {
  const stripeSignature = request.headers.get("stripe-signature");

  if (stripeSignature) {
    try {
      const payload = await request.text();
      const configuredProvider = (await tryListPaymentProviders()).find((provider) => provider.providerKey === "stripe" && provider.enabled);
      const providerWithSecrets = configuredProvider ? await tryGetPaymentProvider(configuredProvider.id, true) : null;
      const event = constructStripeWebhookEvent(payload, stripeSignature, providerWithSecrets ? { secretKey: providerWithSecrets.config.secretKey, webhookSecret: providerWithSecrets.config.webhookSecret } : undefined);
      const eventRecord = await tryRecordWebhookEvent({ providerKey: "stripe", eventId: event.id, eventType: event.type, payloadHash: hashWebhookPayload(payload) });
      if (!eventRecord.accepted) return Response.json({ received: true, duplicate: true, eventType: event.type });
      await query(
        `insert into system_settings(setting_key,setting_value,updated_at)
         values ('payment_health',$1::jsonb,now())
         on conflict(setting_key) do update set setting_value=excluded.setting_value,updated_at=now()`,
        [JSON.stringify({ lastWebhookAt: new Date().toISOString(), lastEventType: event.type, ok: true })],
      );

      if (event.type === "charge.refunded" && event.livemode) {
        const charge = event.data.object;
        const reference = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
        if (reference) {
          try { await recordVerifiedRefund("stripe_live", reference, charge.amount_refunded); }
          catch {
            await tryFinishWebhookEvent({ providerKey: "stripe", eventId: event.id, status: "failed", errorMessage: "refund persistence failed" });
            return Response.json({ error: "退款资格记录失败，请重试" }, { status: 502 });
          }
        }
      }

      if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
        const session = event.data.object;
        if (session.payment_status !== "paid") {
          await tryFinishWebhookEvent({ providerKey: "stripe", eventId: event.id, status: "processed" });
          return Response.json({ received: true, awaitingPayment: true });
        }
        const expected = await query<{ id: string; amount_cents: number; currency: string; status: string }>(
          "select id,amount_cents,currency,status from orders where provider='stripe' and provider_order_id=$1", [session.id]);
        const expectedOrder = expected.rows[0];
        if (!expectedOrder || session.amount_total !== expectedOrder.amount_cents || session.currency?.toUpperCase() !== expectedOrder.currency.toUpperCase()) {
          await tryFinishWebhookEvent({ providerKey: "stripe", eventId: event.id, status: "failed", errorMessage: "order or payment amount mismatch" });
          return Response.json({ error: "支付订单或金额不匹配" }, { status: 400 });
        }
        const orderInput = {
          provider: "stripe",
          providerOrderId: session.id,
        };
        const order = await tryMarkOrderPaidByProvider(orderInput) ?? await tryGetOrderByProvider(orderInput);

        if (order && ["paid", "completed"].includes(order.status)) {
          if (verifiedStripePayment(session, expectedOrder)) {
            const reference = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
            if (!reference) {
              await tryFinishWebhookEvent({ providerKey: "stripe", eventId: event.id, status: "failed", errorMessage: "missing payment reference" });
              return Response.json({ error: "支付凭据不完整" }, { status: 400 });
            }
            try {
              await recordVerifiedPayment({ orderId: order.id, source: "stripe_live", reference, amountCents: session.amount_total!, currency: session.currency! });
            } catch {
              await tryFinishWebhookEvent({ providerKey: "stripe", eventId: event.id, status: "failed", errorMessage: "receipt persistence failed" });
              return Response.json({ error: "支付资格记录失败，请重试" }, { status: 502 });
            }
          }
          const grant = order.status === "completed" ? { ok: true, duplicate: true } : await grantCredits({
            customerId: order.user_id,
            amount: order.quota_amount,
            reason: "stripe_checkout_completed",
            eventId: event.id,
            metadata: {
              orderId: order.id,
              stripeSessionId: session.id,
            },
          });

          if (!grant.ok) {
            await tryFinishWebhookEvent({ providerKey: "stripe", eventId: event.id, status: "failed", errorMessage: "credit grant failed" });
            return Response.json({ error: "积分发放失败，等待支付平台重试" }, { status: 502 });
          }
          await tryMarkOrderCompleted(order.id);
          await queueCreditChangeEmail({ eventKey: `payment:${order.id}`, userId: order.user_id, orderId: order.id, deltaCredits: order.quota_amount, changeKind: "purchase", changeLabel: "充值" });
          const affiliate = await accrueAffiliateCredits({
            orderId: order.id,
            inviteeUserId: order.user_id,
            purchasedCredits: order.quota_amount,
          });
          await tryFinishWebhookEvent({ providerKey: "stripe", eventId: event.id, status: "processed" });
          return Response.json({ received: true, eventType: event.type, order, grant, affiliate });
        }
      }

      await tryFinishWebhookEvent({ providerKey: "stripe", eventId: event.id, status: "processed" });
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
