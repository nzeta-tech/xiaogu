import { seedTopics } from "./seeds";
import { discoverTopicsWithSearch, enrichTopicsWithSearch } from "./search-enrichment";
import type { HotTopic } from "./types";
import { isDemoModeEnabled } from "@/lib/config/runtime";

const platformMap: Record<string, string> = {
  weibo: "微博",
  douyin: "抖音",
  baidu: "百度",
  zhihu: "知乎",
  toutiao: "头条",
  news: "新闻",
};

const rebangSources = [
  { name: "全站", tab: "top", subTab: "today", url: "https://rebang.today/?tab=top" },
  { name: "知乎", tab: "zhihu", url: "https://rebang.today/?tab=zhihu" },
  { name: "微博", tab: "weibo", subTab: "search", url: "https://rebang.today/?tab=weibo" },
  { name: "腾讯新闻", tab: "tencent-news", url: "https://rebang.today/?tab=tencent-news" },
  { name: "头条", tab: "toutiao", url: "https://rebang.today/?tab=toutiao" },
  { name: "小红书", tab: "xiaohongshu", subTab: "hot-search", url: "https://rebang.today/?tab=xiaohongshu" },
  { name: "百度贴吧", tab: "baidu-tieba", subTab: "topic", url: "https://rebang.today/?tab=baidu-tieba" },
  { name: "抖音", tab: "douyin", url: "https://rebang.today/?tab=douyin" },
  { name: "网易新闻", tab: "ne-news", subTab: "htd", url: "https://rebang.today/?tab=ne-news" },
  { name: "雪球", tab: "xueqiu", subTab: "topic", url: "https://rebang.today/?tab=xueqiu" },
  { name: "百度", tab: "baidu", subTab: "realtime", url: "https://rebang.today/?tab=baidu" },
];

type RebangItem = {
  title?: string;
  word?: string;
  desc?: string;
  www_url?: string;
  mobile_url?: string;
  hot_value?: string | number;
};

type FreejkItem = {
  title?: string;
  desc?: string;
  hot?: string | number;
  url?: string;
  mobileUrl?: string;
};

export async function getHotTopics(options: { refresh?: boolean; topicPreference?: string } = {}): Promise<HotTopic[]> {
  const searchTopics = await discoverTopicsWithSearch(options);
  const rebangTopics = await fetchRebangTopics(options);
  const freejkTopics = await fetchFreejkTopics(options);
  const baseUrl = process.env.DAILY_HOT_API_BASE;
  if (!baseUrl) {
    const fallbackTopics = rankAndDiversifyTopics(dedupeTopics([...freejkTopics, ...rebangTopics, ...searchTopics]), options.topicPreference);
    if (fallbackTopics.length > 0) return fallbackTopics;
    if (isDemoModeEnabled()) return seedTopics;
    throw new Error("话题来源未配置，生产模式不能使用本地种子热点");
  }

  const platforms = ["weibo", "douyin", "baidu", "zhihu"];
  const settled = await Promise.allSettled(
    platforms.map(async (platform) => {
      const response = await fetch(`${baseUrl.replace(/\/$/, "")}/${platform}`, {
        cache: options.refresh ? "no-store" : undefined,
        next: options.refresh ? undefined : { revalidate: 1800 },
      });
      if (!response.ok) return [];
      const payload = (await response.json()) as {
        data?: Array<{ title?: string; desc?: string; hot?: string | number }>;
      };
      return (payload.data ?? []).slice(0, 5).map((item, index): HotTopic => {
        const title = item.title?.trim() || "未命名热点";
        return {
          id: `${platform}-${index}-${encodeURIComponent(title).slice(0, 24)}`,
          title,
          summary: item.desc?.trim() || "来自门户热榜，建议结合搜索结果补充背景。",
          source: platformMap[platform] ?? platform,
          heat: index < 2 ? "高" : "中",
          category: inferCategory(title),
          insuranceRelevance: scoreInsuranceRelevance(title),
          recommendedAngle: buildInsuranceAngle(title),
          riskNote: "热点内容需先核实事实，保险建议应避免收益承诺和理赔承诺。",
        };
      });
    }),
  );

  const remoteTopics = settled
    .flatMap((result) => (result.status === "fulfilled" ? result.value : []))
    .filter((topic) => topic.title !== "未命名热点")
    .sort((a, b) => relevanceRank(b.insuranceRelevance) - relevanceRank(a.insuranceRelevance));

  const candidateTopics = rankAndDiversifyTopics(dedupeTopics([
    ...freejkTopics,
    ...searchTopics,
    ...rebangTopics,
    ...remoteTopics.filter((topic) => topic.insuranceRelevance !== "低"),
  ]), options.topicPreference);

  if (candidateTopics.length > 0) return enrichTopicsWithSearch(candidateTopics.slice(0, 12), options);
  if (isDemoModeEnabled()) return seedTopics;
  throw new Error("话题来源暂不可用，请检查热榜或搜索服务配置");
}

