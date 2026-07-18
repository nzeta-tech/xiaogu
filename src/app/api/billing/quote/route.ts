import { z } from "zod";
import { requireSessionUser } from "@/lib/auth/session";
import { tryGetAvailableDiscountRedemption, tryGetBillingPlan, tryGetSystemSettings, tryGetTodayPaidAmountCents } from "@/lib/db/repositories";
import { calculatePaymentAmounts, paymentAmountAllowed } from "@/lib/payments/amounts";

export async function POST(request: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  const parsed = z.object({ planCode: z.string().min(1) }).safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "套餐参数不正确" }, { status: 400 });
  const [settings, plan, discount, paidToday] = await Promise.all([tryGetSystemSettings(), tryGetBillingPlan(parsed.data.planCode), tryGetAvailableDiscountRedemption(user.id), tryGetTodayPaidAmountCents(user.id)]);
  if (!plan) return Response.json({ error: "套餐不存在" }, { status: 404 });
  const baseAmountCents = discount ? Math.max(0, Math.round(plan.amountCents * (100 - discount.discount_percent) / 100)) : plan.amountCents;
  if (!paymentAmountAllowed(baseAmountCents, settings.payment)) return Response.json({ error: "该套餐价格不在当前允许支付的金额范围内" }, { status: 403 });
  const amounts = calculatePaymentAmounts(baseAmountCents, settings.payment.feeRatePercent);
  return Response.json({ quote: { ...amounts, currency: plan.currency, quotaAmount: plan.quotaAmount, discountPercent: discount?.discount_percent ?? 0, dailyPaidAmountCents: paidToday, dailyRemainingAmountCents: settings.payment.dailyPaidAmountLimitCents > 0 ? Math.max(0, settings.payment.dailyPaidAmountLimitCents - paidToday) : null } });
}
