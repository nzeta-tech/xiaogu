import { open, readFile } from "node:fs/promises";
import { requireSessionUser } from "@/lib/auth/session";
import { resolveXiaoguVideoTemplateMedia, type VideoTemplateCollection } from "@/lib/digital-human/video-template-library";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ collection: string; id: string; kind: string }> }) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  const { collection, id, kind } = await context.params;
  if (!(["expressive", "production"].includes(collection)) || !(["cover", "preview"].includes(kind))) return Response.json({ error: "模板素材参数无效" }, { status: 400 });
  const media = await resolveXiaoguVideoTemplateMedia(collection as VideoTemplateCollection, id, kind as "cover" | "preview");
  if (!media) return Response.json({ error: "模板素材暂不可用" }, { status: 404 });
  const range = request.headers.get("range");
  if (kind === "preview" && range) {
    const match = /^bytes=(\d+)-(\d*)$/.exec(range);
    if (!match) return new Response(null, { status: 416, headers: { "content-range": `bytes */${media.size}` } });
    const start = Number(match[1]);
    if (start >= media.size) return new Response(null, { status: 416, headers: { "content-range": `bytes */${media.size}` } });
    const requestedEnd = match[2] ? Number(match[2]) : start + 4 * 1024 * 1024 - 1;
    const end = Math.min(requestedEnd, start + 4 * 1024 * 1024 - 1, media.size - 1);
    const handle = await open(media.file, "r");
    try {
      const bytes = Buffer.alloc(end - start + 1);
      await handle.read(bytes, 0, bytes.length, start);
      return new Response(bytes, { status: 206, headers: { "content-type": media.contentType, "content-length": String(bytes.length), "content-range": `bytes ${start}-${end}/${media.size}`, "accept-ranges": "bytes", "cache-control": "private, max-age=3600", "x-content-type-options": "nosniff" } });
    } finally {
      await handle.close();
    }
  }
  const bytes = await readFile(media.file);
  return new Response(bytes, { headers: { "content-type": media.contentType, "content-length": String(bytes.length), "accept-ranges": kind === "preview" ? "bytes" : "none", "cache-control": "private, max-age=3600", "x-content-type-options": "nosniff" } });
}