async function fetchRebangTopics(options: { refresh?: boolean }) {
  const settled = await Promise.allSettled(
    rebangSources.map(async (source) => {
      const query = new URLSearchParams({
        tab: source.tab,
        page: "1",
        version: "1",
      });
      if (source.subTab) query.set("sub_tab", source.subTab);

      const response = await fetch(`https://api.rebang.today/v1/items?${query.toString()}`, {
        cache: options.refresh ? "no-store" : undefined,
        next: options.refresh ? undefined : { revalidate: 600 },
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; XiaoguTopicBot/1.0)",
          origin: "https://rebang.today",
          referer: source.url,
        },
      });
      if (!response.ok) return [];

      const payload = (await response.json()) as {
        code?: number;
        data?: { list?: string };
      };
      if (payload.code !== 200 || !payload.data?.list) return [];

      const items = JSON.parse(payload.data.list) as RebangItem[];
      return items.slice(0, 18).map((item, index): HotTopic => {
        const title = (item.title ?? item.word ?? "").trim();
        return {
          id: `rebang-${source.tab}-${index}-${encodeURIComponent(title).slice(0, 24)}`,
          title: title || "未命名热点",
          summary: item.desc?.trim() || `来自 Rebang 今日热榜「${source.name}」。`,
          source: `Rebang · ${source.name}`,
          heat: index < 3 ? "高" : "中",
          category: inferCategory(title),
          insuranceRelevance: scoreInsuranceRelevance(title),
          recommendedAngle: buildInsuranceAngle(title),
          riskNote: "热榜信息需要结合原始来源核验，不把榜单热度直接等同于事实结论。",
          sourceUrl: item.www_url ?? item.mobile_url ?? source.url,
          sourceTitle: `Rebang 今日热榜 · ${source.name}`,
        };
      });
    }),
  );

  return settled
    .flatMap((result) => (result.status === "fulfilled" ? result.value : []))
    .filter((topic) => topic.title !== "未命名热点" && isTopicCandidate(topic.title))
    .sort((a, b) => topicScore(b) - topicScore(a));
}

