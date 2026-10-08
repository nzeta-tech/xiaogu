export const FREE_APP_LIMITS = {
  "image-card": { daily: 3, monthly: 30, overageCost: 5 },
} as const;

export type FreeLimitedAppSlug = keyof typeof FREE_APP_LIMITS;

export function getFreeAppLimits(slug?: string) {
  if (!slug || !(slug in FREE_APP_LIMITS)) return null;
  return FREE_APP_LIMITS[slug as FreeLimitedAppSlug];
}

export function resolveFreeAppQuotaCost(
  input: { dailyUsed: number; monthlyUsed: number },
  limits: { daily: number; monthly: number; overageCost: number },
) {
  return input.dailyUsed >= limits.daily || input.monthlyUsed >= limits.monthly ? limits.overageCost : 0;
}
