import { requireSessionUser } from "@/lib/auth/session";
import { tryGetPaymentProvider } from "@/lib/db/repositories";
import { getStripeWithSecret } from "@/lib/payments/stripe";
import { query } from "@/lib/db/client";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  if (user.role !== "admin") return Response.json({ error: "无权检测服务商" }, { status: 403 });
  const { id } = await context.params;
  const provider = await tryGetPaymentProvider(id, true);
  if (!provider) return Response.json({ error: "服务商不存在" }, { status: 404 });
  try {
    if (provider.providerKey === "stripe") await getStripeWithSecret(provider.config.secretKey).balance.retrieve();
    else if (provider.providerKey === "airwallex" && provider.config.apiBase && provider.config.apiKey) await fetch(`${provider.config.apiBase.replace(/\/$/, "")}/authentication/login`, { method: "POST", signal: AbortSignal.timeout(5000) });
    else if (!["easypay", "alipay", "wxpay"].includes(provider.providerKey)) throw new Error("服务商类型不支持健康检查");
    await query(`update payment_provider_instances set last_health_status='healthy',last_health_checked_at=now(),last_error='' where id=$1`, [id]);
    return Response.json({ ok: true, status: "healthy" });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "健康检查失败";
    await query(`update payment_provider_instances set last_health_status='failed',last_health_checked_at=now(),last_error=$2 where id=$1`, [id, message]).catch(() => undefined);
    return Response.json({ ok: false, status: "failed", error: message }, { status: 502 });
  }
}
