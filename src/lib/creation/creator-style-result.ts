export type CreatorStyleResult = {
  id: string;
  label: string;
  content: string;
  titles?: string[];
  reviewStatus?: "approved" | "needs_review";
  reviewIssues?: string[];
};

export function buildPersistedCreatorStyleText(results: CreatorStyleResult[]) {
  return results
    .map((result) => {
      const reviewNotice = result.reviewStatus === "needs_review"
        ? `> 待复核稿：${result.reviewIssues?.join("；") || "质量检查仍有待调整项，请修改后再发布。"}\n\n`
        : "";
      return results.length > 1
        ? `## ${result.label}版${result.reviewStatus === "needs_review" ? "（待复核）" : ""}\n\n${reviewNotice}${result.content.trim()}`
        : `${reviewNotice}${result.content.trim()}`;
    })
    .filter(Boolean)
    .join("\n\n");
}
