import { z } from "zod";
import { requireSessionUser } from "@/lib/auth/session";
import { tryCreateAdminAuditLog, tryListAdminViralContents, tryUpdateAdminViralContentStatus, tryUpsertAdminViralContent } from "@/lib/db/repositories";

const schema = z.object({
  id: z.string().uuid().optional(), title: z.string().trim().min(1).max(160),
  platform: z.enum(["抖音", "视频号", "公众号", "小红书"]),
  contentType: z.enum(["短视频", "爆文", "图文", "直播切片"]),
  category: z.string().trim().min(1).max(60), tags: z.array(z.string().trim().min(1).max(30)).max(20),
  sourceUrl: z.string().trim().url(), sourceTitle: z.string().trim().max(160).optional(), sourceAuthor: z.string().trim().max(80).optional(),
  thumbnailUrl: z.string().trim().url().optional().or(z.literal("")), mediaUrl: z.string().trim().url().optional().or(z.literal("")), embedUrl: z.string().trim().url().optional().or(z.literal("")),
  articleBody: z.string().max(50000).optional(), summary: z.string().max(1000).optional(), metricLabel: z.string().max(30).optional(), metricValue: z.number().int().nonnegative().nullable().optional(), metricUnit: z.string().max(20).optional(), insight: z.string().max(2000).optional(), creationScenes: z.array(z.string().trim().max(60)).max(20).optional(), riskNote: z.string().max(1000).optional(),
  status: z.enum(["draft", "pending_review", "published", "offline", "expired"]), isPinned: z.boolean().optional(), isFeatured: z.boolean().optional(), sortOrder: z.number().int().min(0).max(100000).optional(), publishAt: z.string().datetime().nullable().optional(), expireAt: z.string().datetime().nullable().optional(),
});

async function requireAdmin() {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  if (user.role !== "admin") return Response.json({ error: "无权访问爆款资源管理" }, { status: 403 });
  return user;
}

export async function GET() {
  const user = await requireAdmin();
  if (user instanceof Response) return user;
  return Response.json({ contents: await tryListAdminViralContents(), mode: "server" });
}

export async function POST(request: Request) {
  const user = await requireAdmin();
  if (user instanceof Response) return user;
  const input = schema.parse(await request.json());
  if (input.status === "published" && !input.insight?.trim()) return Response.json({ error: "发布前请填写推荐角度" }, { status: 400 });
  const content = await tryUpsertAdminViralContent({ ...input, thumbnailUrl: input.thumbnailUrl || null, mediaUrl: input.mediaUrl || null, embedUrl: input.embedUrl || null, updatedBy: user.id });
  if (!content) return Response.json({ error: "爆款资源保存失败，请确认数据库迁移已执行" }, { status: 503 });
  await tryCreateAdminAuditLog({ adminUserId: user.id, action: input.id ? "viral_content.update" : "viral_content.create", targetType: "viral_content", targetId: String(content.id), detail: { title: input.title, status: input.status } });
  return Response.json({ content, mode: "server" });
}

export async function PATCH(request: Request) {
  const user = await requireAdmin();
  if (user instanceof Response) return user;
  const input = z.object({ id: z.string().uuid(), status: z.enum(["draft", "pending_review", "published", "offline", "expired"]) }).parse(await request.json());
  const content = await tryUpdateAdminViralContentStatus(input.id, input.status);
  if (!content) return Response.json({ error: "爆款资源状态更新失败" }, { status: 503 });
  await tryCreateAdminAuditLog({ adminUserId: user.id, action: "viral_content.update_status", targetType: "viral_content", targetId: input.id, detail: { status: input.status } });
  return Response.json({ content, mode: "server" });
}
