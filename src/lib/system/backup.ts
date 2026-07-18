import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzip, gunzip } from "node:zlib";
import { promisify } from "node:util";
import { getPool, query } from "@/lib/db/client";
import { tryGetSystemSettings } from "@/lib/db/repositories";
import { DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { decryptSettingSecret } from "@/lib/security/secrets";

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);
const backupDirectory = process.env.DATABASE_BACKUP_DIR ?? path.resolve(/*turbopackIgnore: true*/ process.cwd(), "..", ".xiaogu-backups");
const excludedTables = new Set(["schema_migrations", "database_backups"]);

export async function createDatabaseBackup(createdBy: string | null, reason = "manual") {
  await mkdir(/* turbopackIgnore: true */ backupDirectory, { recursive: true });
  const settings = await tryGetSystemSettings();
  const expiresAt = settings.backup.retentionDays > 0 ? new Date(Date.now() + settings.backup.retentionDays * 86_400_000) : null;
  const idResult = await query<{ id: string }>("insert into database_backups(filename,created_by,trigger_type,expires_at) values ($1,$2,$3,$4) returning id", [`pending-${randomUUID()}`, createdBy, reason === "scheduled" ? "scheduled" : "manual", expiresAt]);
  const id = idResult.rows[0].id;
  const filename = `xiaogu-${new Date().toISOString().replace(/[:.]/g, "-")}-${id.slice(0, 8)}.json.gz`;
  await query("update database_backups set filename=$2 where id=$1", [id, filename]);
  try {
    const tables = await listBackupTables();
    const data: Record<string, unknown[]> = {};
    let rowCount = 0;
    for (const table of tables) {
      const rows = await query<Record<string, unknown>>(`select * from ${quoteIdentifier(table)} order by 1`);
      data[table] = rows.rows;
      rowCount += rows.rowCount ?? 0;
    }
    const migrations = await query<{ version: string; applied_at: string }>("select version,applied_at from schema_migrations order by version");
    const manifest = { format: 1, createdAt: new Date().toISOString(), reason, migrations: migrations.rows, tableOrder: tables, data };
    const compressed = await gzipAsync(Buffer.from(JSON.stringify(manifest)), { level: 9 });
    const checksum = createHash("sha256").update(compressed).digest("hex");
    const filePath = resolveBackupPath(filename);
    await writeFile(/* turbopackIgnore: true */ filePath, compressed, { mode: 0o600 });
    await query("update database_backups set status='ready',size_bytes=$2,table_count=$3,row_count=$4,checksum=$5,completed_at=now() where id=$1", [id, compressed.length, tables.length, rowCount, checksum]);
    if (settings.backup.s3Enabled) {
      const remoteKey = remoteBackupKey(settings, filename);
      try {
        await getS3Client(settings).send(new PutObjectCommand({ Bucket: settings.backup.s3Bucket, Key: remoteKey, Body: compressed, ContentType: "application/gzip", Metadata: { checksum } }));
        await query("update database_backups set remote_key=$2,remote_status='ready' where id=$1", [id, remoteKey]);
      } catch (error) {
        await query("update database_backups set remote_key=$2,remote_status='failed',error_message=$3 where id=$1", [id, remoteKey, `远端上传失败：${error instanceof Error ? error.message : "未知错误"}`]);
      }
    }
    await enforceRetention();
    return { id, filename, sizeBytes: compressed.length, tableCount: tables.length, rowCount, checksum };
  } catch (error) {
    await query("update database_backups set status='failed',error_message=$2,completed_at=now() where id=$1", [id, error instanceof Error ? error.message : "备份失败"]);
    throw error;
  }
}

