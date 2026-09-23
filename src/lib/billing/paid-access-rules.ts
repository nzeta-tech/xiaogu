export type AppAccessPolicy = "credits" | "paid_customer";
export const PAID_CUSTOMER_MESSAGE = "本应用仅向充值用户开放，请先完成真实充值。赠送积分不计入充值资格，解锁后生成仍需消耗积分。";

export function validPaidReceipt(input: { status: string; amountCents: number; refundedCents: number }) {
  return ["paid", "completed"].includes(input.status)
    && Number.isSafeInteger(input.amountCents) && input.amountCents > 0
    && Number.isSafeInteger(input.refundedCents) && input.refundedCents >= 0
    && input.amountCents > input.refundedCents;
}

export function verifiedStripePayment(session: { livemode?: boolean; payment_status?: string; amount_total?: number | null; currency?: string | null }, order: { amount_cents: number; currency: string }) {
  return session.livemode === true && session.payment_status === "paid"
    && Number.isSafeInteger(session.amount_total) && Number(session.amount_total) > 0
    && session.amount_total === order.amount_cents
    && session.currency?.toUpperCase() === order.currency.toUpperCase();
}

export function parsePaymentCents(value: string) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}
