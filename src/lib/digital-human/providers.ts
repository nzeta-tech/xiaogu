import type { DigitalHumanAsset, DigitalHumanTemplate, DigitalHumanVoice } from "@/lib/digital-human/types";
import { tryGetSystemSettings } from "@/lib/db/repositories";
import { readFile } from "node:fs/promises";
import path from "node:path";

const heygenBase = (process.env.HEYGEN_API_BASE_URL || "https://api.heygen.com").replace(/\/$/, "");
const chanjingBase = (process.env.CHANJING_OPENAPI_BASE_URL || "https://open-api.chanjing.cc").replace(/\/$/, "");

type JsonRecord = Record<string, unknown>;
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

async function chanjingToken() {
  const appId = process.env.CHANJING_APP_ID;
  const secretKey = process.env.CHANJING_SECRET_KEY;
  if (!appId || !secretKey) throw new Error("禅境尚未配置，请联系管理员");
  const payload = await jsonResponse(await fetch(`${chanjingBase}/open/v1/access_token`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ app_id: appId, secret_key: secretKey }), cache: "no-store" }));
  if (Number(payload.code) !== 0) throw new Error(`禅境鉴权失败：${String(payload.msg || payload.code || "未知错误")}`);
  const data = payload.data as JsonRecord | string | undefined;
  const token = typeof data === "string" ? data : String(data?.access_token || payload.access_token || "");
  if (!token) throw new Error("禅境鉴权失败");
  return token;
}

async function uploadHeygen(file: File) {
  const form = new FormData(); form.append("file", file);
  const payload = await jsonResponse(await fetch(`${heygenBase}/v3/assets`, { method: "POST", headers: heygenHeaders(), body: form }));
  return String((payload.data as JsonRecord | undefined)?.asset_id || "");
}

async function uploadChanjing(file: File, service: string, existingToken?: string) {
  // Chanjing invalidates the previous access token when a new one is issued.
  // Reuse the caller's token across every step of one provider operation.
  const token = existingToken || await chanjingToken();
  const params = new URLSearchParams({ service, name: file.name });
  const upload = await jsonResponse(await fetch(`${chanjingBase}/open/v1/common/create_upload_url?${params}`, { headers: { access_token: token }, cache: "no-store" }));
  if (Number(upload.code) !== 0) throw new Error(`禅境创建素材上传地址失败：${String(upload.msg || upload.code || "未知错误")}`);
  const data = upload.data as JsonRecord;
  const signUrl = String(data.sign_url || ""); const fileId = String(data.file_id || ""); const mimeType = String(data.mime_type || file.type || "application/octet-stream");
  if (!signUrl || !fileId) throw new Error("禅境未返回素材上传地址");
  const put = await fetch(signUrl, { method: "PUT", headers: { "content-type": mimeType }, body: Buffer.from(await file.arrayBuffer()) });
  if (!put.ok) throw new Error(`素材上传禅境失败（HTTP ${put.status}）`);
  // Chanjing documents status 0 as processing and status 1 as ready. Larger
  // source videos can take close to a minute, so use their five-minute bound.
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const detail = await jsonResponse(await fetch(`${chanjingBase}/open/v1/common/file_detail?id=${encodeURIComponent(fileId)}`, { headers: { access_token: token }, cache: "no-store" }));
    if (Number(detail.code) !== 0) throw new Error(`禅境素材状态查询失败：${String(detail.msg || detail.code || "未知错误")}`);
    const detailData = detail.data as JsonRecord | undefined;
    const status = Number(detailData?.status ?? 0);
    if (status === 1) return { fileId, token };
    const detailMessage = String(detailData?.msg || detailData?.reason || detailData?.err_reason || "");
    if ([98, 99, 100].includes(status)) throw new Error(`禅境素材处理失败（状态 ${status}）${detailMessage ? `：${detailMessage}` : ""}`);
    if (status !== 0) throw new Error(`禅境素材状态异常（${status}）${detailMessage ? `：${detailMessage}` : ""}`);
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  throw new Error("禅境素材处理超时，请稍后重试");
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
  if (input.provider === "heygen") {
    const assetId = await uploadHeygen(input.file);
    const payload = await jsonResponse(await fetch(`${heygenBase}/v3/avatars`, { method: "POST", headers: { ...heygenHeaders(), "content-type": "application/json" }, body: JSON.stringify({ type: "photo", name: input.name, file: { type: "asset_id", asset_id: assetId } }) }));
    const data = payload.data as JsonRecord; const avatar = data.avatar_item as JsonRecord; const group = data.avatar_group as JsonRecord | undefined;
    return { avatarId: String(avatar.id || ""), groupId: String(avatar.group_id || group?.id || ""), voiceId: String(avatar.default_voice_id || group?.default_voice_id || ""), previewImageUrl: String(avatar.preview_image_url || ""), previewVideoUrl: String(avatar.preview_video_url || ""), status: String(avatar.status || group?.status || "creating") === "completed" ? "ready" as const : "creating" as const, capabilities: { avatarType: String(avatar.avatar_type || "photo_avatar"), supportsRemoveBackground: input.replaceBackground !== false, supportedEngines: Array.isArray(avatar.supported_api_engines) ? avatar.supported_api_engines : [], quality: input.quality || "standard" } };
  }
  const { fileId, token } = await uploadChanjing(input.file, "customised_person");
  const trainType = input.trainType || "both";
  const payload = await jsonResponse(await fetch(`${chanjingBase}/open/v1/create_customised_person`, { method: "POST", headers: { access_token: token, "content-type": "application/json" }, body: JSON.stringify({ name: input.name, train_type: trainType, ...(trainType === "both" ? { language: input.language || "cn" } : {}), file_id: fileId, error_skip: input.continueWithoutVoice === true, resolution_rate: input.quality === "high" ? 1 : 0, is_remove_bg: input.replaceBackground !== false }) }));
  if (Number(payload.code) !== 0) throw new Error(String(payload.msg || "禅境数字人创建失败"));
  return { avatarId: String(payload.data || ""), groupId: "", voiceId: "", previewImageUrl: "", previewVideoUrl: "", status: "creating" as const, capabilities: { avatarType: "digital_twin", supportsRemoveBackground: input.replaceBackground !== false, trainsVoice: trainType === "both", trainType, language: trainType === "both" ? input.language || "cn" : undefined, continueWithoutVoice: input.continueWithoutVoice === true, quality: input.quality || "standard" } };
}

