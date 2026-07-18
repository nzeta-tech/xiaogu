import { createHash, randomUUID } from "node:crypto";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import sharp from "sharp";

import { getPool, query } from "@/lib/db/client";
import { tryGetSystemSettings } from "@/lib/db/repositories";
import { decryptSettingSecret } from "@/lib/security/secrets";
import type { AvatarVisualAsset, AvatarVisualAssetRole } from "@/lib/avatar/types";

export const MAX_AVATAR_VISUAL_ASSETS = 8;
export const MAX_AVATAR_VISUAL_ASSET_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type StoredVisualAsset = Omit<AvatarVisualAsset, "content_url"> & {
  user_id: string;
  storage_provider: "database" | "s3";
  storage_key: string | null;
  image_data?: Buffer | null;
};

export async function listAvatarVisualAssets(userId: string, includeDisabled = true) {
  const result = await query<StoredVisualAsset>(
    `select id, user_id, role, label, is_primary, status, usage_scopes, allow_creation,
            storage_provider, storage_key, content_type, original_filename, size_bytes,
            width, height, sha256, quality_json, created_at, updated_at
     from avatar_visual_assets
     where user_id = $1 and status ${includeDisabled ? "<> 'archived'" : "= 'active'"}
     order by is_primary desc, updated_at desc`,
    [userId],
  );
  return result.rows.map(toPublicVisualAsset);
}

export async function createAvatarVisualAsset(input: {
  userId: string;
  fileName: string;
  contentType: string;
  bytes: Buffer;
  role?: AvatarVisualAssetRole;
}) {
  if (!ALLOWED_IMAGE_TYPES.has(input.contentType)) throw new Error("仅支持 JPG、PNG 或 WebP 图片");
  if (input.bytes.length === 0 || input.bytes.length > MAX_AVATAR_VISUAL_ASSET_BYTES) throw new Error("单张图片不能超过 10MB");

  const activeCount = await query<{ count: string }>(
    `select count(*)::text as count from avatar_visual_assets where user_id = $1 and status <> 'archived'`,
    [input.userId],
  );
  if (Number(activeCount.rows[0]?.count ?? 0) >= MAX_AVATAR_VISUAL_ASSETS) throw new Error(`形象库最多保存 ${MAX_AVATAR_VISUAL_ASSETS} 张照片`);

  let processed: Buffer;
  let metadata: sharp.Metadata;
  try {
    const pipeline = sharp(input.bytes, { failOn: "error", limitInputPixels: 40_000_000 }).rotate();
    metadata = await pipeline.metadata();
    processed = Buffer.from(await pipeline
      .resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 90, chromaSubsampling: "4:4:4", mozjpeg: true })
      .toBuffer());
  } catch {
    throw new Error("图片无法识别或文件已损坏");
  }

  const outputMetadata = await sharp(processed).metadata();
  const width = outputMetadata.width ?? metadata.width ?? 0;
  const height = outputMetadata.height ?? metadata.height ?? 0;
  if (width < 480 || height < 480) throw new Error("图片分辨率过低，建议上传宽高均不低于 480px 的照片");

  const sha256 = createHash("sha256").update(processed).digest("hex");
  const warnings = buildQualityWarnings(width, height);
  const settings = await tryGetSystemSettings();
  const useS3 = Boolean(settings.backup.s3Enabled && settings.backup.s3Bucket && settings.backup.s3AccessKeyId && settings.backup.s3SecretEncrypted);
  const storageKey = useS3 ? buildStorageKey(input.userId) : null;

  if (useS3 && storageKey) {
    await getS3Client(settings).send(new PutObjectCommand({
      Bucket: settings.backup.s3Bucket,
      Key: storageKey,
      Body: processed,
      ContentType: "image/jpeg",
      CacheControl: "private, max-age=300",
    }));
  }

  try {
    const result = await query<StoredVisualAsset>(
      `insert into avatar_visual_assets(
         user_id, role, storage_provider, storage_key, content_type, original_filename,
         size_bytes, width, height, sha256, quality_json, image_data, is_primary
       )
       values ($1, $2, $3, $4, 'image/jpeg', $5, $6, $7, $8, $9, $10::jsonb, $11,
         not exists(select 1 from avatar_visual_assets where user_id = $1 and status = 'active'))
       returning id, user_id, role, label, is_primary, status, usage_scopes, allow_creation,
         storage_provider, storage_key, content_type, original_filename, size_bytes,
         width, height, sha256, quality_json, created_at, updated_at`,
      [
        input.userId,
        input.role ?? "portrait",
        useS3 ? "s3" : "database",
        storageKey,
        input.fileName.slice(0, 240),
        processed.length,
        width,
        height,
        sha256,
        JSON.stringify({ warnings, megapixels: Number(((width * height) / 1_000_000).toFixed(1)), exifStripped: true }),
        useS3 ? null : Buffer.from(processed),
      ],
    );
    return toPublicVisualAsset(result.rows[0]);
  } catch (error) {
    if (useS3 && storageKey) await deleteS3Object(settings, storageKey).catch(() => undefined);
    if (isUniqueViolation(error)) throw new Error("这张照片已经在形象库中");
    throw error;
  }
}

