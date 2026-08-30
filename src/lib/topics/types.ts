export type HotTopicTab = "热点" | "财经" | "香港" | "国际";

export type HotTopic = {
  id: string;
  title: string;
  summary: string;
  source: string;
  heat: "高" | "中" | "低";
  category: string;
  insuranceRelevance: "高" | "中" | "低";
  recommendedAngle: string;
  riskNote: string;
  sourceUrl?: string;
  /** Source-provided cover image. Missing images deliberately render as compact text cards. */
  imageUrl?: string;
  sourceTitle?: string;
  sourcePublishedAt?: string;
  evidence?: string;
  verification?: HotTopicVerification;
  tab?: HotTopicTab;
};

export type HotTopicVerification = { status: "ready" | "needs-review"; note: string };
export type HotTopicCategoryStat = { category: string; count: number; ratio: number };
