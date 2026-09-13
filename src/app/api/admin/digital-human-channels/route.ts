import { requireSessionUser } from "@/lib/auth/session";
import { query } from "@/lib/db/client";
import { tryGetSystemSettings } from "@/lib/db/repositories";

export async function GET() {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  if (user.role !== "admin") return Response.json({ error: "无权查看数字人渠道" }, { status: 403 });
  const settings = await tryGetSystemSettings();
  const media = await query<{ count: number; bytes: string; database_count: number; s3_count: number; local_disk_count:number; local_disk_bytes:string }>(`select count(*)::int count,coalesce(sum(size_bytes),0)::bigint::text bytes,count(*) filter(where storage_provider='database')::int database_count,count(*) filter(where storage_provider='s3')::int s3_count,count(*) filter(where storage_provider='local_disk')::int local_disk_count,coalesce(sum(size_bytes) filter(where storage_provider='local_disk'),0)::bigint::text local_disk_bytes from digital_human_media_assets`).catch(() => ({ rows: [{ count: 0, bytes: "0", database_count: 0, s3_count: 0,local_disk_count:0,local_disk_bytes:"0" }] }));
  const database = await query<{ bytes: string }>(`select pg_database_size(current_database())::bigint::text bytes`).catch(() => ({ rows: [{ bytes: "0" }] }));
  return Response.json({
    channels: [
      { id: "heygen", label: "快速形象通道", provider: "HeyGen", enabled: settings.digitalHuman.heygenEnabled, configured: Boolean(process.env.HEYGEN_API_KEY) },
      { id: "chanjing", label: "高还原形象通道", provider: "禅境", enabled: settings.digitalHuman.chanjingEnabled, configured: Boolean(process.env.CHANJING_APP_ID && process.env.CHANJING_SECRET_KEY) },
    ],
    storage: { ...media.rows[0], databaseBytes: database.rows[0]?.bytes ?? "0", s3Configured: Boolean(settings.backup.s3Enabled && settings.backup.s3Bucket && settings.backup.s3SecretEncrypted),localDiskEnabled:settings.digitalHuman.localDiskEnabled,localDiskPath:process.env.DIGITAL_HUMAN_LOCAL_STORAGE_DIR||settings.digitalHuman.localDiskPath,localDiskNodeId:settings.digitalHuman.localDiskNodeId, maxFileMb: settings.digitalHuman.databaseMaxFileMb, warningMb: settings.digitalHuman.databaseWarningMb },
  });
}
