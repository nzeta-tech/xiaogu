import { createHash } from "node:crypto";
import { getStripeWithSecret } from "@/lib/payments/stripe";
import type { PaymentProviderInstance } from "@/lib/db/repositories";

export type PaymentCheckout = { providerOrderId: string; checkoutUrl?: string | null; qrCode?: string | null; mode: "redirect" | "qrcode" | "manual" };
export type PaymentCreateInput = { orderId: string; amountCents: number; currency: string; userEmail: string; productName: string; quotaAmount: number; appUrl: string };

export async function createProviderPayment(provider: PaymentProviderInstance, input: PaymentCreateInput): Promise<PaymentCheckout> {
  if (provider.providerKey === "stripe") {
    const stripe = getStripeWithSecret(provider.config.secretKey);
    const session = await stripe.checkout.sessions.create({
      mode: "payment", customer_email: input.userEmail, client_reference_id: input.orderId,
      success_url: `${input.appUrl}/billing?checkout=success&order_id=${input.orderId}`,
      cancel_url: `${input.appUrl}/billing?checkout=cancel&order_id=${input.orderId}`,
      metadata: { orderId: input.orderId, quotaAmount: String(input.quotaAmount) },
      line_items: [{ quantity: 1, price_data: { currency: input.currency.toLowerCase(), unit_amount: input.amountCents, product_data: { name: input.productName, description: `${input.quotaAmount} 创作点数` } } }],
    });
    return { providerOrderId: session.id, checkoutUrl: session.url, mode: "redirect" };
  }
  if (provider.providerKey === "easypay") {
    const url = provider.config.apiBase?.replace(/\/$/, "") || "";
    if (!url || !provider.config.pid || !provider.config.pkey) throw new Error("EasyPay 配置不完整");
    const response = await fetch(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ pid: provider.config.pid, pkey: provider.config.pkey, out_trade_no: input.orderId, money: (input.amountCents / 100).toFixed(2), name: input.productName, notify_url: `${input.appUrl}/api/billing/webhook/easypay`, return_url: `${input.appUrl}/billing`, type: "alipay" }) });
    if (!response.ok) throw new Error(`EasyPay 创建订单失败：${response.status}`);
    const payload = await response.json().catch(() => ({})) as { payurl?: string; qrcode?: string; trade_no?: string };
    return { providerOrderId: payload.trade_no || input.orderId, checkoutUrl: payload.payurl, qrCode: payload.qrcode, mode: payload.qrcode ? "qrcode" : "redirect" };
  }
  throw new Error(`${provider.providerKey} 已完成配置模型，但尚未配置可用支付 SDK/商户能力`);
}

export function hashWebhookPayload(payload: string) { return createHash("sha256").update(payload).digest("hex"); }
