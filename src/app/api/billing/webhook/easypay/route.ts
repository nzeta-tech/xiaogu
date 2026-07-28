import { createHash } from "node:crypto";
import { grantCredits } from "@/lib/billing/openmeter";
import { accrueAffiliateCredits } from "@/lib/affiliate/service";
import { queueCreditChangeEmail } from "@/lib/billing/notifications";
import { tryFinishWebhookEvent, tryGetOrderByProvider, tryGetPaymentProvider, tryListPaymentProviders, tryMarkOrderCompleted, tryMarkOrderPaidByProvider, tryRecordWebhookEvent } from "@/lib/db/repositories";

function sign(values: Record<string, string>, key: string) {
  const raw = Object.keys(values).filter((item) => item !== "sign" && values[item] !== "").sort().map((item) => `${item}=${values[item]}`).join("&");
  return createHash("md5").update(`${raw}${key}`).digest("hex");
}

export async function POST(request: Request) {
  const body = await request.text();
  const values = Object.fromEntries(new URLSearchParams(body).entries());
  const provider = (await tryListPaymentProviders()).find((item) => item.providerKey === "easypay" && item.enabled);
  const configured = provider ? await tryGetPaymentProvider(provider.id, true) : null;
  if (!configured?.config.pkey || !values.out_trade_no) return new Response("fail", { status: 400 });
  if (values.sign && values.sign.toLowerCase() !== sign(values, configured.config.pkey).toLowerCase()) return new Response("fail", { status: 400 });
  if (!["TRADE_SUCCESS", "SUCCESS", "1"].includes(String(values.trade_status ?? "").toUpperCase())) return new Response("success");
  const eventId = values.trade_no || values.out_trade_no;
  const event = await tryRecordWebhookEvent({ providerKey: "easypay", eventId, eventType: "payment.success", payloadHash: createHash("sha256").update(body).digest("hex") });
  if (!event.accepted) return new Response("success");
  const order = await tryMarkOrderPaidByProvider({ provider: "alipay", providerOrderId: values.out_trade_no }) ?? await tryMarkOrderPaidByProvider({ provider: "wechat", providerOrderId: values.out_trade_no }) ?? await tryGetOrderByProvider({ provider: "alipay", providerOrderId: values.out_trade_no }) ?? await tryGetOrderByProvider({ provider: "wechat", providerOrderId: values.out_trade_no });
  if (!order) { await tryFinishWebhookEvent({ providerKey: "easypay", eventId, status: "failed", errorMessage: "order not found" }); return new Response("fail", { status: 404 }); }
  const grant = await grantCredits({ customerId: order.user_id, amount: order.quota_amount, reason: "easypay_payment_success", eventId: `easypay:${eventId}`, metadata: { orderId: order.id, providerOrderId: values.trade_no ?? "" } });
  if (!grant.ok) { await tryFinishWebhookEvent({ providerKey: "easypay", eventId, status: "failed", errorMessage: "credit grant failed" }); return new Response("fail", { status: 502 }); }
  await tryMarkOrderCompleted(order.id);
  await queueCreditChangeEmail({ eventKey: `payment:${order.id}`, userId: order.user_id, orderId: order.id, deltaCredits: order.quota_amount, changeKind: "purchase", changeLabel: "充值" });
  await accrueAffiliateCredits({ orderId: order.id, inviteeUserId: order.user_id, purchasedCredits: order.quota_amount });
  await tryFinishWebhookEvent({ providerKey: "easypay", eventId, status: "processed" });
  return new Response("success");
}
