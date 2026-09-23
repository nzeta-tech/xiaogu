import { assertActiveAvatarProvider } from "./retirement.ts";
import type { DigitalHumanAsset } from "@/lib/digital-human/types";
import { tryGetSystemSettings } from "@/lib/db/repositories";
import { readFile } from "node:fs/promises";
import path from "node:path";

const heygenBase = (process.env.HEYGEN_API_BASE_URL || "https://api.heygen.com").replace(/\/$/, "");

type JsonRecord = Record<string, unknown>;
// Optional legacy fields preserve the shape used when reading saved avatar metadata.
type AvatarCapabilities = {
  avatarType?: string; supportsRemoveBackground: boolean; supportedEngines?: unknown[];
  quality?: "standard" | "high"; consentStatus?: string;
  supports4k?: boolean; width?: number; height?: number; trainsVoice?: boolean;
};
const scenePresetFiles: Record<string, string> = {
  "#F5F2EC": "professional-office.jpg",
  "#0F2740": "news-studio.jpg",
  "#4A3328": "library-study.jpg",
  "#D6B38A": "warm-living-room.jpg",
  "#1A2630": "podcast-studio.jpg",
  "#DDE8EF": "city-window.jpg",
  "#0F766E": "brand-stage.jpg",
  "#D9C2A2": "minimal-consulting.jpg",
};

async function scenePresetFile(color: string) {
  const fileName = scenePresetFiles[color.toUpperCase()];
  if (!fileName) return null;
  const bytes = await readFile(path.join(process.cwd(), "public", "digital-human-scenes", fileName));
  return new File([bytes], fileName, { type: "image/jpeg" });
}

async function jsonResponse(response: Response) {
  const payload = await response.json().catch(() => ({})) as JsonRecord;
  if (!response.ok) throw new Error(String((payload.error as JsonRecord | undefined)?.message || payload.msg || `供应商请求失败（${response.status}）`));
  return payload;
}

function heygenHeaders() {
  const key = process.env.HEYGEN_API_KEY;
  if (!key) throw new Error("HeyGen 尚未配置，请联系管理员");
  return { "x-api-key": key };
}

async function uploadHeygen(file: File) {
  const form = new FormData(); form.append("file", file);
  const payload = await jsonResponse(await fetch(`${heygenBase}/v3/assets`, { method: "POST", headers: heygenHeaders(), body: form }));
  return String((payload.data as JsonRecord | undefined)?.asset_id || "");
}

async function resolveHeygenLook(groupId: string | null, fallbackLookId: string) {
  if (!groupId) return fallbackLookId;
  const params = new URLSearchParams({ group_id: groupId, ownership: "private", limit: "50" });
  const payload = await jsonResponse(await fetch(`${heygenBase}/v3/avatars/looks?${params}`, { headers: heygenHeaders(), cache: "no-store" }));
  const looks = Array.isArray(payload.data) ? payload.data as JsonRecord[] : [];
  return String(looks.find((look) => String(look.status) === "completed" && look.preview_image_url)?.id || looks[0]?.id || fallbackLookId);
}

export async function listProviderLooks(asset: DigitalHumanAsset) {
  if (asset.provider !== "heygen" || !asset.provider_group_id) return [];
  const params = new URLSearchParams({ group_id: asset.provider_group_id, ownership: "private", limit: "50" });
  const payload = await jsonResponse(await fetch(`${heygenBase}/v3/avatars/looks?${params}`, { headers: heygenHeaders(), cache: "no-store" }));
  const rows = Array.isArray(payload.data) ? payload.data as JsonRecord[] : [];
  return rows.map((look) => ({ id: String(look.id || ""), name: String(look.name || asset.name), status: String(look.status || "creating"), previewImageUrl: String(look.preview_image_url || ""), previewVideoUrl: String(look.preview_video_url || ""), width: Number(look.image_width || look.width || 0), height: Number(look.image_height || look.height || 0) })).filter((look) => look.id);
}

