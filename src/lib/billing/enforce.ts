import { getQuotaBalance } from "./openmeter";
import { getQuotaCost, type QuotaAction } from "./quota";
import type { SessionUser } from "@/lib/auth/session";

export async function requireQuota(user: SessionUser, action: QuotaAction) {
  const quotaCost = getQuotaCost(action);
  const balance = await getQuotaBalance(user.id);

  if (balance.mode === "unconfigured") {
    return {
      ok: false as const,
      response: Response.json({ error: "计量计费服务未配置，无法商业化扣费" }, { status: 503 }),
      quotaCost,
      balance,
    };
  }

  if (!balance.hasAccess || balance.balance < quotaCost) {
    return {
      ok: false as const,
      response: Response.json({ error: "额度不足，请先充值" }, { status: 402 }),
      quotaCost,
      balance,
    };
  }

  return { ok: true as const, quotaCost, balance };
}
