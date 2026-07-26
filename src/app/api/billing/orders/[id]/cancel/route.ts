import { requireSessionUser } from "@/lib/auth/session";
import { tryGetSystemSettings, tryReleaseDiscountRedemption, tryUpdateAdminOrderStatus } from "@/lib/db/repositories";
import { query } from "@/lib/db/client";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  const { id } = await context.params;
  const settings = await tryGetSystemSettings();
  const owned = await query<{ user_id: string; status: string }>("select user_id,status from orders where id=$1", [id]);
  if (!owned.rows[0] || owned.rows[0].user_id !== user.id) return Response.json({ error: "订单不存在" }, { status: 404 });
  if (owned.rows[0].status !== "pending") return Response.json({ error: "只有待支付订单可以取消" }, { status: 409 });
  if (settings.payment.cancelRateLimitEnabled) {
    const result = await query<{ count: string }>(`select count(*)::text as count from orders where user_id=$1 and status='cancelled' and cancelled_at > now()-($2||' minutes')::interval`, [user.id, settings.payment.cancelRateLimitWindowMinutes]).catch(() => ({ rows: [{ count: "0" }] }));
    if (Number(result.rows[0]?.count ?? 0) >= settings.payment.cancelRateLimitMax) return Response.json({ error: "取消订单次数过多，请稍后再试" }, { status: 429 });
  }
  const updated = await tryUpdateAdminOrderStatus({ orderId: id, status: "cancelled", expectedStatus: "pending" });
  if (!updated) return Response.json({ error: "订单不存在或已完成" }, { status: 409 });
  await tryReleaseDiscountRedemption(id);
  return Response.json({ order: updated });
}
