export function buildViralCoverUrl(contentId: string, coverSha256?: string | null) {
  const version = coverSha256?.trim().slice(0, 16);
  return `/api/viral-covers/${contentId}${version ? `?v=${encodeURIComponent(version)}` : ""}`;
}
