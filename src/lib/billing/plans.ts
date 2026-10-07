export type BillingPlan = {
  code: string;
  name: string;
  quotaAmount: number;
  amountCents: number;
  currency: "CNY" | "USD";
  description: string;
  recommended?: boolean;
};

export type BillingPlanPresentation = {
  description: string;
  usageExamples: readonly string[];
};

const billingPlanPresentations: Record<string, BillingPlanPresentation> = {
  trial_29: {
    description: "适合初次体验，先完成一轮轻量创作。",
    usageExamples: ["最多 5 次普通创作", "或 1 次重型创作 + 2 次普通创作", "知识卡片永久免费"],
  },
  creator_100: {
    description: "适合个人创作者的日常内容更新。",
    usageExamples: ["最多 20 次普通创作", "或 6 次重型创作", "或 3 次基础口播视频"],
  },
  professional_300: {
    description: "适合账号持续运营与批量内容生产。",
    usageExamples: ["最多 60 次普通创作", "或 20 次重型创作", "或 10 次基础口播视频"],
  },
  team_1000: {
    description: "适合工作室与团队的高频创作需求。",
    usageExamples: ["最多 200 次普通创作", "或 66 次重型创作", "或 33 次基础口播视频"],
  },
};

export function getBillingPlanPresentation(plan: Pick<BillingPlan, "code" | "description">): BillingPlanPresentation {
  return billingPlanPresentations[plan.code] ?? {
    description: plan.description,
    usageExamples: ["普通创作 5 积分/次", "重型创作 15 积分/次", "口播视频 30/50 积分/次"],
  };
}

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