export async function refreshProviderAvatar(asset: DigitalHumanAsset) {
  if (!asset.provider_avatar_id) return null;
  if (asset.provider === "heygen") {
    const id = asset.provider_group_id || asset.provider_avatar_id;
    const payload = await jsonResponse(await fetch(`${heygenBase}/v3/avatars/${encodeURIComponent(id)}`, { headers: heygenHeaders(), cache: "no-store" }));
    const data = payload.data as JsonRecord;
    return { status: String(data.status) === "completed" ? "ready" as const : String(data.status) === "failed" ? "failed" as const : "creating" as const, voiceId: String(data.default_voice_id || ""), previewImageUrl: String(data.preview_image_url || ""), previewVideoUrl: String(data.preview_video_url || ""), error: String((data.error as JsonRecord | undefined)?.message || ""), capabilities: { consentStatus: String(data.consent_status || ""), supportsRemoveBackground: asset.metadata_json?.supports_remove_background !== false } };
  }
  const token = await chanjingToken();
  const payload = await jsonResponse(await fetch(`${chanjingBase}/open/v1/customised_person?id=${encodeURIComponent(asset.provider_avatar_id)}`, { headers: { access_token: token }, cache: "no-store" }));
  const data = payload.data as JsonRecord; const status = Number(data.status);
  return { status: status === 2 ? "ready" as const : [4, 5].includes(status) ? "failed" as const : "creating" as const, voiceId: String(data.audio_man_id || ""), previewImageUrl: String(data.pic_url || ""), previewVideoUrl: String(data.preview_url || ""), error: String(data.err_reason || ""), capabilities: { supportsRemoveBackground: Boolean(data.is_support_remove_bg), supports4k: Boolean(data.support_4k), width: Number(data.width || 0), height: Number(data.height || 0), trainsVoice: Boolean(data.audio_man_id) } };
}

export async function deleteProviderAvatar(asset: DigitalHumanAsset) {
  if (!asset.provider_avatar_id) return;
  if (asset.provider === "heygen") {
    await jsonResponse(await fetch(`${heygenBase}/v3/avatars/looks/${encodeURIComponent(asset.provider_avatar_id)}`, { method: "DELETE", headers: heygenHeaders() }));
  } else {
    const token = await chanjingToken();
    await jsonResponse(await fetch(`${chanjingBase}/open/v1/delete_customised_person`, { method: "POST", headers: { access_token: token, "content-type": "application/json" }, body: JSON.stringify({ id: asset.provider_avatar_id }) }));
  }
}

