import { z } from "zod";
import { requireSessionUser } from "@/lib/auth/session";
import { getDigitalHumanAsset, updateDigitalHumanAsset } from "@/lib/digital-human/store";
import { createChanjingVoicePreview, publicDigitalHumanError } from "@/lib/digital-human/providers";

export const runtime = "nodejs";
const schema = z.object({ assetId: z.string().uuid() });

export async function POST(request: Request) {
  const user = await requireSessionUser(); if (user instanceof Response) return user;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "数字人参数不正确" }, { status: 400 });
  const asset = await getDigitalHumanAsset(user.id, parsed.data.assetId);
  if (!asset || !asset.provider_voice_id) return Response.json({ error: "当前数字人尚未绑定可试听声音" }, { status: 404 });
  const cached = typeof asset.metadata_json?.voice_preview_url === "string" ? asset.metadata_json.voice_preview_url : "";
  if (cached) return Response.json({ url: cached, cached: true });
  if (asset.provider !== "chanjing") return Response.json({ error: "当前声音渠道暂未提供独立试听" }, { status: 409 });
  try {
    const url = await createChanjingVoicePreview(asset.provider_voice_id);
    await updateDigitalHumanAsset(user.id, asset.id, { metadata_json: { voice_preview_url: url } });
    return Response.json({ url, cached: false });
  } catch (error) {
    return Response.json({ error: publicDigitalHumanError(error, error instanceof Error ? error.message : "声音试听生成失败") }, { status: 502 });
  }
}
