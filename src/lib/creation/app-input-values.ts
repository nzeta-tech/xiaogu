import type { CreationApp } from "../apps/catalog.ts";
import { getRemixCapabilityDefaults } from "./remix-capability-registry.ts";
import type { CreationFieldValue } from "./output.ts";

export function createCreationAppInitialValues(app: CreationApp) {
  const base = Object.fromEntries(app.fields.map(field => [field.id, field.type === "multiselect" ? [] : ""])) as Record<string, CreationFieldValue>;
  const defaults: Record<string, Record<string, CreationFieldValue>> = {
    "policy-renewal-card": { style: "renewal-handwritten", currency: "人民币", privacy_mode: "masked", contact_text: "", portrait_treatment: "soft-illustration", ratio: "3:4", avatar_visual_mode: "no", avatar_visual_asset_ids: [] },
    "image-card": { creation_mode: "text_to_card", draw_portrait: "no", ratio: "3:4", avatar_visual_asset_ids: [] },
    "video-cover": { platform: "wechat_video", style: "video-bold-opinion", ratio: "9:16", avatar_visual_mode: "no", avatar_visual_asset_ids: [] },
    "write-copy": { tone: "self", targets: ["video_script", "xiaohongshu", "wechat_article", "moments"] },
    "wechat-images": { style: "documentary", avatar_visual_mode: "no", avatar_visual_asset_ids: [] },
    "general-content": { targets: ["video_script", "wechat_article"] },
    "letter": { theme: "", targets: ["wechat_article"] },
    "wechat-article-polish": { target: ["wechat_article"] },
  };
  const appDefaults = app.slug === "link-remix"
    ? { remix_target: "traffic-copy", ...getRemixCapabilityDefaults("traffic-copy") }
    : app.slug === "ip-positioning" && app.name === "个性名片"
      ? { style: "professional", ratio: "3:4", avatar_visual_mode: "yes", avatar_visual_asset_ids: [] }
      : defaults[app.slug] ?? {};
  return { ...base, ...appDefaults };
}

export function buildCreationAppConversationValues(app: CreationApp, source: string) {
  const values = createCreationAppInitialValues(app);
  for (const field of app.fields) {
    if (/^(source|topic|draft|article|content|prompt|material)/i.test(field.id) && ["text", "textarea", "text_or_file"].includes(field.type)) {
      values[field.id] = source;
    }
  }
  return values;
}