export async function createProviderVideo(input: { asset: DigitalHumanAsset; title: string; script: string; aspectRatio: "9:16" | "16:9"; subtitleEnabled: boolean; voiceId?: string; preferredLookId?: string; background?: { type: "original" | "color" | "url"; color: string; url: string } }) {
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
  const voiceId = input.voiceId || input.asset.provider_voice_id;
  if (!voiceId) throw new Error("请选择可用的禅境声音");
  const token = await chanjingToken(); const portrait = input.aspectRatio === "9:16";
  const figureType = typeof input.asset.metadata_json?.figure_type === "string" ? input.asset.metadata_json.figure_type : "";
  const screenWidth = portrait ? 1080 : 1920; const screenHeight = portrait ? 1920 : 1080;
  const sourceWidth = Number(input.asset.metadata_json?.width || input.asset.metadata_json?.source_width || screenWidth);
  const sourceHeight = Number(input.asset.metadata_json?.height || input.asset.metadata_json?.source_height || screenHeight);
  const scale = Math.min(screenWidth / Math.max(1, sourceWidth), screenHeight / Math.max(1, sourceHeight), 1);
  const personWidth = Math.max(1, Math.round(sourceWidth * scale)); const personHeight = Math.max(1, Math.round(sourceHeight * scale));
  const personX = Math.round((screenWidth - personWidth) / 2); const personY = Math.round((screenHeight - personHeight) / 2);
  const background = input.background || { type: "color" as const, color: "#F5F2EC", url: "" };
  const replace=background.type!=="original"; const canReplace=input.asset.metadata_json?.supports_remove_background===true;
  if(replace&&!canReplace)throw new Error("这个数字人创建时未开启场景替换，请重新创建支持换背景的数字人或选择原始背景");
  const preset = background.type === "color" ? await scenePresetFile(background.color) : null;
  const presetUpload = preset ? await uploadChanjing(preset, "make_video_background", token) : null;
  const backgroundAsset = presetUpload ? { file_id: presetUpload.fileId } : background.type === "url" ? { src_url: background.url } : null;
  // Background removal must be enabled twice in Chanjing: once while training
  // the customised person and again on the person layer of each composition.
  // Supplying only bg/bg_color changes the canvas behind the original video;
  // it does not remove the source video's background.
  const subtitleConfig = input.subtitleEnabled
    ? portrait
      ? { show: true, x: 31, y: 1521, width: 1000, height: 200, font_size: 64, color: "#FFFFFF", stroke_color: "#000000", stroke_width: 7, asr_type: 0 }
      : { show: true, x: 60, y: 820, width: 1800, height: 180, font_size: 54, color: "#FFFFFF", stroke_color: "#000000", stroke_width: 7, asr_type: 0 }
    : { show: false };
  const body = {
    person: { id: input.asset.provider_avatar_id, ...(figureType ? { figure_type: figureType } : {}), x: personX, y: personY, width: personWidth, height: personHeight, ...(replace && canReplace ? { is_remove_bg: true } : {}) },
    audio: { tts: { text: [input.script], speed: 1, pitch: 1, audio_man: voiceId }, type: "tts", volume: 100, language: "cn" },
    ...(replace && !backgroundAsset ? { bg_color: background.color } : {}),
    ...(backgroundAsset ? { bg: { ...backgroundAsset, x: 0, y: 0, width: screenWidth, height: screenHeight } } : {}),
    screen_width: screenWidth,
    screen_height: screenHeight,
    backway: 1,
    model: 1,
    resolution_rate: 0,
    subtitle_config: subtitleConfig,
    add_compliance_watermark: true,
    compliance_watermark_position: 0,
  };
  const payload = await jsonResponse(await fetch(`${chanjingBase}/open/v1/create_video`, { method: "POST", headers: { access_token: token, "content-type": "application/json" }, body: JSON.stringify(body) }));
  if (Number(payload.code) !== 0) throw new Error(String(payload.msg || "禅境视频创建失败"));
  return { jobId: String(payload.data || ""), sessionId: "", request: { aspectRatio: input.aspectRatio, background, native_parameters: { figure_type: figureType || null, person: { x: personX, y: personY, width: personWidth, height: personHeight, is_remove_bg: replace && canReplace }, model: 1, resolution_rate: 0, subtitle: input.subtitleEnabled, background: replace } } };
}

