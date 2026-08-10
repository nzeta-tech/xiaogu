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
  metadata_json: { sourceLabel?: string; memoryScope?: string };
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
  metadata_json: { sourceLabel?: string; memoryScope?: string };
  created_at: string;
  updated_at: string;
};

export type AvatarTrainingRun = {
  id: string;
  source_id: string | null;
  training_type: string;
  status: "running" | "succeeded" | "failed";
  phase: string;
  total_count: number;
  completed_count: number;
  successful_count: number;
  error_message: string;
  details_json: Record<string, unknown>;
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

export type AvatarCreatorSkillVersion = {
  id: string;
  version: number;
  training_run_id: string | null;
  status: "training" | "active" | "superseded" | "restored" | "failed";
  source_links: string[];
  sample_count: number;
  skill_prompt: string;
  change_summary: string;
  created_at: string;
};

export type AvatarCreatorSkill = {
  id: string;
  name: string;
  creator_name: string;
  status: "active" | "archived";
  skill_scope: "personal" | "platform";
  latest_version: number;
  created_at: string;
  updated_at: string;
  versions: AvatarCreatorSkillVersion[];
};

export type AvatarPrivacySettings = {
  learning_enabled: boolean;
  behavior_learning_enabled: boolean;
  customer_memory_enabled: boolean;
  auto_inference_enabled: boolean;
  visual_creation_enabled: boolean;
};

export type AvatarCoachConversation = {
  id: string;
  title: string;
  updated_at: string;
  message_count: number;
};

export type AvatarCoachMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

export type AvatarCoachAction = {
  label: string;
  href: string;
  description: string;
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

export type AvatarContactCard = {
  display_name: string;
  organization: string;
  call_to_action: string;
  service_motto: string;
  phone: string;
  email: string;
  placement: "bottom-right" | "bottom-bar";
  enabled_by_default: boolean;
  business_card_style: "classic" | "emerald" | "editorial" | "ivory" | "garden" | "lavender";
  default_qr_code_id: string | null;
  qr_codes: Array<{ id: string; label: string; qr_code_url: string; original_url: string; created_at: string }>;
  has_qr_code: boolean;
  qr_code_url: string | null;
  updated_at: string | null;
};
