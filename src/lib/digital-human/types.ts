export const digitalHumanProviders = ["heygen", "chanjing"] as const;
export type DigitalHumanProvider = typeof digitalHumanProviders[number];
export type DigitalHumanEdition = "standard" | "pro";
export type DigitalHumanEditionSummary = { edition: DigitalHumanEdition; status: "creating" | "ready" | "failed" | "disabled"; reviewStatus: "pending" | "approved" | "rejected"; supportsLooks: boolean; supportsRemoveBackground: boolean; supports4k: boolean };

export type DigitalHumanAsset = {
  id: string;
  provider: DigitalHumanProvider;
  name: string;
  status: "creating" | "ready" | "failed" | "disabled" | "deleting";
  source_type: "photo" | "video";
  provider_avatar_id: string | null;
  provider_group_id: string | null;
  provider_voice_id: string | null;
  preview_image_url: string | null;
  preview_video_url: string | null;
  consent_confirmed_at: string;
  error_message: string | null;
  metadata_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  editions?: DigitalHumanEditionSummary[];
};

export type DigitalHumanVideoJob = {
  id: string;
  asset_id: string | null;
  provider: DigitalHumanProvider;
  edition: DigitalHumanEdition;
  title: string;
  script: string;
  aspect_ratio: "9:16" | "16:9";
  subtitle_enabled: boolean;
  status: "queued" | "processing" | "completed" | "failed";
  video_url: string | null;
  preview_image_url: string | null;
  duration_seconds: number | null;
  progress: number;
  error_message: string | null;
  request_json?: {
    creation_mode?: "quick" | "smart";
    creative_plan?: import("./creative-plan").DigitalHumanCreativePlan;
    execution_channel?: "codex_subscription" | "api";
    local_task_id?: string;
    creative_summary?: string[];
    stage?: string;
    fallback_reason?: string;
    edition?: DigitalHumanEdition;
    [key: string]: unknown;
  };
  created_at: string;
  updated_at: string;
  asset_name?: string;
};

export type DigitalHumanTemplate = {
  provider: DigitalHumanProvider;
  id: string;
  name: string;
  figure_type: string;
  width: number;
  height: number;
  voice_id: string;
  voice_name: string;
  cover_url: string;
  preview_url: string;
  gender?: string;
  tag_names?: string[];
};

export type DigitalHumanVoice = {
  id: string;
  provider: DigitalHumanProvider;
  name: string;
  source: "public" | "creator";
  status: "creating" | "ready" | "failed" | "disabled";
  provider_voice_id: string;
  preview_audio_url: string;
  gender?: string;
  language?: string;
  error_message?: string;
  is_favorite?: boolean;
};
