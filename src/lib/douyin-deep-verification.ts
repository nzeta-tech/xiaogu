export const DOUYIN_MINIMUM_LIKES_EXCLUSIVE = 1000;

export type ArticleMaterialStatus =
  | "discovered"
  | "metadata_verified"
  | "transcript_verified"
  | "evidence_ready"
  | "rejected";

export type DouyinDeepVerificationResult = {
  status: ArticleMaterialStatus;
  videoId?: string;
  canonicalUrl?: string;
  publishedAt?: string;
  likeCount?: number;
  filterEvidence?: Record<string, unknown>;
  transcript?: string;
  evidenceScore: number;
  rejectionReason?: string;
  note?: string;
};

export function canonicalDouyinVideoUrl(value: string) {
  const match = value.match(/(?:douyin\.com)?\/video\/(\d+)/i);
  return match ? `https://www.douyin.com/video/${match[1]}` : "";
}

export function buildDouyinDeepVerificationResult(input: {
  canonicalUrl: string;
  publishedAt?: string;
  likeCount?: number;
  filterEvidence?: Record<string, unknown>;
  transcript?: string;
  note?: string;
}): DouyinDeepVerificationResult {
  const canonicalUrl = canonicalDouyinVideoUrl(input.canonicalUrl);
  const videoId = canonicalUrl.match(/\/video\/(\d+)/)?.[1];
  const publishedAt = normalizeDate(input.publishedAt);
  const likeCount = finiteInteger(input.likeCount);
  const filterEvidence = input.filterEvidence && typeof input.filterEvidence === "object"
    ? input.filterEvidence
    : undefined;

  if (!canonicalUrl || !videoId || !publishedAt || likeCount === undefined || !filterEvidence || Object.keys(filterEvidence).length === 0) {
    return {
      status: "rejected",
      canonicalUrl: canonicalUrl || undefined,
      videoId,
      publishedAt,
      likeCount,
      filterEvidence,
      evidenceScore: 0,
      rejectionReason: "native_metadata_incomplete",
      note: input.note,
    };
  }
  if (likeCount <= DOUYIN_MINIMUM_LIKES_EXCLUSIVE) {
    return {
      status: "rejected",
      canonicalUrl,
      videoId,
      publishedAt,
      likeCount,
      filterEvidence,
      evidenceScore: 0,
      rejectionReason: "likes_not_above_1000",
      note: input.note,
    };
  }

  const transcript = input.transcript?.trim() || undefined;
  const evidenceScore = calculateArticleEvidenceScore({ publishedAt, likeCount, filterEvidence, transcript });
  return {
    status: transcript
      ? evidenceScore >= 70 ? "evidence_ready" : "transcript_verified"
      : "metadata_verified",
    canonicalUrl,
    videoId,
    publishedAt,
    likeCount,
    filterEvidence,
    transcript,
    evidenceScore,
    note: input.note,
  };
}

export function calculateArticleEvidenceScore(input: {
  publishedAt: string;
  likeCount: number;
  filterEvidence: Record<string, unknown>;
  transcript?: string;
}) {
  const verifiedMetadata = input.publishedAt && input.likeCount > DOUYIN_MINIMUM_LIKES_EXCLUSIVE && Object.keys(input.filterEvidence).length > 0;
  const transcriptLength = input.transcript?.replace(/\s+/g, "").length ?? 0;
  const transcriptScore = transcriptLength >= 800 ? 45 : transcriptLength >= 300 ? 35 : transcriptLength >= 120 ? 20 : 0;
  return Math.min(100, (verifiedMetadata ? 45 : 0) + transcriptScore + (transcriptLength >= 300 ? 10 : 0));
}

export function isDouyinDeepVerificationResult(value: unknown): value is DouyinDeepVerificationResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Record<string, unknown>;
  return typeof result.status === "string"
    && ["metadata_verified", "transcript_verified", "evidence_ready", "rejected"].includes(result.status)
    && typeof result.evidenceScore === "number";
}

function normalizeDate(value?: string) {
  return value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : undefined;
}

function finiteInteger(value?: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : undefined;
}
