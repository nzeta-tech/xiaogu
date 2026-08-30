import { seedTopics } from "./seeds";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { HotTopic } from "./types";
import { ensureInternationalFinanceCoverage, inferHotTopicCategory, inferHotTopicRelevance, normalizeSourcePublishedAt, validateHotTopic } from "./rules";
import { isDemoModeEnabled } from "@/lib/config/runtime";

const platformMap: Record<string, string> = {
  weibo: "微博",
  douyin: "抖音",
  baidu: "百度",
  zhihu: "知乎",
  toutiao: "头条",
  news: "新闻",
};
const execFileAsync = promisify(execFile);

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
  timestamp?: string | number;
  updateTime?: string | number;
  publishedAt?: string | number;
};

type FreejkItem = {
  title?: string;
  desc?: string;
  cover?: string;
  image?: string;
  img?: string;
  hot?: string | number;
  url?: string;
  mobileUrl?: string;
  timestamp?: string | number;
  updateTime?: string | number;
  publishedAt?: string | number;
};

/** Fetches source candidates only. Ranking and persistence are handled by the ingestion task. */
export async function collectHotTopicCandidates(options: { refresh?: boolean } = {}): Promise<HotTopic[]> {
  const [baiduRealtimeTopics, rebangTopics, freejkTopics, rthkTopics] = await Promise.all([
    fetchBaiduRealtimeTopics(options),
    fetchRebangTopics(options),
    fetchFreejkTopics(options),
    fetchRthkTopics(options),
  ]);
  // This optional endpoint can be a commercial aggregation service. Keep it
  // explicitly opt-in so the standard Xiaogu topic supply is public-source only.
  const baseUrl = process.env.TOPIC_USE_OPTIONAL_DAILY_HOT_API === "1" ? process.env.DAILY_HOT_API_BASE : undefined;
  if (!baseUrl) {
    return dedupeTopics([...baiduRealtimeTopics, ...freejkTopics, ...rebangTopics, ...rthkTopics]);
  }

  const platforms = ["weibo", "douyin", "baidu", "zhihu"];
  const settled = await Promise.allSettled(
    platforms.map(async (platform) => {
      const response = await fetch(`${baseUrl.replace(/\/$/, "")}/${platform}`, {
        cache: options.refresh ? "no-store" : undefined,
        next: options.refresh ? undefined : { revalidate: 1800 },
        signal: AbortSignal.timeout(Number(process.env.TOPIC_SOURCE_TIMEOUT_MS ?? 8000)),
      });
      if (!response.ok) return [];
      const payload = (await response.json()) as {
        data?: Array<{ title?: string; desc?: string; hot?: string | number; cover?: string; image?: string; img?: string }>;
      };
      return (payload.data ?? []).slice(0, 5).map((item, index): HotTopic => {
        const title = item.title?.trim() || "未命名热点";
        return {
          id: `${platform}-${index}-${encodeURIComponent(title).slice(0, 24)}`,
          title,
          summary: item.desc?.trim() || "来自公开门户热榜，发布前请打开原始来源核验。",
          imageUrl: item.cover ?? item.image ?? item.img,
          source: platformMap[platform] ?? platform,
          heat: index < 2 ? "高" : "中",
          category: inferHotTopicCategory(title),
          insuranceRelevance: scoreInsuranceRelevance(title),
          recommendedAngle: buildInsuranceAngle(title),
          riskNote: "热点内容需先核实事实，保险建议应避免收益承诺和理赔承诺。",
          verification: validateHotTopic({ title, source: platformMap[platform] ?? platform }),
        };
      });
    }),
  );

  const remoteTopics = settled
    .flatMap((result) => (result.status === "fulfilled" ? result.value : []))
    .filter((topic) => topic.title !== "未命名热点")
    .sort((a, b) => relevanceRank(b.insuranceRelevance) - relevanceRank(a.insuranceRelevance));

  return dedupeTopics([
    ...baiduRealtimeTopics,
    ...freejkTopics,
    ...rebangTopics,
    ...rthkTopics,
    ...remoteTopics.filter((topic) => topic.insuranceRelevance !== "低"),
  ]);
}

