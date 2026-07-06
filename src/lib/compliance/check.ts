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
