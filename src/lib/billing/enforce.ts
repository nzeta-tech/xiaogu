import { getQuotaBalance } from "./openmeter";
import { getQuotaCost, type QuotaAction } from "./quota";
import type { SessionUser } from "@/lib/auth/session";
import { tryExpireStaleAppRuns, tryGetSystemSettings } from "@/lib/db/repositories";
import { query } from "@/lib/db/client";

export async function requireQuota(user: SessionUser, action: QuotaAction, configuredCost?: number) {
  const settings = await tryGetSystemSettings();
  if (action === "write_script") {
    await tryExpireStaleAppRuns(user.id);
  }
  if (settings.site.maintenanceMode && user.role !== "admin") {
    return { ok: false as const, response: Response.json({ error: settings.site.maintenanceMessage }, { status: 503 }), quotaCost: 0, balance: null };
  }
  if (action === "write_script" && settings.defaults.dailyCreationLimit > 0) {
    const result = await query<{ count: string }>(
      "select count(*)::text as count from app_runs where user_id=$1 and created_at>=date_trunc('day',now())",
      [user.id],
    );
    if (Number(result.rows[0]?.count ?? 0) >= settings.defaults.dailyCreationLimit) {
      return { ok: false as const, response: Response.json({ error: "今日创作次数已达到平台上限" }, { status: 429 }), quotaCost: 0, balance: null };
    }
  }
  if (action === "write_script" && settings.defaults.monthlyCreationLimit > 0) {
    const result = await query<{ count: string }>(
      "select count(*)::text as count from app_runs where user_id=$1 and created_at>=date_trunc('month',now())",
      [user.id],
    );
    if (Number(result.rows[0]?.count ?? 0) >= settings.defaults.monthlyCreationLimit) {
      return { ok: false as const, response: Response.json({ error: "本月创作次数已达到平台上限" }, { status: 429 }), quotaCost: 0, balance: null };
    }
  }
  if (action === "write_script") {
    const [running, recent] = await Promise.all([
      query<{ count: string }>("select count(*)::text as count from app_runs where user_id=$1 and status in ('queued','running')", [user.id]),
      query<{ count: string }>("select count(*)::text as count from app_runs where user_id=$1 and created_at>=now()-interval '1 minute'", [user.id]),
    ]);
    if (Number(running.rows[0]?.count ?? 0) >= settings.defaults.maxConcurrentCreations) {
      return { ok: false as const, response: Response.json({ error: "同时进行的创作任务过多，请稍后再试" }, { status: 429 }), quotaCost: 0, balance: null };
    }
    if (Number(recent.rows[0]?.count ?? 0) >= settings.defaults.creationRpmLimit) {
      return { ok: false as const, response: Response.json({ error: "创作请求过于频繁，请稍后再试" }, { status: 429 }), quotaCost: 0, balance: null };
    }
  }
  const quotaCost = configuredCost ?? getQuotaCost(action);
  if (!Number.isInteger(quotaCost) || quotaCost < 0 || quotaCost > 100000) {
    return {
      ok: false as const,
      response: Response.json({ error: "应用计价配置无效" }, { status: 503 }),
      quotaCost,
      balance: null,
    };
  }
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
