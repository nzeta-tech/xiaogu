import { requireSessionUser } from "@/lib/auth/session";
import { getOwnedPresentationArtifact } from "@/lib/ppt/jobs";
export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireSessionUser(); if (user instanceof Response) return user;
  const { id } = await context.params; const artifact = await getOwnedPresentationArtifact(user.id, id);
  if (!artifact) return Response.json({ error: "PPT 尚未生成完成" }, { status: 404 });
  return new Response(new Uint8Array(artifact.pptx_data), { headers: { "content-type": artifact.content_type, "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(artifact.filename)}`, "cache-control": "private, no-store" } });
}
