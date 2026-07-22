export type FactStatus = "unverified" | "human_verified" | "rejected";
export type FactType = "policy_term" | "regulation" | "claim_case" | "premium" | "health" | "other";
export type RightsBasis = "official_api_display" | "platform_embed" | "owner_license" | "public_domain" | "other_approved";
export type RightsScope = "metadata_only" | "link_only" | "embed_only" | "download_republish";

export type ShortVideoEvidence = {
  officialUrl: string;
  institution: string;
  publishedAt?: string;
  excerpt: string;
};

export type ShortVideoMetric = {
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  statisticsAt: string;
};

export type ShortVideoPolicyStatus = "displayable" | "pending_review" | "filtered";

export type ShortVideoCompliance = {
  status: ShortVideoPolicyStatus;
  reasons: string[];
  publishable: boolean;
  rightsBasis: RightsBasis | null;
  rightsScope: RightsScope | null;
};

export type ShortVideo = {
  id: string;
  title: string;
  platform: string;
  sourceUrl: string;
  sourceTitle?: string;
  publishedAt?: string;
  fetchedAt: string;
  metrics: ShortVideoMetric;
  themes: string[];
  labels: string[];
  availability: "active" | "stale";
  platformDeleted: boolean;
  absoluteLanguage: boolean;
  sensitiveInformation: boolean;
  factStatus: FactStatus;
  factType: FactType | null;
  factClaims: string[];
  evidence: ShortVideoEvidence[];
  jurisdiction: string | null;
  effectiveAt: string | null;
  reviewedAt: string | null;
  reviewerId: string | null;
  rightsExpiresAt: string | null;
  attribution: string | null;
  platformPolicyCheckedAt: string | null;
  compliance: ShortVideoCompliance;
};

export type ShortVideoSort = "relevance" | "published_at" | "views" | "engagement";

export type ShortVideoFeed = {
  items: ShortVideo[];
  filteredCount: number;
  fetchedAt: string | null;
  source: "authorized_provider" | "cache" | "none";
  degraded: boolean;
  degradationReason?: "provider_not_configured" | "provider_unavailable" | "no_eligible_items";
};