export async function listChanjingResourceLibrary(personTag?: string) {
  const token = await chanjingToken();
  const [firstPeoplePayload, voicesPayload] = await Promise.all([
    jsonResponse(await fetch(`${chanjingBase}/open/v1/list_common_dp?page=1&size=50`, { headers: { access_token: token }, cache: "no-store" })),
    jsonResponse(await fetch(`${chanjingBase}/open/v1/list_common_audio?page=1&size=100`, { headers: { access_token: token }, cache: "no-store" })),
  ]);
  const firstData = firstPeoplePayload.data as JsonRecord | undefined;
  const pageInfo = firstData?.page_info as JsonRecord | undefined;
  const totalPages = personTag ? Math.max(1, Number(pageInfo?.total_page || 1)) : 1;
  const remainingPages = totalPages > 1
    ? await Promise.all(Array.from({ length: totalPages - 1 }, async (_, index) => {
        const payload = await jsonResponse(await fetch(`${chanjingBase}/open/v1/list_common_dp?page=${index + 2}&size=50`, { headers: { access_token: token }, cache: "no-store" }));
        return (((payload.data as JsonRecord | undefined)?.list ?? []) as JsonRecord[]);
      }))
    : [];
  const allPeople = [((firstData?.list ?? []) as JsonRecord[]), ...remainingPages].flat();
  const people = personTag
    ? allPeople.filter((person) => ((person.tag_names as string[] | undefined) ?? []).includes(personTag))
    : allPeople;
  const templates: DigitalHumanTemplate[] = people.flatMap((person) => ((person.figures as JsonRecord[] | undefined) ?? []).map((figure) => ({
    provider: "chanjing" as const,
    id: String(person.id || ""),
    name: String(person.name || "平台数字人"),
    figure_type: String(figure.type || ""),
    width: Number(figure.width || 0),
    height: Number(figure.height || 0),
    voice_id: String(person.audio_man_id || ""),
    voice_name: String(person.audio_name || ""),
    cover_url: String(figure.cover || ""),
    preview_url: String(figure.preview_video_url || person.preview_url || ""),
    gender: String(person.gender || ""),
    tag_names: ((person.tag_names as string[] | undefined) ?? []).filter(Boolean),
  })).filter((item) => item.id && item.figure_type));
  const voices = (((voicesPayload.data as JsonRecord | undefined)?.list ?? []) as JsonRecord[]).map((voice): DigitalHumanVoice => ({
    id: `public:${String(voice.id || "")}`,
    provider: "chanjing",
    name: String(voice.name || "平台声音"),
    source: "public",
    status: "ready",
    provider_voice_id: String(voice.id || ""),
    preview_audio_url: String(voice.audition || ""),
    gender: String(voice.gender || ""),
    language: String(voice.lang || ""),
  })).filter((voice) => voice.provider_voice_id);
  return { templates, voices };
}

export async function createChanjingCreatorVoice(input: { name: string; referenceUrl: string }) {
  const token = await chanjingToken();
  const payload = await jsonResponse(await fetch(`${chanjingBase}/open/v1/create_customised_audio`, { method: "POST", headers: { access_token: token, "content-type": "application/json" }, body: JSON.stringify({ name: input.name, url: input.referenceUrl, model_type: "Cicada3.0-turbo", language: "cn" }) }));
  if (Number(payload.code) !== 0) throw new Error(String(payload.msg || "声音克隆任务创建失败"));
  return String(payload.data || "");
}

export async function refreshChanjingCreatorVoice(voiceId: string) {
  const token = await chanjingToken();
  const payload = await jsonResponse(await fetch(`${chanjingBase}/open/v1/customised_audio?id=${encodeURIComponent(voiceId)}`, { headers: { access_token: token }, cache: "no-store" }));
  const data = payload.data as JsonRecord; const status = Number(data.status);
  return { status: status === 2 ? "ready" as const : status === 4 || status === 99 ? "failed" as const : "creating" as const, previewUrl: String(data.audio_path || ""), error: String(data.err_msg || "") };
}

export async function createChanjingVoicePreview(voiceId: string) {
  const token = await chanjingToken();
  const voicesPayload = await jsonResponse(await fetch(`${chanjingBase}/open/v1/list_common_audio?page=1&size=100`, { headers: { access_token: token }, cache: "no-store" }));
  if (Number(voicesPayload.code) === 0) {
    const voices = (((voicesPayload.data as JsonRecord | undefined)?.list ?? []) as JsonRecord[]);
    const commonVoice = voices.find((voice) => String(voice.id || "") === voiceId);
    const audition = String(commonVoice?.audition || "");
    if (audition) return audition;
  }
  const created = await jsonResponse(await fetch(`${chanjingBase}/open/v1/create_audio_task`, { method: "POST", headers: { access_token: token, "content-type": "application/json" }, body: JSON.stringify({ audio_man: voiceId, speed: 1, pitch: 1, text: { text: "你好，我是你的数字分身。很高兴认识你，接下来让我们一起创作更多精彩内容。" }, aigc_watermark: false }) }));
  if (Number(created.code) !== 0) throw new Error(String(created.msg || "声音试听生成失败"));
  const taskId = String((created.data as JsonRecord | undefined)?.task_id || created.data || "");
  if (!taskId) throw new Error("声音试听任务创建失败");
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const state = await jsonResponse(await fetch(`${chanjingBase}/open/v1/audio_task_state`, { method: "POST", headers: { access_token: token, "content-type": "application/json" }, body: JSON.stringify({ task_id: taskId }), cache: "no-store" }));
    if (Number(state.code) !== 0) throw new Error(String(state.msg || "声音试听状态查询失败"));
    const data = state.data as JsonRecord | undefined; const status = Number(data?.status || 0);
    const url = String((data?.full as JsonRecord | undefined)?.url || "");
    if (status === 9 && url) return url;
    if (![0, 1].includes(status)) throw new Error(String(data?.errMsg || data?.errReason || `声音试听生成失败（状态 ${status}）`));
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error("声音试听生成超时，请稍后重试");
}

