import { z } from "zod";
import { requireSessionUser } from "@/lib/auth/session";
import { tryGetSystemSettings } from "@/lib/db/repositories";
import { tryGetOrderForCreditRetry, tryUpsertManualReview } from "@/lib/db/repositories";

const schema = z.object({ orderId: z.string().uuid(), receiptUrl: z.string().trim().max(2000).optional(), note: z.string().trim().max(1000).optional() });

export async function POST(request: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  const settings = await tryGetSystemSettings();
  if (!settings.payment.enableManualTransfer) return Response.json({ error: "手工转账暂未开放" }, { status: 403 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "订单信息不正确" }, { status: 400 });
  const order = await tryGetOrderForCreditRetry(parsed.data.orderId);
  if (!order || order.user_id !== user.id) return Response.json({ error: "订单不存在" }, { status: 404 });
  if (order.provider !== "manual" || order.status !== "pending") return Response.json({ error: "该订单不支持手工转账提交" }, { status: 409 });
  const review = await tryUpsertManualReview({ orderId: order.id, userId: user.id, receiptUrl: parsed.data.receiptUrl, userNote: parsed.data.note });
  if (!review) return Response.json({ error: "付款凭证提交失败" }, { status: 503 });
  return Response.json({ review });
}