export async function createProviderLook(asset: DigitalHumanAsset, input: { name: string; file: File }) {
  if (asset.provider !== "heygen" || !asset.provider_group_id) throw new Error("这个数字人当前不支持增加造型");
  const assetId = await uploadHeygen(input.file);
  const payload = await jsonResponse(await fetch(`${heygenBase}/v3/avatars`, { method: "POST", headers: { ...heygenHeaders(), "content-type": "application/json" }, body: JSON.stringify({ type: "photo", name: input.name, avatar_group_id: asset.provider_group_id, file: { type: "asset_id", asset_id: assetId } }) }));
  const data = payload.data as JsonRecord; const look = data.avatar_item as JsonRecord;
  return { id: String(look.id || ""), name: String(look.name || input.name), status: String(look.status || "creating"), previewImageUrl: String(look.preview_image_url || ""), previewVideoUrl: String(look.preview_video_url || "") };
}

export type ProviderAvatarCreationOptions = {
  replaceBackground?: boolean;
  quality?: "standard" | "high";
  trainType?: "figure" | "both";
  language?: "cn" | "en";
  continueWithoutVoice?: boolean;
};

export async function createProviderAvatar(input: { provider: "heygen" | "chanjing"; name: string; file: File } & ProviderAvatarCreationOptions) {
  assertActiveAvatarProvider(input.provider);
  if (input.provider === "heygen") {
    const assetId = await uploadHeygen(input.file);
    const payload = await jsonResponse(await fetch(`${heygenBase}/v3/avatars`, { method: "POST", headers: { ...heygenHeaders(), "content-type": "application/json" }, body: JSON.stringify({ type: "photo", name: input.name, file: { type: "asset_id", asset_id: assetId } }) }));
    const data = payload.data as JsonRecord; const avatar = data.avatar_item as JsonRecord; const group = data.avatar_group as JsonRecord | undefined;
    return { avatarId: String(avatar.id || ""), groupId: String(avatar.group_id || group?.id || ""), voiceId: String(avatar.default_voice_id || group?.default_voice_id || ""), previewImageUrl: String(avatar.preview_image_url || ""), previewVideoUrl: String(avatar.preview_video_url || ""), status: String(avatar.status || group?.status || "creating") === "completed" ? "ready" as const : "creating" as const, capabilities: { avatarType: String(avatar.avatar_type || "photo_avatar"), supportsRemoveBackground: input.replaceBackground !== false, supportedEngines: Array.isArray(avatar.supported_api_engines) ? avatar.supported_api_engines : [], quality: input.quality || "standard" } as AvatarCapabilities };
  }
  throw new Error("禅境服务已下线");
}

export async function refreshProviderAvatar(asset: DigitalHumanAsset) {
  if (asset.provider === "chanjing" || !asset.provider_avatar_id) return null;
  if (asset.provider === "heygen") {
    const id = asset.provider_group_id || asset.provider_avatar_id;
    const payload = await jsonResponse(await fetch(`${heygenBase}/v3/avatars/${encodeURIComponent(id)}`, { headers: heygenHeaders(), cache: "no-store" }));
    const data = payload.data as JsonRecord;
    return { status: String(data.status) === "completed" ? "ready" as const : String(data.status) === "failed" ? "failed" as const : "creating" as const, voiceId: String(data.default_voice_id || ""), previewImageUrl: String(data.preview_image_url || ""), previewVideoUrl: String(data.preview_video_url || ""), error: String((data.error as JsonRecord | undefined)?.message || ""), capabilities: { consentStatus: String(data.consent_status || ""), supportsRemoveBackground: asset.metadata_json?.supports_remove_background !== false } as AvatarCapabilities };
  }
  return null;
}

export async function deleteProviderAvatar(asset: DigitalHumanAsset) {
  if (asset.provider === "chanjing" || !asset.provider_avatar_id) return;
  if (asset.provider === "heygen") {
    await jsonResponse(await fetch(`${heygenBase}/v3/avatars/looks/${encodeURIComponent(asset.provider_avatar_id)}`, { method: "DELETE", headers: heygenHeaders() }));
  }
}

