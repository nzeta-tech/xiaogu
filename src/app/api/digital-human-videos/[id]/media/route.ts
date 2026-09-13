import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { requireSessionUser } from "@/lib/auth/session";
import { getDigitalHumanVideoJob } from "@/lib/digital-human/store";
import { readDigitalHumanMedia } from "@/lib/digital-human/media-assets";

function byteRange(size: number, rangeHeader: string | null) {
  const match = rangeHeader?.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return null;
  const start = match[1] ? Number(match[1]) : 0;
  const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= size) return null;
  return { start, end };
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  const { id } = await context.params;
  const job = await getDigitalHumanVideoJob(user.id, id);
  if (!job) return Response.json({ error: "视频任务不存在" }, { status: 404 });

  const url = new URL(request.url);
  const poster = url.searchParams.get("asset") === "poster";
  const source = poster ? job.preview_image_url : job.video_url;
  if (!source) return Response.json({ error: poster ? "封面尚未生成" : "视频尚未生成" }, { status: 404 });

  if (!poster && source.startsWith("/api/digital-human-media/")) {
    const mediaId = source.split("/").filter(Boolean).at(-1) || "";
    const media = await readDigitalHumanMedia(user.id, mediaId);
    if (!media) return Response.json({ error: "视频文件不存在" }, { status: 404 });
    const filePath = "filePath" in media && typeof media.filePath === "string" ? media.filePath : null;
    const bytes = "bytes" in media && Buffer.isBuffer(media.bytes) ? media.bytes : null;
    if (!filePath && !bytes) return Response.json({ error: "视频文件不存在" }, { status: 404 });
    const size = Number(media.row.size_bytes) || bytes?.length || 0;
    const range = byteRange(size, request.headers.get("range"));
    const headers: Record<string, string> = {
      "content-type": media.row.content_type,
      "accept-ranges": "bytes",
      "cache-control": "private, max-age=300",
      "content-disposition": `${url.searchParams.get("download") === "1" ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(media.row.original_filename)}`,
    };
    if (range) {
      headers["content-range"] = `bytes ${range.start}-${range.end}/${size}`;
      headers["content-length"] = String(range.end - range.start + 1);
      const body = filePath ? Readable.toWeb(createReadStream(filePath, { start: range.start, end: range.end })) : bytes!.subarray(range.start, range.end + 1);
      return new Response(body as BodyInit, { status: 206, headers });
    }
    headers["content-length"] = String(size);
    const body = filePath ? Readable.toWeb(createReadStream(filePath)) : bytes!;
    return new Response(body as BodyInit, { headers });
  }

  let remote: URL;
  try { remote = new URL(source); } catch { return Response.json({ error: "媒体地址不可用" }, { status: 502 }); }
  if (remote.protocol !== "https:") return Response.json({ error: "媒体地址不可用" }, { status: 502 });
  const upstream = await fetch(remote, { headers: request.headers.get("range") ? { range: request.headers.get("range")! } : undefined, signal: AbortSignal.timeout(120000) });
  if (!upstream.ok && upstream.status !== 206) return Response.json({ error: "媒体读取失败" }, { status: 502 });
  const headers = new Headers();
  for (const key of ["content-type", "content-length", "content-range", "accept-ranges", "etag", "last-modified"]) {
    const value = upstream.headers.get(key); if (value) headers.set(key, value);
  }
  headers.set("cache-control", "private, max-age=300");
  headers.set("content-disposition", `${url.searchParams.get("download") === "1" ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(`${job.title || "video"}.${poster ? "jpg" : "mp4"}`)}`);
  return new Response(upstream.body, { status: upstream.status, headers });
}
