export function calculatePaymentAmounts(baseAmountCents: number, feeRatePercent: number) {
  if (!Number.isInteger(baseAmountCents) || baseAmountCents < 0) throw new Error("基础支付金额无效");
  if (!Number.isFinite(feeRatePercent) || feeRatePercent < 0 || feeRatePercent > 100) throw new Error("手续费率无效");
  const feeCents = Math.ceil(baseAmountCents * feeRatePercent / 100);
  return { baseAmountCents, feeCents, finalAmountCents: baseAmountCents + feeCents };
}

export function paymentAmountAllowed(baseAmountCents: number, limits: { minOrderAmountCents: number; maxOrderAmountCents: number }) {
  return baseAmountCents >= limits.minOrderAmountCents && (limits.maxOrderAmountCents <= 0 || baseAmountCents <= limits.maxOrderAmountCents);
}