export async function getProviderVideo(input: { provider: "heygen" | "chanjing"; jobId: string }) {
  if (input.provider === "heygen") {
    const payload = await jsonResponse(await fetch(`${heygenBase}/v3/videos/${encodeURIComponent(input.jobId)}`, { headers: heygenHeaders(), cache: "no-store" })); const data = payload.data as JsonRecord; const raw = String(data.status || "");
    return { status: raw === "completed" ? "completed" as const : raw === "failed" ? "failed" as const : "processing" as const, progress: raw === "completed" ? 100 : Number(data.progress || 20), videoUrl: String(data.video_url || ""), previewImageUrl: String(data.thumbnail_url || ""), duration: Number(data.duration || 0), error: String((data.error as JsonRecord | undefined)?.message || "") };
  }
  const token = await chanjingToken(); const payload = await jsonResponse(await fetch(`${chanjingBase}/open/v1/video?id=${encodeURIComponent(input.jobId)}`, { headers: { access_token: token }, cache: "no-store" })); const data = payload.data as JsonRecord; const status = Number(data.status);
  return { status: status === 30 ? "completed" as const : status >= 40 ? "failed" as const : "processing" as const, progress: Number(data.progress || 0), videoUrl: String(data.video_url || ""), previewImageUrl: String(data.preview_url || ""), duration: Number(data.duration || 0), error: String(data.msg || "") };
}

export async function providerAvailability() {
  const settings = await tryGetSystemSettings();
  return {
    heygen: settings.digitalHuman.enabled && settings.digitalHuman.heygenEnabled && Boolean(process.env.HEYGEN_API_KEY),
    chanjing: settings.digitalHuman.enabled && settings.digitalHuman.chanjingEnabled && Boolean(process.env.CHANJING_APP_ID && process.env.CHANJING_SECRET_KEY),
  };
}

export async function createChanjingGeneratedPhoto(input: { age: "Young adult" | "Adult" | "Teenager" | "Elderly"; gender: "Male" | "Female"; detail: string; background?: string; talkingPose?: string; aspectRatio: "9:16" | "16:9" }) {
  const token = await chanjingToken();
  const payload = await jsonResponse(await fetch(`${chanjingBase}/open/v1/aigc/photo`, { method: "POST", headers: { access_token: token, "content-type": "application/json" }, body: JSON.stringify({ age: input.age, gender: input.gender, detail: input.detail, background: input.background || "", talking_pose: input.talkingPose || "上半身正面口播构图", aspect_ratio: input.aspectRatio === "9:16" ? 0 : 1, number_of_images: 1, origin: "Chinese", model: "4.0" }) }));
  if (Number(payload.code) !== 0 || !payload.data) throw new Error(String(payload.msg || "数字人图片任务创建失败"));
  return String(payload.data);
}

export async function getChanjingGeneratedPhoto(taskId: string) {
  const token = await chanjingToken();
  const payload = await jsonResponse(await fetch(`${chanjingBase}/open/v1/aigc/photo/task?unique_id=${encodeURIComponent(taskId)}`, { headers: { access_token: token }, cache: "no-store" }));
  if (Number(payload.code) !== 0) throw new Error(String(payload.msg || "数字人图片任务查询失败"));
  const data = payload.data as JsonRecord | undefined; const progress = String(data?.progress_desc || ""); const urls = Array.isArray(data?.output_url) ? data.output_url : [];
  return { status: progress === "Success" ? "ready" as const : ["Error", "Fail"].includes(progress) ? "failed" as const : "creating" as const, imageUrl: String(urls[0] || ""), error: String(data?.err_msg || "") };
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
