import { requireSessionUser } from "@/lib/auth/session";
import { storeUploadedViralCover } from "@/lib/viral-cover-assets";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  if (user.role !== "admin") return Response.json({ error: "无权上传爆款封面" }, { status: 403 });
  const form = await request.formData().catch(() => null);
  const contentId = String(form?.get("contentId") ?? "");
  const file = form?.get("file");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(contentId) || !(file instanceof File)) return Response.json({ error: "封面上传参数无效" }, { status: 400 });
  try {
    const cover = await storeUploadedViralCover({ contentId, contentType: file.type, bytes: Buffer.from(await file.arrayBuffer()) });
    return Response.json({ cover, url: `/api/viral-covers/${contentId}` }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "封面上传失败" }, { status: 422 });
  }
}