export async function getHotTopics(options: { refresh?: boolean; topicPreference?: string } = {}): Promise<HotTopic[]> {
  const candidates = await collectHotTopicCandidates(options);
  if (candidates.length > 0) return rankAndDiversifyTopics(candidates, options.topicPreference);
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
        signal: AbortSignal.timeout(Number(process.env.TOPIC_SOURCE_TIMEOUT_MS ?? 8000)),
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
          category: inferHotTopicCategory(title),
          insuranceRelevance: scoreInsuranceRelevance(title),
          recommendedAngle: buildInsuranceAngle(title),
          riskNote: "热榜信息需要结合原始来源核验，不把榜单热度直接等同于事实结论。",
          sourceUrl: item.www_url ?? item.mobile_url ?? source.url,
          sourceTitle: `Rebang 今日热榜 · ${source.name}`,
          sourcePublishedAt: normalizeSourcePublishedAt(item.timestamp ?? item.updateTime ?? item.publishedAt),
          verification: validateHotTopic({ title, source: `Rebang · ${source.name}`, sourceUrl: item.www_url ?? item.mobile_url ?? source.url, sourcePublishedAt: normalizeSourcePublishedAt(item.timestamp ?? item.updateTime ?? item.publishedAt) }),
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
    { key: "qq-news", name: "腾讯新闻", tab: "热点" as const },
    { key: "sina-news", name: "新浪新闻", tab: "热点" as const },
    { key: "netease-news", name: "网易新闻", tab: "热点" as const },
    { key: "thepaper", name: "澎湃新闻", tab: "热点" as const },
    { key: "toutiao", name: "头条", tab: "热点" as const },
    { key: "douyin", name: "抖音", tab: "热点" as const },
    { key: "zhihu", name: "知乎", tab: "热点" as const },
    { key: "weatheralarm", name: "天气预警", tab: "热点" as const },
    { key: "36kr", name: "36氪", tab: "财经" as const },
    { key: "geekpark", name: "极客公园", tab: "财经" as const },
    { key: "ifanr", name: "爱范儿", tab: "财经" as const },
    { key: "ithome", name: "IT之家", tab: "财经" as const },
    { key: "51cto", name: "51CTO", tab: "财经" as const },
    { key: "smzdm", name: "什么值得买", tab: "财经" as const },
    { key: "sspai", name: "少数派", tab: "财经" as const },
  ];

  const settled = await Promise.allSettled(
    sources.map(async (source) => {
      const response = await fetch(`https://api.freejk.com/shuju/hotlist/${source.key}`, {
        cache: options.refresh ? "no-store" : undefined,
        next: options.refresh ? undefined : { revalidate: 600 },
        signal: AbortSignal.timeout(Number(process.env.TOPIC_SOURCE_TIMEOUT_MS ?? 8000)),
        headers: { "user-agent": "Mozilla/5.0 (compatible; XiaoguTopicBot/1.0)" },
      });
      if (!response.ok) return [];
      const payload = (await response.json()) as {
        code?: number;
        data?: FreejkItem[];
      };
      if (payload.code !== 200 || !Array.isArray(payload.data)) return [];

      return payload.data.slice(0, 50).map((item, index): HotTopic => {
        const title = item.title?.trim() || "未命名热点";
        return {
          id: `freejk-${source.key}-${index}-${encodeURIComponent(title).slice(0, 24)}`,
          title,
          summary: item.desc?.trim() || `来自 ${source.name} 热榜，适合结合最新公开信息核验后转化为保险内容选题。`,
          source: `FreeJK · ${source.name}`,
          tab: source.tab,
          heat: index < 5 ? "高" : "中",
          category: inferHotTopicCategory(title),
          insuranceRelevance: scoreInsuranceRelevance(title),
          recommendedAngle: buildInsuranceAngle(title),
          riskNote: "热榜信息需要二次核验，不把网络热度直接等同于事实结论。",
          sourceUrl: item.url ?? item.mobileUrl,
          imageUrl: item.cover ?? item.image ?? item.img,
          sourceTitle: `${source.name} 热榜`,
          sourcePublishedAt: normalizeSourcePublishedAt(item.updateTime ?? item.timestamp ?? item.publishedAt),
          verification: validateHotTopic({ title, source: `FreeJK · ${source.name}`, sourceUrl: item.url ?? item.mobileUrl, sourcePublishedAt: normalizeSourcePublishedAt(item.updateTime ?? item.timestamp ?? item.publishedAt) }),
        };
      });
    }),
  );

  return settled
    .flatMap((result) => (result.status === "fulfilled" ? result.value : []))
    // 热点保留小谷原有创作相关性；财经必须是可被家庭、市场或商业创作者直接解释的财经事实。
    .filter((topic) => topic.title !== "未命名热点" && (topic.tab !== "热点" || isTopicCandidate(topic.title)) && (topic.tab !== "财经" || isFinanceTopicCandidate(topic.title)))
    .sort((a, b) => topicScore(b) - topicScore(a));
}

