import type { HotTopic, HotTopicTab } from "./types";

export const HOT_TOPIC_TABS: HotTopicTab[] = ["热点", "财经", "香港", "国际"];

const hongKongPattern = /香港|HK01|RTHK|港股|恒生|港元|Hong Kong/i;
const internationalPattern = /美联储|联储|欧洲央行|欧央行|美元|汇率|美股|纳斯达克|标普|原油|国际金价|关税|全球经济|国际经济|海外|美国|欧洲|日本|Reuters|BBC|AP |IMF|WHO/i;
const financePattern = /财经|金融|市场|利率|房贷|消费|物价|股市|股票|债券|基金|经济|企业|现金流|36氪|雪球|证券|东方财富|金十/i;

export function inferTopicTab(topic: Pick<HotTopic, "title" | "source" | "category">): HotTopicTab {
  const signal = `${topic.title} ${topic.source} ${topic.category}`;
  if (hongKongPattern.test(signal)) return "香港";
  if (internationalPattern.test(signal)) return "国际";
  if (financePattern.test(signal)) return "财经";
  return "热点";
}

export function topicDedupeKey(topic: Pick<HotTopic, "title">) {
  return topic.title.replace(/[\s　·，,。！？!？：:（）()「」『』“”'"-]/g, "").slice(0, 64);
}

/** Normalizes one ingestion run without fabricating entries to fill a quota. */
export function prepareTopicIngestion(topics: HotTopic[], perTabLimit = 200): HotTopic[] {
  const seen = new Set<string>();
  const grouped = new Map<HotTopicTab, HotTopic[]>();
  HOT_TOPIC_TABS.forEach((tab) => grouped.set(tab, []));

  for (const topic of topics) {
    const key = topicDedupeKey(topic);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const tab = topic.tab ?? inferTopicTab(topic);
    grouped.get(tab)?.push({ ...topic, tab });
  }

  return HOT_TOPIC_TABS.flatMap((tab) => grouped.get(tab)!.slice(0, perTabLimit));
}
