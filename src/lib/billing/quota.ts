export type QuotaAction =
  | "hot_topics"
  | "short_videos"
  | "topic_angles"
  | "write_script"
  | "rewrite"
  | "compliance_check"
  | "deep_research";

export const quotaCosts: Record<QuotaAction, number> = {
  hot_topics: 2,
  short_videos: 1,
  topic_angles: 3,
  write_script: 5,
  rewrite: 2,
  compliance_check: 2,
  deep_research: 8,
};

export function getQuotaCost(action: QuotaAction) {
  return quotaCosts[action];
}
