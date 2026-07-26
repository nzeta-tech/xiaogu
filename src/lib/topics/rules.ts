import type { HotTopic, HotTopicCategoryStat, HotTopicVerification } from "./types";

export const INTERNATIONAL_FINANCE_CATEGORY = "国际财经";
const internationalFinancePattern = /美联储|联储|欧洲央行|欧央行|日本央行|英央行|央行降息|美元指数|美元汇率|人民币汇率|日元|欧元|英镑|美股|纳斯达克|标普500|道琼斯|日经|恒生|港股|全球股市|国际股市|全球市场|国际市场|原油|国际油价|黄金价格|国际金价|铜价|大宗商品|关税|贸易战|贸易摩擦|全球经济|国际经济|美国通胀|欧洲通胀|美国就业|美国非农|国际债券|美债|美债收益率/;
const blockedContentPattern = /稳赚|必涨|稳赚不赔|抄底|内幕消息|荐股|带单|跟投|保证收益|绝对收益|翻倍/;

export function inferHotTopicCategory(title: string): string {
  if (internationalFinancePattern.test(title)) return INTERNATIONAL_FINANCE_CATEGORY;
  if (/医保|医疗|医院|药|病|体检|健康|癌|结节/.test(title)) return "健康医疗";
  if (/退休|养老|养老金|社保|老龄/.test(title)) return "养老规划";
  if (/暴雨|台风|地震|事故|火灾|车祸/.test(title)) return "意外与财产风险";
  if (/裁员|失业|降薪|创业|企业|罢工|倒闭|破产|暴雷|危机|车企|实体店|价格倒挂/.test(title)) return "收入与企业主风险";
  if (/涨价|物价|房贷|利率|消费|工资/.test(title)) return "家庭现金流";
  if (/生育|教育|孩子|父母|老人|学校/.test(title)) return "家庭责任";
  if (/航空|旅行|出行|航班/.test(title)) return "出行与意外风险";
  return "社会热点";
}

export function getHotTopicDisplayCategory(topic: Pick<HotTopic, "title" | "category">): string {
  return inferHotTopicCategory(topic.title) === INTERNATIONAL_FINANCE_CATEGORY ? INTERNATIONAL_FINANCE_CATEGORY : topic.category;
}

export function ensureInternationalFinanceCoverage(topics: HotTopic[], limit = 12): HotTopic[] {
  const ranked = topics.slice(0, limit);
  const international = topics.find((topic) => getHotTopicDisplayCategory(topic) === INTERNATIONAL_FINANCE_CATEGORY);
  if (!international || ranked.some((topic) => getHotTopicDisplayCategory(topic) === INTERNATIONAL_FINANCE_CATEGORY)) return ranked;
  if (ranked.length < limit) {
    ranked.push(international);
    return ranked;
  }
  // Keep one real international-finance candidate in the visible first ten.
  ranked.splice(Math.min(9, ranked.length - 1), 1, international);
  return ranked;
}

export function normalizeSourcePublishedAt(value: unknown): string | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const numeric = typeof value === "number" ? value : typeof value === "string" && /^\d+(\.\d+)?$/.test(value.trim()) ? Number(value) : NaN;
  const date = Number.isFinite(numeric)
    ? new Date(numeric < 10_000_000_000 ? numeric * 1000 : numeric)
    : new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function inferHotTopicRelevance(title: string): HotTopic["insuranceRelevance"] {
  if (internationalFinancePattern.test(title)) return "中";
  if (/医保|医疗|医院|药|病|体检|健康|癌|结节|退休|养老|养老金|社保|暴雨|台风|地震|事故|火灾|车祸|裁员|失业|赔偿|补偿|护理|生育|破产|倒闭|罢工|灾情|汛情/.test(title)) return "高";
  if (/家庭|孩子|父母|年轻人|收入|消费|政策|风险|涨价|降价|工资|房贷|利率|物价|企业|教育|老人|暴雷|危机|停产|航空|车企|实体店|价格倒挂|学校|禁止/.test(title)) return "中";
  return "低";
}

export function validateHotTopic(topic: Pick<HotTopic, "title" | "source" | "sourceUrl" | "sourcePublishedAt" | "evidence">): HotTopicVerification {
  const reasons: string[] = [];
  const title = topic.title.trim();
  if (!title || title === "未命名热点") reasons.push("缺少有效标题");
  if (blockedContentPattern.test(title)) reasons.push("包含投资承诺或荐股措辞");
  if (!topic.source.trim()) reasons.push("缺少来源");
  if (topic.sourceUrl) {
    try {
      if (!/^https?:$/.test(new URL(topic.sourceUrl).protocol)) reasons.push("来源链接协议无效");
    } catch { reasons.push("来源链接格式无效"); }
  } else reasons.push("缺少原始来源链接");
  if (!topic.sourcePublishedAt) reasons.push("缺少来源发布时间");
  else if (Number.isNaN(new Date(topic.sourcePublishedAt).getTime())) reasons.push("来源发布时间无效");
  if (!topic.evidence?.trim()) reasons.push("缺少可核验证据摘要");
  return { status: reasons.length === 0 ? "ready" : "needs-review", note: reasons.length === 0 ? "来源、时间和证据字段齐全，仍应以原文复核。" : `发布前核验：${reasons.join("、")}。` };
}

export function getHotTopicCategoryStats(topics: HotTopic[]): HotTopicCategoryStat[] {
  const counts = new Map<string, number>();
  for (const topic of topics) {
    const category = getHotTopicDisplayCategory(topic);
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return [...counts.entries()].map(([category, count]) => ({ category, count, ratio: topics.length ? count / topics.length : 0 })).sort((a, b) => b.count - a.count || a.category.localeCompare(b.category, "zh-CN"));
}
