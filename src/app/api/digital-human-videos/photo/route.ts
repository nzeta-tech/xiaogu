import { requireSessionUser } from "@/lib/auth/session";
import { storeDigitalHumanMedia } from "@/lib/digital-human/media-assets";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || form?.get("consent") !== "true") return Response.json({ error: "请选择本人有权使用的照片" }, { status: 400 });
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 15 * 1024 * 1024 || file.size < 1024) return Response.json({ error: "请上传 15 MB 内的 JPG、PNG 或 WebP 照片" }, { status: 400 });
  const bytes = Buffer.from(await file.arrayBuffer());
  const id = await storeDigitalHumanMedia({ userId: user.id, kind: "input_photo", bytes, contentType: file.type, fileName: file.name });
  return Response.json({ id, url: `/api/digital-human-media/${id}` }, { status: 201 });
}
