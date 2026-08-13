export type StudioBootstrapWork = {
  id: string;
  title?: string;
  content?: string;
  content_json?: {
    wechatStudioState?: Record<string, unknown>;
    xiaohongshuStudioState?: Record<string, unknown>;
  } | null;
  studio_asset_runs?: Array<{ id: string; app_slug: string; status: string; error_message?: string | null }>;
  app_run?: { status?: string; input_payload?: Record<string, unknown> | null } | null;
};