async function fetchFreejkTopics(options: { refresh?: boolean }) {
  const sources = [
    { key: "thepaper", name: "澎湃新闻" },
    { key: "36kr", name: "36氪" },
    { key: "toutiao", name: "头条" },
    { key: "douyin", name: "抖音" },
    { key: "zhihu", name: "知乎" },
  ];

  const settled = await Promise.allSettled(
    sources.map(async (source) => {
      const response = await fetch(`https://api.freejk.com/shuju/hotlist/${source.key}`, {
        cache: options.refresh ? "no-store" : undefined,
        next: options.refresh ? undefined : { revalidate: 600 },
        headers: { "user-agent": "Mozilla/5.0 (compatible; XiaoguTopicBot/1.0)" },
      });
      if (!response.ok) return [];
      const payload = (await response.json()) as {
        code?: number;
        data?: FreejkItem[];
      };
      if (payload.code !== 200 || !Array.isArray(payload.data)) return [];

      return payload.data.slice(0, 18).map((item, index): HotTopic => {
        const title = item.title?.trim() || "未命名热点";
        return {
          id: `freejk-${source.key}-${index}-${encodeURIComponent(title).slice(0, 24)}`,
          title,
          summary: item.desc?.trim() || `来自 ${source.name} 热榜，适合结合最新公开信息核验后转化为保险内容选题。`,
          source: `FreeJK · ${source.name}`,
          heat: index < 5 ? "高" : "中",
          category: inferCategory(title),
          insuranceRelevance: scoreInsuranceRelevance(title),
          recommendedAngle: buildInsuranceAngle(title),
          riskNote: "热榜信息需要二次核验，不把网络热度直接等同于事实结论。",
          sourceUrl: item.url ?? item.mobileUrl,
          sourceTitle: `${source.name} 热榜`,
        };
      });
    }),
  );

  return settled
    .flatMap((result) => (result.status === "fulfilled" ? result.value : []))
    .filter((topic) => topic.title !== "未命名热点" && isTopicCandidate(topic.title))
    .sort((a, b) => topicScore(b) - topicScore(a));
}

function isTopicCandidate(title: string) {
  if (/彩票|明星八卦|恋情|离婚|游戏皮肤|综艺|影视剧|演唱会|饭圈|抽奖|穿搭|妆容|写真/.test(title)) return false;
  return (
    scoreInsuranceRelevance(title) !== "低" ||
    /涨价|降价|罢工|停产|裁员|倒闭|破产|事故|暴雷|危机|处罚|召回|缺货|延迟|改革|新规|调整|补贴|补偿|赔偿|工资|房贷|利率|物价|生育|教育|家庭|父母|孩子|老人|年轻人|打工人|普通人|中年|医院|学校|企业|航空|车企|实体店|价格倒挂|汛情|灾情|禁令|禁止/.test(
      title,
    )
  );
}

