import { readFile } from "node:fs/promises";
import path from "node:path";

const root = path.join(process.cwd(), "research/provider-scene-catalog/2026-08-27/chanjing");
const files: Record<string, { cover: string; video: string }> = {
  "wenhao-sit": { cover: "covers/1421df93d7754ee19dcaa18e85b68f39-0-文昊-sit_body.png", video: "preview-videos/1421df93d7754ee19dcaa18e85b68f39-0-文昊-sit_body.mp4" },
  "xiaojie-standing": { cover: "covers/4fb93b8a099c496c90da45cbad37b32f-0-晓洁-whole_body.png", video: "preview-videos/4fb93b8a099c496c90da45cbad37b32f-0-晓洁-whole_body.mp4" },
  "haicheng-standing": { cover: "covers/ce393722e3b245bfa53d73bcec847ee3-0-海城-whole_body.png", video: "preview-videos/ce393722e3b245bfa53d73bcec847ee3-0-海城-whole_body.mp4" },
  "boyuan-sit": { cover: "covers/54f7e32ed99a45a18426835e6cfd4b33-0-博远-sit_body.png", video: "preview-videos/54f7e32ed99a45a18426835e6cfd4b33-0-博远-sit_body.mp4" },
  "wanru-sit": { cover: "covers/dbeb78b117054e7e8b8cd0cfe96b5bb5-0-婉茹-sit_body.png", video: "preview-videos/dbeb78b117054e7e8b8cd0cfe96b5bb5-0-婉茹-sit_body.mp4" },
  "haicheng-casual": { cover: "covers/f00abf066c0b4d16868c24aac0497171-0-海城-休闲-sit_body.png", video: "preview-videos/f00abf066c0b4d16868c24aac0497171-0-海城-休闲-sit_body.mp4" },
};

export async function GET(_request: Request, context: { params: Promise<{ sample: string; kind: string }> }) {
  const { sample, kind } = await context.params;
  const relative = kind === "cover" ? files[sample]?.cover : kind === "video" ? files[sample]?.video : undefined;
  if (!relative) return new Response("Not found", { status: 404 });
  try {
    const body = await readFile(path.join(root, relative));
    return new Response(body, { headers: { "content-type": kind === "cover" ? "image/png" : "video/mp4", "cache-control": "public, max-age=86400" } });
  } catch {
    return new Response("Reference media is unavailable", { status: 404 });
  }
}
