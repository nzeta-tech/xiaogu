import { tryGetSystemSettings, tryListExpiredPendingOrders, tryReleaseDiscountRedemption } from "@/lib/db/repositories";

export async function POST(request: Request) {
  const expected = process.env.PAYMENT_RECONCILE_SECRET || process.env.CRON_SECRET;
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) return Response.json({ error: "unauthorized" }, { status: 401 });
  const settings = await tryGetSystemSettings();
  const orders = await tryListExpiredPendingOrders(settings.payment.orderTimeoutMinutes);
  await Promise.all(orders.map((order) => tryReleaseDiscountRedemption(order.id)));
  return Response.json({ ok: true, expired: orders.length, orders });
}
