import { readFile, stat } from "node:fs/promises";
import { requireSessionUser } from "@/lib/auth/session";
import { getPeoplePortrait } from "@/lib/digital-human/people-portrait-library";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  const portrait = await getPeoplePortrait((await context.params).id);
  if (!portrait) return Response.json({ error: "照片模板不存在" }, { status: 404 });
  const [bytes, info] = await Promise.all([readFile(portrait.filePath), stat(portrait.filePath)]);
  const contentType = portrait.filePath.endsWith(".png") ? "image/png" : portrait.filePath.endsWith(".webp") ? "image/webp" : "image/jpeg";
  return new Response(bytes, { headers: { "content-type": contentType, "content-length": String(info.size), "cache-control": "private, max-age=3600", "x-content-type-options": "nosniff" } });
}
