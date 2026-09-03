export const contentDomains = ["general", "finance", "wealth", "insurance", "hybrid"] as const;

export type ContentDomain = typeof contentDomains[number];
export type DomainSource = "user" | "app" | "coach" | "profile" | "inferred";

export type DomainScores = Record<"finance" | "wealth" | "insurance" | "general", number>;

export type DomainContext = {
  primaryDomain: ContentDomain;
  secondaryDomains: ContentDomain[];
  source: DomainSource;
  confidence: number;
  allowInsuranceMigration: boolean;
  reasoning: string;
};

const insurancePattern = /保险|保单|投保|核保|承保|理赔|重疾险|医疗险|寿险|年金险|意外险|车险|险种|保额|保费|免责|等待期|健康告知/iu;
const financePattern = /财经|宏观|市场|央行|利率|汇率|股票|股市|港股|美股|基金|债券|黄金|原油|期货|银行|证券|指数|通胀|经济|财报|上市公司|房地产|房价|货币政策|财政政策/iu;
const wealthPattern = /财富|家庭现金流|现金流|资产配置|家庭资产|家庭负债|应急金|养老|退休|教育金|传承|家族信托|财商|预算管理|长期规划/iu;
const explicitNoInsurancePattern = /不要(?:关联|转到|落到|带到|提到)保险|不(?:关联|转到|落到|带到|提到)保险|纯财经|只讲财经|原生财经/iu;
const explicitInsuranceMigrationPattern = /保险角度|保障角度|联系保险|结合保险|落到保险|保险从业者/iu;

export function inferDomainScores(text: string): DomainScores {
  const value = text.trim();
  const insurance = explicitNoInsurancePattern.test(value) ? 0 : scoreMatches(value, insurancePattern, 74);
  const finance = scoreMatches(value, financePattern, 70);
  const wealth = scoreMatches(value, wealthPattern, 70);
  const general = Math.max(18, 48 - Math.max(insurance, finance, wealth) / 3);
  return { finance, wealth, insurance, general: clampScore(general) };
}

export function inferDomainContext(text: string, source: DomainSource = "inferred"): DomainContext {
  const scores = inferDomainScores(text);
  const ranked = (Object.entries(scores) as Array<[keyof DomainScores, number]>).sort((a, b) => b[1] - a[1]);
  const top = ranked[0];
  const second = ranked[1];
  const crossesWealthInsurance = scores.wealth >= 60 && scores.insurance >= 60;
  const crossesFinanceWealth = scores.finance >= 60 && scores.wealth >= 60;
  const primaryDomain: ContentDomain = crossesWealthInsurance || crossesFinanceWealth ? "hybrid" : top[0];
  const allowInsuranceMigration = explicitNoInsurancePattern.test(text)
    ? false
    : explicitInsuranceMigrationPattern.test(text) || primaryDomain === "insurance" || (primaryDomain === "hybrid" && scores.insurance >= 60);
  return {
    primaryDomain,
    secondaryDomains: ranked.filter(([, score]) => score >= 55).map(([domain]) => domain).filter((domain) => domain !== primaryDomain).slice(0, 2),
    source,
    confidence: Math.max(0.45, Math.min(0.98, (top[1] + Math.max(0, top[1] - second[1])) / 100)),
    allowInsuranceMigration,
    reasoning: `领域信号：财经 ${scores.finance}，财富 ${scores.wealth}，保险 ${scores.insurance}，通用 ${scores.general}`,
  };
}

export function buildDomainPrompt(context: DomainContext): string {
  const common = [
    `当前首要领域：${domainLabel(context.primaryDomain)}。`,
    "尊重用户原题，不因为用户从事保险或财富服务就擅自改变题目所属领域。",
    "不得虚构数据、来源、产品规则或个人经历；时效性事实需保留时间和核验边界。",
  ];
  if (!context.allowInsuranceMigration) common.push("本任务不允许主动迁移到保险、保障或保险产品角度。");
  if (context.primaryDomain === "finance") common.push("按原生财经视角解释事实、机制、影响与内容价值，不强行联系家庭保障。 ");
  if (context.primaryDomain === "wealth") common.push("围绕家庭目标、现金流、生命周期和长期决策展开；保险只能在确有必要且允许迁移时作为组成部分。 ");
  if (context.primaryDomain === "insurance") common.push("围绕保障、产品责任、核保、理赔或客户服务展开，并遵守保险业务边界。 ");
  if (context.primaryDomain === "hybrid") common.push("先说明跨领域的真实连接，再组织财经、财富或保险视角；不得生硬带产品。 ");
  if (context.primaryDomain === "general") common.push("保持任务领域中立，不主动添加财经、财富或保险结论。 ");
  return common.join("\n");
}

export function domainLabel(domain: ContentDomain) {
  return ({ general: "通用", finance: "泛财经", wealth: "家庭财富", insurance: "保险", hybrid: "交叉领域" } as const)[domain];
}

function scoreMatches(text: string, pattern: RegExp, matchedScore: number) {
  pattern.lastIndex = 0;
  return clampScore(pattern.test(text) ? matchedScore + Math.min(24, text.match(pattern)?.length ? 8 : 0) : 12);
}

function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}
