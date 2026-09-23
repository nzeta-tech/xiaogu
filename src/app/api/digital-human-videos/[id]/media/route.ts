import { mediaResponse } from "@/lib/digital-human/media-response";
import { MediaNodeError } from "@/lib/digital-human/media-node";
import { requireSessionUser } from "@/lib/auth/session";
import { getDigitalHumanVideoJob } from "@/lib/digital-human/store";
import { readDigitalHumanMedia } from "@/lib/digital-human/media-assets";

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

  if (source.startsWith("/api/digital-human-media/")) {
    const mediaId = source.split("/").filter(Boolean).at(-1) || "";
    try {
      const media = await readDigitalHumanMedia(user.id, mediaId);
      if (!media) return Response.json({error:"视频文件不存在"},{status:404});
      return await mediaResponse(media,request.headers.get("range"),url.searchParams.get("download")==="1");
    } catch(error) {return Response.json({error:error instanceof MediaNodeError?error.message:"媒体读取暂时不可用"},{status:error instanceof MediaNodeError?error.status:503});}
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
