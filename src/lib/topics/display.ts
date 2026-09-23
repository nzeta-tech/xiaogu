import type { HotTopic } from "./types.ts";

export const topicTabs = ["热点", "财经", "香港", "国际"] as const;
export const financeFilters = ["全部", "市场波动", "家庭钱袋", "政策机会", "公司行业", "港美财经"] as const;
export type FinanceFilter = typeof financeFilters[number];

export function getTopicTab(topic: HotTopic): "热点" | "财经" | "香港" | "国际" {
  if (topic.tab) return topic.tab;
  const signal = `${topic.title} ${topic.source} ${topic.category}`;
  if (/香港|HK01|RTHK|港股|恒生|港元|Hong Kong/i.test(signal)) return "香港";
  if (/国际财经|美联储|联储|欧洲央行|欧央行|美元|汇率|美股|纳斯达克|标普|原油|黄金|关税|全球|国际|海外|美国|欧洲|日本/i.test(signal)) return "国际";
  if (/财经|金融|市场|利率|房贷|消费|物价|股|债|基金|经济|企业|现金流/i.test(signal)) return "财经";
  return "热点";
}

export function matchesFinanceFilter(topic: HotTopic, filter: FinanceFilter) {
  if (filter === "全部") return true;
  const signal = `${topic.title} ${topic.summary} ${topic.source} ${topic.category}`;
  const rules: Record<Exclude<FinanceFilter, "全部">, RegExp> = {
    "市场波动": /股|港股|美股|指数|黄金|原油|汇率|美元|利率|债券|基金|市场|价格|涨|跌|期货/i,
    "家庭钱袋": /房贷|存款|理财|基金|养老金|社保|消费|物价|收入|工资|家庭|住房|教育|医疗|养老/i,
    "政策机会": /央行|监管|新规|政策|税|补贴|改革|条例|办法|发布|实施|调整/i,
    "公司行业": /财报|业绩|营收|利润|融资|并购|裁员|企业|公司|行业|科技|汽车|地产|银行/i,
    "港美财经": /港股|恒生|港元|香港|美股|美国|美联储|纳斯达克|标普|道琼斯|美元/i,
  };
  return rules[filter].test(signal);
}

export function compareTopicsForDisplay(left: HotTopic, right: HotTopic, tab: "热点" | "财经" | "香港" | "国际") {
  // 百度官方实时榜在热点页完整保留，并优先呈现；其余条目沿用小谷的创作价值信号。
  if (tab === "热点") {
    const leftBaidu = left.source === "百度实时热榜" ? 1 : 0;
    const rightBaidu = right.source === "百度实时热榜" ? 1 : 0;
    if (leftBaidu !== rightBaidu) return rightBaidu - leftBaidu;
  }
  const score = (topic: HotTopic) => {
    let value = topic.heat === "高" ? 30 : topic.heat === "中" ? 18 : 8;
    if (topic.domainScores) value += Math.max(topic.domainScores.finance, topic.domainScores.wealth, topic.domainScores.insurance, topic.domainScores.general) * 0.24;
    else if (topic.insuranceRelevance === "高") value += 24;
    else if (topic.insuranceRelevance === "中") value += 12;
    if (/首次|突然|紧急|官宣|新规|通报|热议|暴涨|暴跌/.test(topic.title)) value += 8;
    return value;
  };
  return score(right) - score(left) || left.title.localeCompare(right.title, "zh-CN");
}

