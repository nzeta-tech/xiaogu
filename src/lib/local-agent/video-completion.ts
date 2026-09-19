type Review = { attempt: number; pass: boolean; issues: string[] };

export function spokenVideoCompletion(result: Record<string, unknown>) {
  const raw = Array.isArray(result.qualityReview) ? result.qualityReview : [];
  const valid = raw.length > 0 && raw.length <= 3 && raw.every((value, index) =>
    value && typeof value === "object" && typeof value.pass === "boolean" &&
    value.attempt === index + 1 &&
    Array.isArray(value.issues) && value.issues.every((issue: unknown) => typeof issue === "string"));
  const reviews: Review[] = valid ? raw.map(value => ({
    attempt: value.attempt, pass: value.pass, issues: value.issues.slice(0, 8).map((issue: string) => issue.slice(0, 500)),
  })) : [];
  const final = reviews.at(-1);
  const qualityPassed = valid && final?.pass === true && result.acceptedWithNotes !== true &&
    (result.deliveryNotes === undefined || (Array.isArray(result.deliveryNotes) && result.deliveryNotes.length === 0));
  const completed = result.status === "completed" && typeof result.videoUrl === "string" &&
    result.videoUrl.trim().length > 0 && qualityPassed;
  const error = completed ? null : result.status !== "completed" && typeof result.error === "string" && result.error.trim()
    ? result.error : !qualityPassed
    ? `成片质检未通过：${final?.issues.length ? final.issues.join("；") : "缺少有效的最终通过记录"}`
    : String(result.error || "口播视频生成失败");
  return { completed, error: error?.slice(0, 2000) ?? null, reviews };
}