export async function restoreDatabaseBackup(id: string) {
  const backup = await getBackup(id);
  if (!backup || backup.status !== "ready") throw new Error("备份不存在或不可恢复");
  const compressed = await loadBackupData(backup);
  const checksum = createHash("sha256").update(compressed).digest("hex");
  if (checksum !== backup.checksum) throw new Error("备份校验和不匹配");
  const manifest = JSON.parse((await gunzipAsync(compressed)).toString("utf8")) as { format: number; tableOrder: string[]; data: Record<string, Array<Record<string, unknown>>> };
  if (manifest.format !== 1 || !Array.isArray(manifest.tableOrder)) throw new Error("不支持的备份格式");
  const allowedTables = new Set(await listBackupTables());
  if (manifest.tableOrder.some((table) => !allowedTables.has(table))) throw new Error("备份包含未知数据表");
  const columnTypeRows = await query<{ table_name: string; column_name: string; data_type: string }>(
    "select table_name,column_name,data_type from information_schema.columns where table_schema='public'",
  );
  const columnTypes = new Map(columnTypeRows.rows.map((row) => [`${row.table_name}.${row.column_name}`, row.data_type]));
  const client = await getPool().connect();
  try {
    await client.query("begin");
    await client.query(`truncate ${manifest.tableOrder.map(quoteIdentifier).join(",")} cascade`);
    for (const table of manifest.tableOrder) {
      for (const row of manifest.data[table] ?? []) {
        const columns = Object.keys(row);
        if (columns.length === 0) continue;
        const values = columns.map((column) => {
          const value = row[column];
          const dataType = columnTypes.get(`${table}.${column}`);
          return (dataType === "json" || dataType === "jsonb") && value !== null ? JSON.stringify(value) : value;
        });
        await client.query(`insert into ${quoteIdentifier(table)} (${columns.map(quoteIdentifier).join(",")}) values (${values.map((_, index) => `$${index + 1}`).join(",")})`, values);
      }
    }
    await client.query("commit");
    await query("update database_backups set status='restored',restored_at=now() where id=$1", [id]);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function listDatabaseBackups() {
  const result = await query<BackupRow>("select id,filename,status,size_bytes,table_count,row_count,checksum,error_message,remote_key,remote_status,expires_at,trigger_type,created_at,completed_at,restored_at from database_backups order by created_at desc limit 100");
  return result.rows;
}

export async function getDatabaseBackupFile(id: string) {
  const backup = await getBackup(id);
  if (!backup || backup.status !== "ready") return null;
  return { backup, data: await loadBackupData(backup) };
}

export async function deleteDatabaseBackup(id: string) {
  const backup = await getBackup(id);
  if (!backup) return false;
  await rm(/* turbopackIgnore: true */ resolveBackupPath(backup.filename), { force: true });
  if (backup.remote_key) {
    try {
      const settings = await tryGetSystemSettings();
      await getS3Client(settings).send(new DeleteObjectCommand({ Bucket: settings.backup.s3Bucket, Key: backup.remote_key }));
    } catch {
      // Database deletion remains authoritative when remote cleanup is temporarily unavailable.
    }
  }
  await query("delete from database_backups where id=$1", [id]);
  return true;
}

async function listBackupTables() {
  const result = await query<{ table_name: string }>("select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by table_name");
  const tables = result.rows.map((row) => row.table_name).filter((table) => !excludedTables.has(table));
  const dependencies = await query<{ table_name: string; depends_on: string }>(
    `select tc.table_name,ccu.table_name as depends_on from information_schema.table_constraints tc
     join information_schema.constraint_column_usage ccu on ccu.constraint_name=tc.constraint_name and ccu.constraint_schema=tc.constraint_schema
     where tc.constraint_type='FOREIGN KEY' and tc.table_schema='public' and tc.table_name<>ccu.table_name`,
  );
  return topologicalSort(tables, dependencies.rows);
}

async function getBackup(id: string) {
  const result = await query<BackupRow>("select id,filename,status,size_bytes,table_count,row_count,checksum,error_message,remote_key,remote_status,expires_at,trigger_type,created_at,completed_at,restored_at from database_backups where id=$1", [id]);
  return result.rows[0] ?? null;
}

async function enforceRetention() {
  const settings = await tryGetSystemSettings();
  const backups = await listDatabaseBackups();
  const ready = backups.filter((item) => item.status === "ready");
  const expired = ready.filter((item) => item.expires_at && new Date(item.expires_at).getTime() <= Date.now());
  const overflow = ready.slice(settings.backup.retentionCount);
  for (const backup of new Map([...expired, ...overflow].map((item) => [item.id, item])).values()) await deleteDatabaseBackup(backup.id);
}

export async function testBackupStorage() {
  const settings = await tryGetSystemSettings();
  if (!settings.backup.s3Enabled) throw new Error("请先保存并启用 S3/R2 配置");
  await getS3Client(settings).send(new HeadBucketCommand({ Bucket: settings.backup.s3Bucket }));
  return true;
}

async function loadBackupData(backup: BackupRow) {
  try {
    return await readFile(/* turbopackIgnore: true */ resolveBackupPath(backup.filename));
  } catch {
    if (!backup.remote_key) throw new Error("本地备份文件不存在，且没有远端副本");
    const settings = await tryGetSystemSettings();
    const response = await getS3Client(settings).send(new GetObjectCommand({ Bucket: settings.backup.s3Bucket, Key: backup.remote_key }));
    if (!response.Body) throw new Error("远端备份文件为空");
    const data = Buffer.from(await response.Body.transformToByteArray());
    await mkdir(/* turbopackIgnore: true */ backupDirectory, { recursive: true });
    await writeFile(/* turbopackIgnore: true */ resolveBackupPath(backup.filename), data, { mode: 0o600 });
    return data;
  }
}

function getS3Client(settings: Awaited<ReturnType<typeof tryGetSystemSettings>>) {
  return new S3Client({
    region: settings.backup.s3Region || "auto",
    endpoint: settings.backup.s3Endpoint || undefined,
    forcePathStyle: settings.backup.s3ForcePathStyle,
    credentials: { accessKeyId: settings.backup.s3AccessKeyId, secretAccessKey: decryptSettingSecret(settings.backup.s3SecretEncrypted) },
  });
}

function remoteBackupKey(settings: Awaited<ReturnType<typeof tryGetSystemSettings>>, filename: string) {
  const prefix = settings.backup.s3Prefix.replace(/^\/+|\/+$/g, "");
  return prefix ? `${prefix}/${filename}` : filename;
}

function topologicalSort(tables: string[], dependencies: Array<{ table_name: string; depends_on: string }>) {
  const remaining = new Set(tables); const output: string[] = [];
  while (remaining.size) {
    const ready = [...remaining].filter((table) => !dependencies.some((edge) => edge.table_name === table && remaining.has(edge.depends_on)));
    if (ready.length === 0) throw new Error("数据表依赖存在循环，无法生成可恢复备份");
    ready.sort().forEach((table) => { output.push(table); remaining.delete(table); });
  }
  return output;
}

function quoteIdentifier(value: string) { return `"${value.replaceAll('"', '""')}"`; }
function resolveBackupPath(filename: string) {
  if (path.basename(filename) !== filename) throw new Error("备份文件名不合法");
  return path.join(/*turbopackIgnore: true*/ backupDirectory, filename);
}
type BackupRow = { id: string; filename: string; status: string; size_bytes: number; table_count: number; row_count: number; checksum: string; error_message: string | null; remote_key: string | null; remote_status: string; expires_at: string | null; trigger_type: string; created_at: string; completed_at: string | null; restored_at: string | null };
