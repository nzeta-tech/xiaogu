export const FREE_APP_LIMITS = {
  "image-card": { daily: 3, monthly: 30 },
} as const;

export type FreeLimitedAppSlug = keyof typeof FREE_APP_LIMITS;

export function getFreeAppLimits(slug?: string) {
  if (!slug || !(slug in FREE_APP_LIMITS)) return null;
  return FREE_APP_LIMITS[slug as FreeLimitedAppSlug];
}

export function freeAppLimitError(input: { dailyUsed: number; monthlyUsed: number }, limits: { daily: number; monthly: number }) {
  if (input.dailyUsed >= limits.daily) return `今日免费创作次数已用完（每天 ${limits.daily} 次），明天可继续使用。`;
  if (input.monthlyUsed >= limits.monthly) return `本月免费创作次数已用完（每月 ${limits.monthly} 次），下月可继续使用。`;
  return null;
}
