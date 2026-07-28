import { requireSessionUser } from "@/lib/auth/session";
import { readViralCover } from "@/lib/viral-cover-assets";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  const { id } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return Response.json({ error: "封面标识无效" }, { status: 400 });
  }
  const cover = await readViralCover(id);
  if (!cover) return Response.json({ error: "封面不存在" }, { status: 404 });
  return new Response(new Uint8Array(cover.bytes), {
    headers: {
      "content-type": cover.contentType,
      "cache-control": "private, max-age=86400",
      etag: `\"${cover.updatedAt}\"`,
    },
  });
}
