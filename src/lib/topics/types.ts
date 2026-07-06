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
  sourceTitle?: string;
  sourcePublishedAt?: string;
  evidence?: string;
};
