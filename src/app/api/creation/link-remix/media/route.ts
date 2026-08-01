import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { requireSessionUser } from "@/lib/auth/session";
import { douyinMediaDir } from "@/lib/creation/douyin-download";
import { isAuthorizedLocalAgentRequest } from "@/lib/local-agent/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const isAgentExecution = process.env.LOCAL_AGENT_EXECUTOR === "1" && isAuthorizedLocalAgentRequest(request);
  if (!isAgentExecution) {
    const user = await requireSessionUser();
    if (user instanceof Response) return user;
  }
  const file = new URL(request.url).searchParams.get("file") ?? "";
  if (!/^[a-zA-Z0-9._-]+\.(mp4|webm|jpg|jpeg|png)$/i.test(file)) return Response.json({ error: "媒体文件无效" }, { status: 400 });
  const target = path.join(path.resolve(douyinMediaDir), file);
  try {
    const info = await stat(target);
    if (!info.isFile() || info.size > 200 * 1024 * 1024) throw new Error("invalid_file");
    const bytes = await readFile(target);
    const type = /\.mp4$/i.test(file) ? "video/mp4" : /\.png$/i.test(file) ? "image/png" : "image/jpeg";
    return new Response(bytes, { headers: { "content-type": type, "content-length": String(bytes.length), "cache-control": "private, max-age=3600" } });
  } catch {
    return Response.json({ error: "媒体文件不存在或已过期" }, { status: 404 });
  }
}