export async function updateAvatarVisualAsset(input: {
  userId: string;
  assetId: string;
  role?: AvatarVisualAssetRole;
  label?: string;
  isPrimary?: boolean;
  allowCreation?: boolean;
  usageScopes?: string[];
  status?: "active" | "disabled";
}) {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const current = await client.query<{ id: string }>(
      `select id from avatar_visual_assets where id = $1 and user_id = $2 and status <> 'archived' for update`,
      [input.assetId, input.userId],
    );
    if (!current.rows[0]) throw new Error("形象照不存在");
    if (input.isPrimary) {
      await client.query(`update avatar_visual_assets set is_primary = false, updated_at = now() where user_id = $1`, [input.userId]);
    }
    const result = await client.query<StoredVisualAsset>(
      `update avatar_visual_assets
       set role = coalesce($3, role), label = coalesce($4, label),
           is_primary = case when $5::boolean is null then is_primary else $5 end,
           allow_creation = coalesce($6, allow_creation),
           usage_scopes = coalesce($7::text[], usage_scopes),
           status = coalesce($8, status), updated_at = now()
       where id = $1 and user_id = $2
       returning id, user_id, role, label, is_primary, status, usage_scopes, allow_creation,
         storage_provider, storage_key, content_type, original_filename, size_bytes,
         width, height, sha256, quality_json, created_at, updated_at`,
      [input.assetId, input.userId, input.role ?? null, input.label?.slice(0, 80) ?? null, input.isPrimary ?? null, input.allowCreation ?? null, input.usageScopes ?? null, input.status ?? null],
    );
    await client.query("commit");
    return toPublicVisualAsset(result.rows[0]);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteAvatarVisualAsset(userId: string, assetId: string) {
  const result = await query<Pick<StoredVisualAsset, "storage_provider" | "storage_key"> & { is_primary: boolean }>(
    `update avatar_visual_assets
     set status = 'archived', is_primary = false, image_data = null, updated_at = now()
     where id = $1 and user_id = $2 and status <> 'archived'
     returning storage_provider, storage_key, is_primary`,
    [assetId, userId],
  );
  const asset = result.rows[0];
  if (!asset) throw new Error("形象照不存在");
  if (asset.storage_provider === "s3" && asset.storage_key) {
    const settings = await tryGetSystemSettings();
    await deleteS3Object(settings, asset.storage_key).catch(() => undefined);
  }
  await ensurePrimaryVisualAsset(userId);
}

export async function readAvatarVisualAsset(userId: string, assetId: string) {
  const result = await query<StoredVisualAsset>(
    `select id, user_id, role, label, is_primary, status, usage_scopes, allow_creation,
            storage_provider, storage_key, content_type, original_filename, size_bytes,
            width, height, sha256, quality_json, image_data, created_at, updated_at
     from avatar_visual_assets where id = $1 and user_id = $2 and status <> 'archived'`,
    [assetId, userId],
  );
  const asset = result.rows[0];
  if (!asset) return null;
  if (asset.storage_provider === "database") return { asset, bytes: normalizeStoredBytes(asset.image_data) };
  if (!asset.storage_key) return null;
  const settings = await tryGetSystemSettings();
  const response = await getS3Client(settings).send(new GetObjectCommand({ Bucket: settings.backup.s3Bucket, Key: asset.storage_key }));
  if (!response.Body) return null;
  return { asset, bytes: Buffer.from(await response.Body.transformToByteArray()) };
}

export async function resolveAvatarVisualReferences(input: { userId: string; assetIds: string[]; appSlug: string }) {
  if (input.assetIds.length === 0) return [];
  const privacy = await query<{ visual_creation_enabled: boolean }>(
    `select visual_creation_enabled from avatar_privacy_settings where user_id = $1`,
    [input.userId],
  );
  if (privacy.rows[0] && !privacy.rows[0].visual_creation_enabled) return [];
  const uniqueIds = [...new Set(input.assetIds)].slice(0, 4);
  const result = await query<{ id: string }>(
    `select id from avatar_visual_assets
     where user_id = $1 and id = any($2::uuid[]) and status = 'active' and allow_creation = true
       and $3 = any(usage_scopes)
     order by is_primary desc, updated_at desc`,
    [input.userId, uniqueIds, input.appSlug],
  );
  const references: Array<{ id: string; dataUrl: string }> = [];
  for (const row of result.rows) {
    const loaded = await readAvatarVisualAsset(input.userId, row.id);
    if (loaded?.bytes.length) references.push({ id: row.id, dataUrl: `data:${loaded.asset.content_type};base64,${loaded.bytes.toString("base64")}` });
  }
  return references;
}

export async function logAvatarVisualUsage(input: { userId: string; assetIds: string[]; workId?: string | null; appRunId?: string | null; contextType: string }) {
  if (input.assetIds.length === 0) return;
  await query(
    `insert into avatar_visual_usage_logs(user_id, work_id, app_run_id, asset_ids, context_type)
     values ($1, $2, $3, $4::uuid[], $5)`,
    [input.userId, input.workId ?? null, input.appRunId ?? null, input.assetIds, input.contextType],
  ).catch(() => undefined);
}

async function ensurePrimaryVisualAsset(userId: string) {
  await query(
    `update avatar_visual_assets set is_primary = true, updated_at = now()
     where id = (
       select id from avatar_visual_assets where user_id = $1 and status = 'active' and allow_creation = true
       order by updated_at desc limit 1
     ) and not exists(select 1 from avatar_visual_assets where user_id = $1 and status = 'active' and is_primary = true)`,
    [userId],
  );
}

function toPublicVisualAsset(asset: StoredVisualAsset): AvatarVisualAsset {
  return {
    id: asset.id,
    role: asset.role,
    label: asset.label,
    is_primary: asset.is_primary,
    status: asset.status,
    usage_scopes: asset.usage_scopes,
    allow_creation: asset.allow_creation,
    content_type: asset.content_type,
    original_filename: asset.original_filename,
    size_bytes: asset.size_bytes,
    width: asset.width,
    height: asset.height,
    quality_json: asset.quality_json,
    created_at: asset.created_at,
    updated_at: asset.updated_at,
    content_url: `/api/avatar/photos/${asset.id}/content?v=${encodeURIComponent(asset.updated_at)}`,
  };
}

function normalizeStoredBytes(value: Buffer | null | undefined) {
  if (!value?.length) return Buffer.alloc(0);
  if (value[0] !== 0x7b) return Buffer.from(value);
  try {
    const parsed = JSON.parse(value.toString("utf8")) as { type?: string; data?: unknown };
    if (parsed.type === "Buffer" && Array.isArray(parsed.data) && parsed.data.every((item) => Number.isInteger(item) && item >= 0 && item <= 255)) {
      return Buffer.from(parsed.data);
    }
  } catch {
    // Keep the original bytes when the payload is not a legacy Buffer JSON value.
  }
  return Buffer.from(value);
}

function buildQualityWarnings(width: number, height: number) {
  const warnings: string[] = [];
  if (Math.min(width, height) < 800) warnings.push("建议补充更高清的照片");
  const ratio = width / height;
  if (ratio > 2.2 || ratio < 0.42) warnings.push("画幅过窄，人物参考效果可能不稳定");
  return warnings;
}

function buildStorageKey(userId: string) {
  const prefix = (process.env.AVATAR_ASSET_S3_PREFIX ?? "avatar-assets").replace(/^\/+|\/+$/g, "");
  return `${prefix}/${userId}/${randomUUID()}.jpg`;
}

function getS3Client(settings: Awaited<ReturnType<typeof tryGetSystemSettings>>) {
  return new S3Client({
    region: settings.backup.s3Region || "auto",
    endpoint: settings.backup.s3Endpoint || undefined,
    forcePathStyle: settings.backup.s3ForcePathStyle,
    credentials: { accessKeyId: settings.backup.s3AccessKeyId, secretAccessKey: decryptSettingSecret(settings.backup.s3SecretEncrypted) },
  });
}

async function deleteS3Object(settings: Awaited<ReturnType<typeof tryGetSystemSettings>>, storageKey: string) {
  await getS3Client(settings).send(new DeleteObjectCommand({ Bucket: settings.backup.s3Bucket, Key: storageKey }));
}

function isUniqueViolation(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "23505");
}
