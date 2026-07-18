import { requireSessionUser } from "@/lib/auth/session";
import { getDatabaseBackupFile } from "@/lib/system/backup";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireSessionUser(); if (user instanceof Response) return user;
  if (user.role !== "admin") return Response.json({ error: "无权下载备份" }, { status: 403 });
  const { id } = await context.params;
  const file = await getDatabaseBackupFile(id);
  if (!file) return Response.json({ error: "备份不存在" }, { status: 404 });
  return new Response(file.data, { headers: { "content-type": "application/gzip", "content-disposition": `attachment; filename="${file.backup.filename}"`, "cache-control": "no-store" } });
}
