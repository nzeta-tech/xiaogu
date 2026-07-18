export type ComplianceIssue = {
  level: "高" | "中" | "低";
  phrase: string;
  reason: string;
  suggestion: string;
};

const rules: Array<Omit<ComplianceIssue, "phrase"> & { pattern: RegExp }> = [
  {
    level: "高",
    pattern: /稳赚(?:不赔)?|保证收益|保本保息|一定赚钱|翻倍/giu,
    reason: "涉嫌收益承诺或误导性金融宣传。",
    suggestion: "改为说明利益演示具有不确定性，并以合同条款和实际结算为准。",
  },
  { level: "高", pattern: /保证承保|一定承保|无需健康告知|有病也能买/giu, reason: "涉嫌承诺承保或弱化健康告知要求。", suggestion: "改为说明承保结论以健康告知、核保规则和保险公司审核为准。" },
  { level: "高", pattern: /永久保证续保|终身保证续保|停售也能续/giu, reason: "可能夸大续保责任。", suggestion: "准确引用合同中的保证续保期间、停售处理和续保条件。" },
  { level: "中", pattern: /零风险|绝对安全|没有任何风险/giu, reason: "使用绝对化表述，容易误导消费者。", suggestion: "改为客观说明产品功能、限制和不确定性。" },
  { level: "中", pattern: /最好的保险|全网第一|行业第一|性价比最高/giu, reason: "涉嫌无法验证的比较或最高级宣传。", suggestion: "改为描述具体责任和适用条件，避免无依据排名。" },
  { level: "中", pattern: /医保什么都不管|社保没用|医保没用/giu, reason: "贬低社会保障制度，可能形成误导。", suggestion: "客观说明基本医保与商业保险的功能边界和互补关系。" },
  {
    level: "高",
    pattern: /一定赔|什么都赔|全都能报|百分百理赔|肯定赔/giu,
    reason: "涉嫌承诺理赔或夸大保障范围。",
    suggestion: "改为说明是否赔付取决于保险责任、免责条款、等待期和理赔材料。",
  },
  {
    level: "中",
    pattern: /不买就晚了|再不买就完了|最后机会|限时停售/giu,
    reason: "容易构成焦虑营销或逼单表达。",
    suggestion: "改为理性风险教育，提醒用户根据家庭情况评估。",
  },
  {
    level: "中",
    pattern: /所有人都适合|人人(?:都)?适合|人人必买|闭眼买/giu,
    reason: "忽略个体差异，容易误导销售。",
    suggestion: "改为强调预算、健康状况、家庭责任和已有保障不同，方案应个性化。",
  },
];

export function checkCompliance(text: string) {
  const issues = rules.flatMap((rule) => {
    const matches = Array.from(text.matchAll(rule.pattern));
    return matches.map((match) => ({
      level: rule.level,
      phrase: match[0],
      reason: rule.reason,
      suggestion: rule.suggestion,
    }));
  });

  const hasHigh = issues.some((issue) => issue.level === "高");
  const hasMiddle = issues.some((issue) => issue.level === "中");

  return {
    riskLevel: hasHigh ? "高" : hasMiddle ? "中" : "低",
    issues,
    requiredDisclaimer:
      "本文仅作保险知识科普，不构成具体产品推荐；保障责任、免责条款、等待期和理赔条件以保险合同及保险公司核保/理赔结论为准。",
  };
}
