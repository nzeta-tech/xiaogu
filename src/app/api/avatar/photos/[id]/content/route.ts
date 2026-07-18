import { requireSessionUser } from "@/lib/auth/session";
import { readAvatarVisualAsset } from "@/lib/avatar/visual-assets";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  const { id } = await context.params;
  const result = await readAvatarVisualAsset(user.id, id);
  if (!result?.bytes.length) return Response.json({ error: "形象照不存在" }, { status: 404 });
  return new Response(new Uint8Array(result.bytes), {
    headers: {
      "content-type": result.asset.content_type,
      "content-length": String(result.bytes.length),
      "cache-control": "private, max-age=0, must-revalidate",
      "x-content-type-options": "nosniff",
    },
  });
}
