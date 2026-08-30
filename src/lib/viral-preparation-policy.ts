export type ViralCoverCandidate = { id: string; source_url: string; platform: string; thumbnail_url?: string | null };

export function viralPlatformPublishLimit(platform: string) {
  return platform === "抖音" ? 30 : 3;
}

export function wrapCoverTitle(value: string, width: number) {
  const chars = [...value.replace(/\s+/g, " ").trim()];
  const lines: string[] = [];
  for (let index = 0; index < chars.length; index += width) lines.push(chars.slice(index, index + width).join(""));
  return lines;
}

export function buildViralCoverTask(candidate: ViralCoverCandidate, index: number) {
  return {
    taskType: "source.inspect" as const,
    payload: {
      url: candidate.source_url,
      userId: "local-agent",
      purpose: "viral_cover",
      viralContentId: candidate.id,
      platform: candidate.platform,
      thumbnailUrl: candidate.thumbnail_url ?? "",
    },
    dedupeKey: `viral-cover:${candidate.id}`,
    priority: 70 - index,
    maxAttempts: 2,
  };
}
