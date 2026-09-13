import { requireSessionUser } from "@/lib/auth/session";
import { listXiaoguVideoTemplates, type VideoTemplateCollection } from "@/lib/digital-human/video-template-library";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  const query = new URL(request.url).searchParams;
  const collection = query.get("collection") === "production" ? "production" : "expressive" satisfies VideoTemplateCollection;
  const page = Math.max(1, Number(query.get("page") || 1));
  const pageSize = Math.min(30, Math.max(1, Number(query.get("pageSize") || 18)));
  const result = await listXiaoguVideoTemplates({ collection, category: query.get("category") || "", aspectRatio: query.get("aspectRatio") || "all", search: query.get("search") || "", page, pageSize });
  return Response.json(result, { headers: { "cache-control": "private, max-age=30" } });
}