function dedupeTopics(topics: HotTopic[]) {
  const seen = new Set<string>();
  return topics.filter((topic) => {
    const key = topic.title.replace(/\s+/g, "").slice(0, 36);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function rankAndDiversifyTopics(topics: HotTopic[], topicPreference = "") {
  const ranked = [...topics].sort((a, b) => topicScore(b, topicPreference) - topicScore(a, topicPreference));
  const selected: HotTopic[] = [];
  const categoryCount = new Map<string, number>();
  const sourceCount = new Map<string, number>();

  for (const topic of ranked) {
    const categoryUsed = categoryCount.get(topic.category) ?? 0;
    const sourceKey = topic.source.split("·")[0]?.trim() || topic.source;
    const sourceUsed = sourceCount.get(sourceKey) ?? 0;
    if (selected.length >= 12) break;
    if (selected.length >= 4 && categoryUsed >= 3) continue;
    if (selected.length >= 4 && sourceUsed >= 4) continue;
    selected.push(topic);
    categoryCount.set(topic.category, categoryUsed + 1);
    sourceCount.set(sourceKey, sourceUsed + 1);
  }

  for (const topic of ranked) {
    if (selected.length >= 12) break;
    if (!selected.some((item) => item.title === topic.title)) selected.push(topic);
  }

  return selected;
}

function inferCategory(title: string): string {
  if (/医保|医疗|医院|药|病|体检|健康|癌|结节/.test(title)) return "健康医疗";
  if (/退休|养老|养老金|社保|老龄/.test(title)) return "养老规划";
  if (/暴雨|台风|地震|事故|火灾|车祸/.test(title)) return "意外与财产风险";
  if (/裁员|失业|降薪|创业|企业|罢工|倒闭|破产|暴雷|危机|车企|实体店|价格倒挂/.test(title)) return "收入与企业主风险";
  if (/涨价|物价|房贷|利率|消费|工资/.test(title)) return "家庭现金流";
  if (/生育|教育|孩子|父母|老人|学校/.test(title)) return "家庭责任";
  if (/航空|旅行|出行|航班/.test(title)) return "出行与意外风险";
  return "社会热点";
}

function scoreInsuranceRelevance(title: string): HotTopic["insuranceRelevance"] {
  if (/医保|医疗|医院|药|病|体检|健康|癌|结节|退休|养老|养老金|社保|暴雨|台风|地震|事故|火灾|车祸|裁员|失业|赔偿|补偿|护理|生育|破产|倒闭|罢工|灾情|汛情/.test(title)) {
    return "高";
  }
  if (/家庭|孩子|父母|年轻人|收入|消费|政策|风险|涨价|降价|工资|房贷|利率|物价|企业|教育|老人|暴雷|危机|停产|航空|车企|实体店|价格倒挂|学校|禁止/.test(title)) return "中";
  return "低";
}

function topicScore(topic: HotTopic, topicPreference = "") {
  let score = relevanceRank(topic.insuranceRelevance) * 20;
  if (topic.heat === "高") score += 10;
  if (/谁能想到|首次|突然|暴涨|暴跌|崩了|没了|罕见|冲上热搜|全网|紧急|官宣|新规|调整|回应|通报|热议/.test(topic.title)) score += 14;
  if (/涨价|降价|裁员|倒闭|破产|停产|罢工|事故|赔偿|补偿|医保|养老金|退休|医院|药|癌|暴雨|台风|地震|火灾|车祸|生育|教育|房贷|物价|暴雷|危机/.test(topic.title)) score += 14;
  if (/家庭|父母|孩子|老人|年轻人|打工人|普通人|中年|收入|房贷|学校|实体店|航空|车企/.test(topic.title)) score += 9;
  if (/特斯拉|三星|日本车企|廉价航空|造车新势力|手机店|学校禁止|汛情|灾情/.test(topic.title)) score += 10;
  if (/报告|研究|白皮书|论文|指数|论坛|会议/.test(topic.title)) score -= 14;
  if (matchesPreference(topic, topicPreference)) score += 18;
  if (topic.evidence || topic.sourceUrl) score += 4;
  return score;
}

function matchesPreference(topic: HotTopic, topicPreference: string) {
  const keywords = topicPreference
    .split(/[;；,，、\s]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2);
  if (keywords.length === 0) return false;
  const haystack = `${topic.title} ${topic.category} ${topic.summary} ${topic.recommendedAngle}`;
  return keywords.some((keyword) => haystack.includes(keyword));
}

function relevanceRank(relevance: HotTopic["insuranceRelevance"]) {
  if (relevance === "高") return 3;
  if (relevance === "中") return 2;
  return 1;
}

function buildInsuranceAngle(title: string): string {
  if (/医保|医疗|医院|药/.test(title)) return "从医保和商业医疗险的边界切入，讲清哪些费用要提前规划。";
  if (/体检|健康|病|癌|结节/.test(title)) return "从健康变化对投保和核保的影响切入，提醒尽早建立保障。";
  if (/退休|养老|养老金/.test(title)) return "从退休现金流切入，讲清养老准备要兼顾社保、储蓄和商业保险。";
  if (/涨价|物价|利率|房贷|工资|收入/.test(title)) return "从生活成本和现金流压力切入，讲普通家庭为什么要留出应急金和保障预算。";
  if (/裁员|失业|倒闭|破产|停产|企业|罢工|暴雷|危机|实体店|价格倒挂/.test(title)) return "从收入中断和家庭责任切入，讲清风险分摊不能只靠一份工资。";
  if (/生育|教育|孩子|父母|老人/.test(title)) return "从家庭责任周期切入，把教育、赡养、医疗和收入保障放到一张风险清单里讲。";
  if (/航空|旅行|出行|航班/.test(title)) return "从出行风险和消费变化切入，讲清意外、医疗和应急现金流的底层逻辑。";
  if (/暴雨|台风|地震|事故|火灾|车祸/.test(title)) return "从突发风险后的经济损失切入，讲清保障责任和免责边界。";
  return "先解释热点里的家庭风险，再自然过渡到保障规划，不直接推具体产品。";
}
