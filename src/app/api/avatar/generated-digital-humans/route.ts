import { z } from "zod";
import { requireSessionUser } from "@/lib/auth/session";
import { createChanjingGeneratedPhoto, getChanjingGeneratedPhoto, publicDigitalHumanError } from "@/lib/digital-human/providers";
import { getDigitalHumanAsset, insertDigitalHumanAsset, updateDigitalHumanAsset } from "@/lib/digital-human/store";

const createSchema = z.object({ name: z.string().trim().min(2).max(80), age: z.enum(["Young adult","Adult","Teenager","Elderly"]), gender: z.enum(["Male","Female"]), detail: z.string().trim().min(4).max(1500), background: z.string().trim().max(1500).optional().default(""), talkingPose: z.string().trim().max(1500).optional().default(""), aspectRatio: z.enum(["9:16","16:9"]), consent: z.literal(true) });

export async function POST(request: Request) {
  const user = await requireSessionUser(); if (user instanceof Response) return user;
  const parsed = createSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message || "图片数字人资料不完整" }, { status: 400 });
  try { const taskId = await createChanjingGeneratedPhoto(parsed.data); const asset = await insertDigitalHumanAsset({ userId: user.id, provider: "chanjing", name: parsed.data.name, sourceType: "photo", metadata: { source: "chanjing_generated_photo", photo_task_id: taskId, aspect_ratio: parsed.data.aspectRatio, prompt: parsed.data.detail } }); return Response.json({ asset }, { status: 202 }); }
  catch (error) { return Response.json({ error: publicDigitalHumanError(error, "AI 照片数字人创建失败") }, { status: 502 }); }
}

export async function PATCH(request: Request) {
  const user = await requireSessionUser(); if (user instanceof Response) return user;
  const id = String((await request.json().catch(() => null))?.id || ""); const asset = await getDigitalHumanAsset(user.id, id); if (!asset || asset.metadata_json?.source !== "chanjing_generated_photo") return Response.json({ error: "AI 照片数字人不存在" }, { status: 404 });
  try { const remote = await getChanjingGeneratedPhoto(String(asset.metadata_json.photo_task_id || "")); const updated = await updateDigitalHumanAsset(user.id, asset.id, { status: remote.status, preview_image_url: remote.imageUrl || undefined, error_message: remote.error || null }); return Response.json({ asset: updated }); }
  catch (error) { return Response.json({ error: publicDigitalHumanError(error, "刷新图片生成状态失败") }, { status: 502 }); }
}
