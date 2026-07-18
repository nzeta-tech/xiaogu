export const avatarMemoryCategories = ["identity", "audience", "expertise", "expression", "story", "boundary", "temporary"] as const;
export type AvatarMemoryCategory = typeof avatarMemoryCategories[number];

export type AvatarMemoryItem = {
  id: string;
  category: AvatarMemoryCategory;
  title: string;
  content: string;
  source_id: string | null;
  origin: "user" | "imported" | "behavior" | "inferred" | "system";
  status: "candidate" | "active" | "archived";
  confidence: number;
  sensitivity: "normal" | "sensitive" | "restricted";
  usage_scope: "all" | "content" | "customer" | "private";
  created_at: string;
  updated_at: string;
};

export type AvatarMemorySource = {
  id: string;
  source_type: string;
  title: string;
  content: string;
  status: "active" | "disabled" | "archived";
  sensitivity: "normal" | "sensitive" | "restricted";
  created_at: string;
  updated_at: string;
};

export type AvatarEvolutionProposal = {
  id: string;
  category: string;
  title: string;
  description: string;
  confidence: number;
  evidence_json: string[];
  patch_json: Record<string, unknown>;
  status: "pending" | "accepted" | "rejected";
  created_at: string;
  resolved_at: string | null;
};

export type AvatarVersion = {
  id: string;
  version: number;
  label: string;
  snapshot_json: Record<string, unknown>;
  change_summary: string;
  source: string;
  status: string;
  created_at: string;
};

export type AvatarPrivacySettings = {
  learning_enabled: boolean;
  behavior_learning_enabled: boolean;
  customer_memory_enabled: boolean;
  auto_inference_enabled: boolean;
  visual_creation_enabled: boolean;
};

export type AvatarVisualAssetRole = "portrait" | "professional" | "lifestyle" | "full_body" | "side_profile";

export type AvatarVisualAsset = {
  id: string;
  role: AvatarVisualAssetRole;
  label: string;
  is_primary: boolean;
  status: "active" | "disabled" | "archived";
  usage_scopes: string[];
  allow_creation: boolean;
  content_type: string;
  original_filename: string;
  size_bytes: number;
  width: number;
  height: number;
  quality_json: { warnings?: string[]; megapixels?: number };
  created_at: string;
  updated_at: string;
  content_url: string;
};