export async function createProviderVideo(input: { asset: DigitalHumanAsset; title: string; script: string; aspectRatio: "9:16" | "16:9"; subtitleEnabled: boolean; voiceId?: string; preferredLookId?: string; background?: { type: "original" | "color" | "url"; color: string; url: string } }) {
  assertActiveAvatarProvider(input.asset.provider);
  if (!input.asset.provider_avatar_id) throw new Error("数字人尚未完成创建");
  if (input.asset.provider === "heygen") {
    const voiceId = input.voiceId || input.asset.provider_voice_id;
    if (!voiceId) throw new Error("HeyGen 数字人尚未绑定可用音色");
    const lookId = input.preferredLookId || await resolveHeygenLook(input.asset.provider_group_id, input.asset.provider_avatar_id);
    const background=input.background||{type:"original" as const,color:"#F5F2EC",url:""}; const replace=background.type!=="original";
    const preset = background.type === "color" ? await scenePresetFile(background.color) : null;
    const presetAssetId = preset ? await uploadHeygen(preset) : "";
    const heygenBackground = background.type === "url" ? { url: background.url } : presetAssetId ? { asset_id: presetAssetId } : { value: background.color };
    const payload = await jsonResponse(await fetch(`${heygenBase}/v3/videos`, { method: "POST", headers: { ...heygenHeaders(), "content-type": "application/json" }, body: JSON.stringify({ type: "avatar", avatar_id: lookId, title: input.title, script: input.script, voice_id: voiceId, resolution: "1080p", aspect_ratio: input.aspectRatio, remove_background: replace, ...(replace ? { background: heygenBackground } : {}), voice_settings:{speed:1,pitch:0,volume:1,locale:"zh-CN"}, ...(input.subtitleEnabled ? { caption: { file_format: "srt" } } : {}) }) }));
    const data = payload.data as JsonRecord; return { jobId: String(data.video_id || ""), sessionId: "", request: { engine: "avatar", aspectRatio: input.aspectRatio } };
  }
  throw new Error("禅境服务已下线");
}

export async function getProviderVideo(input: { provider: "heygen" | "chanjing"; jobId: string }) {
  assertActiveAvatarProvider(input.provider);
  if (input.provider === "heygen") {
    const payload = await jsonResponse(await fetch(`${heygenBase}/v3/videos/${encodeURIComponent(input.jobId)}`, { headers: heygenHeaders(), cache: "no-store" })); const data = payload.data as JsonRecord; const raw = String(data.status || "");
    return { status: raw === "completed" ? "completed" as const : raw === "failed" ? "failed" as const : "processing" as const, progress: raw === "completed" ? 100 : Number(data.progress || 20), videoUrl: String(data.video_url || ""), previewImageUrl: String(data.thumbnail_url || ""), duration: Number(data.duration || 0), error: String((data.error as JsonRecord | undefined)?.message || "") };
  }
  throw new Error("禅境服务已下线");
}

export async function providerAvailability() {
  const settings = await tryGetSystemSettings();
  return {
    heygen: settings.digitalHuman.enabled && settings.digitalHuman.heygenEnabled && Boolean(process.env.HEYGEN_API_KEY),
    chanjing: false,
  };
}

export function publicDigitalHumanError(error: unknown, fallback = "数字人服务暂时不可用，请稍后重试") {
  const message = error instanceof Error ? error.message : String(error || "");
  const safeMessage = message.replace(/heygen|禅境|蝉镜/gi, "数字人服务");
  if (/额度|余额|credit|quota/i.test(message)) return "当前生成额度繁忙，请稍后重试";
  if (/timeout|超时|timed out/i.test(message)) return "生成服务响应较慢，请稍后重试";
  if (/素材.*(?:98|安全|审核|检测)/i.test(message)) return "素材未通过平台安全检查，请更换合规的本人素材后重试";
  if (/素材|file|image|video|format|格式|mime|HTTP 4/i.test(message)) return `素材上传或处理失败：${safeMessage.replace(/^.*?：/, "").slice(0, 120)}`;
  if (/鉴权|access.?token|尚未配置/i.test(message)) return "数字人服务配置异常，请联系管理员检查服务配置";
  if (/参数错误|40000/i.test(message)) return "当前声音暂时无法生成试听，请刷新后重试";
  if (/QPS|限流|40001/i.test(message)) return "数字人服务请求较多，请稍后重试";
  if (/上限|40002/i.test(message)) return "当前账号的定制数字人数量已达上限，请清理旧数字人后重试";
  return fallback;
}
