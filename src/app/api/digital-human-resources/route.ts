import { z } from "zod";
import { requireSessionUser } from "@/lib/auth/session";
import { createChanjingCreatorVoice, listChanjingResourceLibrary, publicDigitalHumanError, refreshChanjingCreatorVoice } from "@/lib/digital-human/providers";
import { activateChanjingTemplate, insertCreatorVoice, listCreatorVoices, removePublicVoiceFavorite, savePublicVoice, updateCreatorVoice } from "@/lib/digital-human/store";
import type { DigitalHumanVoice } from "@/lib/digital-human/types";

export async function GET() {
  const user = await requireSessionUser(); if (user instanceof Response) return user;
  try {
    const [library, creatorRows] = await Promise.all([listChanjingResourceLibrary("金融保险顾问"), listCreatorVoices(user.id)]);
    const creatorVoices: DigitalHumanVoice[] = creatorRows.map((voice) => ({ id: voice.id, provider: voice.provider, name: voice.name, source: "creator", status: voice.status, provider_voice_id: voice.provider_voice_id || "", preview_audio_url: voice.preview_audio_url || "", error_message: voice.error_message || undefined, is_favorite: voice.metadata_json?.source === "public_favorite" }));
    return Response.json({ templates: library.templates, voices: [...creatorVoices, ...library.voices] });
  } catch (error) { return Response.json({ error: publicDigitalHumanError(error, "数字人资源库加载失败") }, { status: 502 }); }
}

const createSchema = z.object({ name: z.string().trim().min(2).max(80), referenceUrl: z.string().url().refine((url) => /^https:\/\//i.test(url), "参考音频必须是 HTTPS 公网地址"), consent: z.literal(true) });
export async function POST(request: Request) {
  const user = await requireSessionUser(); if (user instanceof Response) return user;
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message || "声音资料不完整" }, { status: 400 });
  try { const providerVoiceId = await createChanjingCreatorVoice(parsed.data); const voice = await insertCreatorVoice({ userId: user.id, name: parsed.data.name, referenceUrl: parsed.data.referenceUrl, providerVoiceId }); return Response.json({ voice }, { status: 202 }); }
  catch (error) { return Response.json({ error: publicDigitalHumanError(error, "声音克隆任务创建失败") }, { status: 502 }); }
}

const refreshSchema = z.object({ id: z.string().uuid() });
export async function PATCH(request: Request) {
  const user = await requireSessionUser(); if (user instanceof Response) return user;
  const parsed = refreshSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return Response.json({ error: "声音参数无效" }, { status: 400 });
  const voice = (await listCreatorVoices(user.id)).find((item) => item.id === parsed.data.id); if (!voice?.provider_voice_id) return Response.json({ error: "声音不存在" }, { status: 404 });
  try { const remote = await refreshChanjingCreatorVoice(voice.provider_voice_id); await updateCreatorVoice(user.id, voice.id, { status: remote.status, previewUrl: remote.previewUrl, error: remote.error }); return Response.json({ ok: true }); }
  catch (error) { return Response.json({ error: publicDigitalHumanError(error, "刷新失败") }, { status: 502 }); }
}

const favoriteVoiceSchema = z.object({ action: z.literal("save-public-voice"), provider: z.enum(["heygen", "chanjing"]), name: z.string().trim().min(1).max(100), voiceId: z.string().min(1).max(200), previewUrl: z.string().url().optional().or(z.literal("")) });
const templateSchema = z.object({ personId: z.string().min(1).max(200), name: z.string().min(1).max(100), figureType: z.string().min(1).max(80), voiceId: z.string().max(200).optional().default(""), coverUrl: z.string().url().optional().or(z.literal("")), previewUrl: z.string().url().optional().or(z.literal("")), width: z.number().int().nonnegative(), height: z.number().int().nonnegative() });
export async function PUT(request: Request) {
  const user = await requireSessionUser(); if (user instanceof Response) return user;
  const body = await request.json().catch(() => null);
  const favorite = favoriteVoiceSchema.safeParse(body);
  if (favorite.success) {
    const voice = await savePublicVoice({ userId: user.id, provider: favorite.data.provider, name: favorite.data.name, providerVoiceId: favorite.data.voiceId, previewUrl: favorite.data.previewUrl || "" });
    return Response.json({ voice });
  }
  const parsed = templateSchema.safeParse(body); if (!parsed.success) return Response.json({ error: "资源参数无效" }, { status: 400 });
  const asset = await activateChanjingTemplate({ userId: user.id, ...parsed.data, coverUrl: parsed.data.coverUrl || "", previewUrl: parsed.data.previewUrl || "" });
  return Response.json({ asset });
}

export async function DELETE(request: Request) {
  const user = await requireSessionUser(); if (user instanceof Response) return user;
  const id = new URL(request.url).searchParams.get("id") || "";
  const parsed = z.string().uuid().safeParse(id); if (!parsed.success) return Response.json({ error: "声音参数无效" }, { status: 400 });
  const removed = await removePublicVoiceFavorite(user.id, parsed.data);
  if (!removed) return Response.json({ error: "收藏声音不存在" }, { status: 404 });
  return Response.json({ ok: true });
}
