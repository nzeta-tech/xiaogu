export type ExclusiveAccessMode = "auto" | "granted" | "blocked";
export type ExclusiveAccessSource = "payment" | "manual" | "blocked" | "none";
export const EXCLUSIVE_ACCESS_BLOCKED_MESSAGE = "该账号的专享应用使用权限已暂停，请联系管理员处理。充值不会解除此限制。";

export function resolveExclusiveAccess(paid: boolean, override: { mode: ExclusiveAccessMode; expiresAt: string | null }, now = Date.now()): { eligible: boolean; source: ExclusiveAccessSource; expired: boolean } {
  const expired = override.mode === "granted" && override.expiresAt !== null
    && !(new Date(override.expiresAt).getTime() > now);
  if (override.mode === "blocked") return { eligible: false, source: "blocked", expired: false };
  if (override.mode === "granted" && !expired) return { eligible: true, source: "manual", expired: false };
  return { eligible: paid, source: paid ? "payment" : "none", expired };
}
