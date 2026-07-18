import { z } from "zod";
import { requireSessionUser } from "@/lib/auth/session";
import { tryCreateAdminAuditLog, tryGetSystemSettings } from "@/lib/db/repositories";
import { createDatabaseBackup, deleteDatabaseBackup, listDatabaseBackups, restoreDatabaseBackup, testBackupStorage } from "@/lib/system/backup";
import { configureBackupScheduler } from "@/lib/system/backup-scheduler";

async function requireAdmin() { const user = await requireSessionUser(); if (user instanceof Response) return user; return user.role === "admin" ? user : Response.json({ error: "无权管理备份" }, { status: 403 }); }

export async function GET() {
  const user = await requireAdmin(); if (user instanceof Response) return user;
  configureBackupScheduler(await tryGetSystemSettings());
  return Response.json({ backups: await listDatabaseBackups() });
}

export async function POST(request: Request) {
  const user = await requireAdmin(); if (user instanceof Response) return user;
  const parsed = z.discriminatedUnion("action", [
    z.object({ action: z.literal("create") }),
    z.object({ action: z.literal("restore"), id: z.string().uuid(), confirmation: z.literal("恢复数据库") }),
    z.object({ action: z.literal("delete"), id: z.string().uuid() }),
    z.object({ action: z.literal("test_s3") }),
  ]).safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "备份操作参数不正确" }, { status: 400 });
  try {
    if (parsed.data.action === "create") {
      const backup = await createDatabaseBackup(user.id);
      await tryCreateAdminAuditLog({ adminUserId: user.id, action: "backup.create", targetType: "database_backup", targetId: backup.id, detail: { filename: backup.filename, rowCount: backup.rowCount } });
      return Response.json({ backup });
    }
    if (parsed.data.action === "test_s3") {
      await testBackupStorage();
      return Response.json({ ok: true });
    }
    if (parsed.data.action === "delete") {
      const ok = await deleteDatabaseBackup(parsed.data.id);
      if (!ok) return Response.json({ error: "备份不存在" }, { status: 404 });
      await tryCreateAdminAuditLog({ adminUserId: user.id, action: "backup.delete", targetType: "database_backup", targetId: parsed.data.id });
      return Response.json({ ok: true });
    }
    await createDatabaseBackup(user.id, "before_restore");
    await restoreDatabaseBackup(parsed.data.id);
    await tryCreateAdminAuditLog({ adminUserId: user.id, action: "backup.restore", targetType: "database_backup", targetId: parsed.data.id });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "备份操作失败" }, { status: 500 });
  }
}