/** Official Baidu realtime board is deliberately kept intact for the 热点 tab. */
async function fetchBaiduRealtimeTopics(options: { refresh?: boolean }) {
  const boardUrl = "https://top.baidu.com/board?tab=realtime";
  const html = await fetchSourceText(boardUrl, options);
  if (!html) return [];
  const items = [...html.matchAll(/\{"appUrl":"([^"\\]*(?:\\.[^"\\]*)*)","desc":"([^"\\]*(?:\\.[^"\\]*)*)"[\s\S]*?"word":"([^"\\]*(?:\\.[^"\\]*)*)"/g)];
  return items.slice(0, 50).map((match, index): HotTopic | null => {
    const title = decodeJsonString(match[3]);
    if (!title) return null;
    return {
      id: `baidu-realtime-${index}-${encodeURIComponent(title).slice(0, 24)}`,
      title,
      summary: decodeJsonString(match[2]) || "百度实时热榜当前词条，打开来源查看完整事件背景。",
      source: "百度实时热榜",
      tab: "热点",
      heat: index < 10 ? "高" : "中",
      category: inferHotTopicCategory(title),
      insuranceRelevance: scoreInsuranceRelevance(title),
      recommendedAngle: buildInsuranceAngle(title),
      riskNote: "热榜只代表实时讨论度，发布前须核验原始事实与时间。",
      sourceUrl: decodeJsonString(match[1]) || boardUrl,
      imageUrl: (() => {
        const imageMatch = match[0].match(/"img":"([^"\\]*(?:\\.[^"\\]*)*)"/);
        return imageMatch ? decodeJsonString(imageMatch[1]) : undefined;
      })(),
      sourceTitle: "百度热搜 · 实时榜",
      sourcePublishedAt: new Date().toISOString(),
      verification: validateHotTopic({ title, source: "百度实时热榜", sourceUrl: decodeJsonString(match[1]) || boardUrl, sourcePublishedAt: new Date().toISOString() }),
    };
  }).filter((topic): topic is HotTopic => Boolean(topic));
}

async function fetchRthkTopics(options: { refresh?: boolean }) {
  const sources = [
    { category: 3, name: "RTHK 本地即时", tab: "香港" as const },
    { category: 5, name: "RTHK 财经即时", tab: "财经" as const },
    { category: 4, name: "RTHK 国际即时", tab: "国际" as const },
  ];
  const settled = await Promise.allSettled(sources.map(async (source) => {
    const url = `https://news.rthk.hk/rthk/webpageCache/services/loadModNewsShowSp2List.php?lang=zh-TW&cat=${source.category}&newsCount=60&dayShiftMode=1&archive_date=`;
    // The production Web runtime intentionally has no curl package. Use the
    // built-in HTTP client first and retain curl only as an optional fallback.
    const html = await fetchSourceText(url, options);
    if (!html) return [];
    const items = [...html.matchAll(/<h4 class='ns2-title'><a href='([^']+)'>([\s\S]*?)<\/a><\/h4>[\s\S]*?<div class='ns2-created'>([^<]+)<\/div>/g)];
    return Promise.all(items.map(async (match, index): Promise<HotTopic> => {
      const title = decodeHtml(match[2]).trim();
      const publishedAtValue = match[3].replace(" HKT", "+08:00").replace(" ", "T");
      const publishedAtTimestamp = Date.parse(publishedAtValue);
      const sourcePublishedAt = Number.isNaN(publishedAtTimestamp) ? undefined : new Date(publishedAtTimestamp).toISOString();
      // The RTHK list endpoint intentionally carries no thumbnail. Preload the
      // first creator-visible page of article covers from each Hong Kong/world feed.
      const imageUrl = (source.tab === "香港" || source.tab === "国际") && index < 24
        ? await fetchRthkArticleCover(match[1], options)
        : undefined;
      return {
        id: `rthk-${source.category}-${index}-${encodeURIComponent(title).slice(0, 24)}`,
        title,
        summary: `${source.name} 即时新闻，发布前请打开原始报道核验完整背景。`,
        source: source.name,
        tab: source.tab,
        heat: index < 8 ? "高" : "中",
        category: inferHotTopicCategory(title),
        insuranceRelevance: scoreInsuranceRelevance(title),
        recommendedAngle: buildInsuranceAngle(title),
        riskNote: "新闻事件应以原始报道为准，避免将即时信息推导为投资或保障结论。",
        sourceUrl: match[1],
        imageUrl,
        sourceTitle: source.name,
        sourcePublishedAt,
        verification: validateHotTopic({ title, source: source.name, sourceUrl: match[1], sourcePublishedAt }),
      };
    })).then((topics) => topics.filter((topic) => topic.title));
  }));
  return settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
}

async function fetchRthkArticleCover(url: string, options: { refresh?: boolean }) {
  const html = await fetchSourceText(url, options);
  const match = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
    ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  return match?.[1]?.replace(/&amp;/g, "&");
}

function decodeHtml(value: string) {
  return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

function decodeJsonString(value: string) {
  try { return JSON.parse(`"${value}"`); } catch { return value.replace(/\\"/g, '"').replace(/\\n/g, " "); }
}

/**
 * A few public Chinese news hosts intermittently time out in Node's HTTP stack
 * while succeeding through the host network path. URLs are internal constants;
 * curl never receives user-provided input and remains a narrowly-scoped fallback.
 */
async function fetchSourceText(url: string, options: { refresh?: boolean }, preferCurl = false) {
  const timeout = Number(process.env.TOPIC_SOURCE_TIMEOUT_MS ?? 8000);
  if (!preferCurl) {
    try {
      const response = await fetch(url, {
        cache: options.refresh ? "no-store" : undefined,
        next: options.refresh ? undefined : { revalidate: 600 },
        signal: AbortSignal.timeout(timeout),
        headers: { "user-agent": "Mozilla/5.0 (compatible; XiaoguTopicBot/1.0)" },
      });
      if (response.ok) {
        const body = await response.text();
        // Some upstream edge nodes respond 200 with an empty cache body.
        if (body.trim().length >= 200) return body;
      }
    } catch {
      // Try the host-network fallback below.
    }
  }
  try {
    const { stdout } = await execFileAsync("curl", ["-L", "--fail", "--silent", "--show-error", "--max-time", "15", "-A", "XiaoguTopicBot/1.0", url], { maxBuffer: 3_000_000 });
    return stdout;
  } catch {
    return "";
  }
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

function isFinanceTopicCandidate(title: string) {
  return /股|市|金融|经济|银行|利率|房贷|存款|理财|基金|债|保险|财报|营收|利润|融资|上市|并购|裁员|投资|企业|公司|地产|房价|汽车|行业|资本|贸易|补贴|监管|税|财政|央行|汇率|黄金|原油|港元|港股|美股|美元|消费|物价|就业|工资|养老金|社保/.test(title);
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

  return ensureInternationalFinanceCoverage([...selected, ...ranked], 12);
}

function scoreInsuranceRelevance(title: string): HotTopic["insuranceRelevance"] {
  return inferHotTopicRelevance(title);
}

function topicScore(topic: HotTopic, topicPreference = "") {
  let score = relevanceRank(topic.insuranceRelevance) * 20;
  if (topic.heat === "高") score += 10;
  if (/谁能想到|首次|突然|暴涨|暴跌|崩了|没了|罕见|冲上热搜|全网|紧急|官宣|新规|调整|回应|通报|热议/.test(topic.title)) score += 14;
  if (/涨价|降价|裁员|倒闭|破产|停产|罢工|事故|赔偿|补偿|医保|养老金|退休|医院|药|癌|暴雨|台风|地震|火灾|车祸|生育|教育|房贷|物价|暴雷|危机/.test(topic.title)) score += 14;
  if (/家庭|父母|孩子|老人|年轻人|打工人|普通人|中年|收入|房贷|学校|实体店|航空|车企/.test(topic.title)) score += 9;
  if (/特斯拉|三星|日本车企|廉价航空|造车新势力|手机店|学校禁止|汛情|灾情/.test(topic.title)) score += 10;
  if (topic.category === "国际财经") score += 6;
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
