export type BillingPlan = {
  code: string;
  name: string;
  quotaAmount: number;
  amountCents: number;
  currency: "CNY" | "USD";
  description: string;
  recommended?: boolean;
};

export const defaultBillingPlans: BillingPlan[] = [
  {
    code: "trial_29",
    name: "体验包",
    quotaAmount: 29,
    amountCents: 2990,
    currency: "CNY",
    description: "低门槛体验小谷的完整创作能力。",
  },
  {
    code: "creator_100",
    name: "创作包",
    quotaAmount: 100,
    amountCents: 9990,
    currency: "CNY",
    description: "适合日常文案、选题和内容制作。",
  },
  {
    code: "professional_300",
    name: "专业包",
    quotaAmount: 300,
    amountCents: 29990,
    currency: "CNY",
    description: "适合持续运营和口播视频生产。",
  },
  {
    code: "team_1000",
    name: "团队包",
    quotaAmount: 1000,
    amountCents: 99990,
    currency: "CNY",
    description: "适合工作室及团队高频使用。",
  },
];

export const billingPlans = defaultBillingPlans;

export function getBillingPlan(code: string) {
  return defaultBillingPlans.find((plan) => plan.code === code) ?? null;
}
