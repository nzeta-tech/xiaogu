import { z } from "zod";
import { requireSessionUser } from "@/lib/auth/session";
import { tryCreateAdminAuditLog, tryDeleteAnnouncement, tryListAdminAnnouncements, tryUpdateAnnouncementStatus, tryUpsertAnnouncement } from "@/lib/db/repositories";

const schema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(120),
  content: z.string().trim().min(1).max(5000),
  kind: z.enum(["notice", "campaign", "update"]).default("notice"),
  placement: z.enum(["global", "dashboard", "billing"]).default("global"),
  status: z.enum(["draft", "published"]).default("draft"),
  linkUrl: z.string().trim().url().optional().or(z.literal("")),
  isPinned: z.boolean().optional(),
});

async function requireAdmin() {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  if (user.role !== "admin") return Response.json({ error: "无权访问公告管理" }, { status: 403 });
  return user;
}

export async function GET() {
  const user = await requireAdmin();
  if (user instanceof Response) return user;

  const announcements = await tryListAdminAnnouncements();
  return Response.json({ announcements, mode: "server" });
}

export async function POST(request: Request) {
  const user = await requireAdmin();
  if (user instanceof Response) return user;

  const input = schema.parse(await request.json());
  const announcement = await tryUpsertAnnouncement({
    id: input.id,
    title: input.title,
    content: input.content,
    kind: input.kind,
    placement: input.placement,
    status: input.status,
    linkUrl: input.linkUrl || null,
    isPinned: input.isPinned,
  });

  if (!announcement) {
    return Response.json({ error: "公告保存失败" }, { status: 503 });
  }
  await tryCreateAdminAuditLog({
    adminUserId: user.id,
    action: input.id ? "announcement.update" : "announcement.create",
    targetType: "announcement",
    targetId: announcement.id,
    detail: { title: input.title, status: input.status, placement: input.placement },
  });
  return Response.json({ announcement, mode: "server" });
}

export async function PATCH(request: Request) {
  const user = await requireAdmin();
  if (user instanceof Response) return user;

  const input = z.object({ id: z.string().uuid(), status: z.enum(["draft", "published"]) }).parse(await request.json());
  const announcement = await tryUpdateAnnouncementStatus(input);
  if (!announcement) return Response.json({ error: "公告状态更新失败" }, { status: 503 });

  await tryCreateAdminAuditLog({
    adminUserId: user.id,
    action: "announcement.update_status",
    targetType: "announcement",
    targetId: input.id,
    detail: { status: input.status },
  });

  return Response.json({ announcement, mode: "server" });
}

export async function DELETE(request: Request) {
  const user = await requireAdmin();
  if (user instanceof Response) return user;

  const { searchParams } = new URL(request.url);
  const id = z.string().uuid().parse(searchParams.get("id"));
  const ok = await tryDeleteAnnouncement(id);
  if (!ok) return Response.json({ error: "公告删除失败" }, { status: 503 });

  await tryCreateAdminAuditLog({
    adminUserId: user.id,
    action: "announcement.delete",
    targetType: "announcement",
    targetId: id,
  });

  return Response.json({ ok: true, mode: "server" });
}
