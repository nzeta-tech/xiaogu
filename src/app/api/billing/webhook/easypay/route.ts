import { query } from "@/lib/db/client";
import { recordVerifiedPayment } from "@/lib/billing/paid-access";
import { parsePaymentCents } from "@/lib/billing/paid-access-rules";
import { verifyEasypaySignature } from "@/lib/payments/easypay-verification";
import { createHash } from "node:crypto";
import { grantCredits } from "@/lib/billing/openmeter";
import { accrueAffiliateCredits } from "@/lib/affiliate/service";
import { queueCreditChangeEmail } from "@/lib/billing/notifications";
import { tryFinishWebhookEvent, tryGetPaymentProvider, tryListPaymentProviders, tryMarkOrderCompleted, tryRecordWebhookEvent } from "@/lib/db/repositories";

export async function POST(request: Request) {
  const body = await request.text();
  const values = Object.fromEntries(new URLSearchParams(body).entries());
  const expected = await query<{ id: string; provider_instance_id: string | null; amount_cents: number; currency: string }>(
    "select id,provider_instance_id,amount_cents,currency from orders where provider in ('alipay','wechat') and (id::text=$1 or provider_order_id=$1)", [values.out_trade_no ?? ""]);
  const expectedOrder = expected.rows[0];
  const provider = expectedOrder?.provider_instance_id ? { id: expectedOrder.provider_instance_id } : (await tryListPaymentProviders()).find(item => item.providerKey === "easypay" && item.enabled);
  const configured = provider ? await tryGetPaymentProvider(provider.id, true) : null;
  if (!configured?.config.pkey || !values.out_trade_no) return new Response("fail", { status: 400 });
  if (!verifyEasypaySignature(values, configured.config.pkey)) return new Response("fail", { status: 400 });
  if (configured.config.pid && values.pid !== configured.config.pid) return new Response("fail", { status: 400 });
  if (!expectedOrder || parsePaymentCents(values.money ?? "") !== expectedOrder.amount_cents || expectedOrder.currency.toUpperCase() !== "CNY" || !values.trade_no) return new Response("fail", { status: 400 });
  if (!["TRADE_SUCCESS", "SUCCESS", "1"].includes(String(values.trade_status ?? "").toUpperCase())) return new Response("success");
  const eventId = values.trade_no || values.out_trade_no;
  const event = await tryRecordWebhookEvent({ providerKey: "easypay", eventId, eventType: "payment.success", payloadHash: createHash("sha256").update(body).digest("hex") });
  if (!event.accepted) return new Response("success");
  await query("update orders set status='paid',paid_at=coalesce(paid_at,now()) where id=$1 and status='pending'", [expectedOrder.id]);
  const orderResult = await query<{ id: string; user_id: string; quota_amount: number; status: string }>("select id,user_id,quota_amount,status from orders where id=$1", [expectedOrder.id]);
  const order = orderResult.rows[0];
  if (!order) { await tryFinishWebhookEvent({ providerKey: "easypay", eventId, status: "failed", errorMessage: "order not found" }); return new Response("fail", { status: 404 }); }
  if (!["paid", "completed"].includes(order.status)) {
    await tryFinishWebhookEvent({ providerKey: "easypay", eventId, status: "processed" });
    return new Response("success");
  }
  try {
    await recordVerifiedPayment({ orderId: order.id, source: "easypay_verified", reference: values.trade_no, amountCents: expectedOrder.amount_cents, currency: "CNY" });
  } catch {
    await tryFinishWebhookEvent({ providerKey: "easypay", eventId, status: "failed", errorMessage: "receipt persistence failed" });
    return new Response("fail", { status: 502 });
  }
  const grant = order.status === "completed" ? { ok: true, duplicate: true } : await grantCredits({ customerId: order.user_id, amount: order.quota_amount, reason: "easypay_payment_success", eventId: `easypay:${eventId}`, metadata: { orderId: order.id, providerOrderId: values.trade_no ?? "" } });
  if (!grant.ok) { await tryFinishWebhookEvent({ providerKey: "easypay", eventId, status: "failed", errorMessage: "credit grant failed" }); return new Response("fail", { status: 502 }); }
  await tryMarkOrderCompleted(order.id);
  await queueCreditChangeEmail({ eventKey: `payment:${order.id}`, userId: order.user_id, orderId: order.id, deltaCredits: order.quota_amount, changeKind: "purchase", changeLabel: "充值" });
  await accrueAffiliateCredits({ orderId: order.id, inviteeUserId: order.user_id, purchasedCredits: order.quota_amount });
  await tryFinishWebhookEvent({ providerKey: "easypay", eventId, status: "processed" });
  return new Response("success");
}
