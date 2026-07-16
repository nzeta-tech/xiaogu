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
    code: "starter_300",
    name: "基础包",
    quotaAmount: 300,
    amountCents: 9900,
    currency: "CNY",
    description: "适合个人经纪人试运行，每月稳定产出选题和口播稿。",
  },
  {
    code: "pro_1200",
    name: "专业包",
    quotaAmount: 1200,
    amountCents: 29900,
    currency: "CNY",
    description: "适合高频运营账号，覆盖热点、脚本、改写和合规检查。",
    recommended: true,
  },
  {
    code: "team_6000",
    name: "机构包",
    quotaAmount: 6000,
    amountCents: 129900,
    currency: "CNY",
    description: "适合经纪团队，后续可分配额度并接入审核流。",
  },
];

export const billingPlans = defaultBillingPlans;

export function getBillingPlan(code: string) {
  return defaultBillingPlans.find((plan) => plan.code === code) ?? null;
}
