import { z } from "zod";

import { requireSessionUser } from "@/lib/auth/session";
import {
  createAvatarVisualAsset,
  deleteAvatarVisualAsset,
  listAvatarVisualAssets,
  MAX_AVATAR_VISUAL_ASSET_BYTES,
  updateAvatarVisualAsset,
} from "@/lib/avatar/visual-assets";

export const runtime = "nodejs";

const updateSchema = z.object({
  assetId: z.string().uuid(),
  role: z.enum(["portrait", "professional", "lifestyle", "full_body", "side_profile"]).optional(),
  label: z.string().trim().max(80).optional(),
  isPrimary: z.boolean().optional(),
  allowCreation: z.boolean().optional(),
  usageScopes: z.array(z.enum(["image-card", "personality-card", "wechat-images", "policy-renewal-card", "video-cover"])).min(1).max(5).optional(),
  status: z.enum(["active", "disabled"]).optional(),
});

export async function GET() {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  return Response.json({ photos: await listAvatarVisualAssets(user.id) });
}

export async function POST(request: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  const form = await request.formData().catch(() => null);
  if (!form) return Response.json({ error: "上传内容格式不正确" }, { status: 400 });
  const files = form.getAll("files").filter((item): item is File => item instanceof File);
  if (files.length === 0) return Response.json({ error: "请选择形象照" }, { status: 400 });
  if (files.length > 8) return Response.json({ error: "单次最多上传 8 张形象照" }, { status: 400 });

  const uploaded = [];
  const errors: Array<{ fileName: string; error: string }> = [];
  for (const file of files) {
    if (file.size > MAX_AVATAR_VISUAL_ASSET_BYTES) {
      errors.push({ fileName: file.name, error: "文件超过 10MB" });
      continue;
    }
    try {
      uploaded.push(await createAvatarVisualAsset({
        userId: user.id,
        fileName: file.name,
        contentType: file.type,
        bytes: Buffer.from(await file.arrayBuffer()),
      }));
    } catch (error) {
      errors.push({ fileName: file.name, error: error instanceof Error ? error.message : "上传失败" });
    }
  }
  return Response.json({ ok: uploaded.length > 0, photos: uploaded, errors }, { status: uploaded.length > 0 ? 201 : 400 });
}

export async function PATCH(request: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "更新内容不完整" }, { status: 400 });
  try {
    const photo = await updateAvatarVisualAsset({ userId: user.id, ...parsed.data });
    return Response.json({ ok: true, photo });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "更新失败" }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  const assetId = new URL(request.url).searchParams.get("id");
  if (!assetId || !z.string().uuid().safeParse(assetId).success) return Response.json({ error: "形象照参数不正确" }, { status: 400 });
  try {
    await deleteAvatarVisualAsset(user.id, assetId);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "删除失败" }, { status: 400 });
  }
}
