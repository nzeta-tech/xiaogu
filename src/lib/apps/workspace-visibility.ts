/**
 * Applications intentionally hidden from the user-facing application plaza.
 * Workbuddy consumes the same boundary so a hidden product cannot be invoked
 * through natural language while it is unavailable in the plaza.
 */
export const hiddenWorkspaceCardSlugs = new Set([
  "write-copy",
  "lead-copy",
  "wechat-article-polish",
  "lead-package",
  "topic-picker",
  "general-content",
  "letter",
  "xiaohongshu-check",
  "policy-diagnosis",
  "breakthrough",
  "personality-card",
  "recruit-script",
  "recruit-followup",
  "ip-positioning",
]);
