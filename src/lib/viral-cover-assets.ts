import { createHash } from "node:crypto";
import { query } from "@/lib/db/client";

const MAX_VIRAL_COVER_BYTES = 10 * 1024 * 1024;
const MIN_VIRAL_COVER_BYTES = 1024;
const allowedContentTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

type StoredViralCover = {
  content_type: string;
  image_data: Buffer | Uint8Array | string;
  updated_at: string;
};

export async function storeViralCover(input: { contentId: string; sourceUrl: string; refererUrl?: string }) {
  const sourceUrl = new URL(input.sourceUrl);
  if (!/^https?:$/.test(sourceUrl.protocol)) throw new Error("封面地址仅支持 HTTP 或 HTTPS");

  const executorBase = process.env.LOCAL_AGENT_EXECUTOR_URL?.replace(/\/$/, "");
  const localAgentToken = process.env.LOCAL_AGENT_TOKEN?.trim();
  const isAgentMedia = Boolean(executorBase && localAgentToken
    && sourceUrl.origin === new URL(executorBase).origin
    && sourceUrl.pathname === "/api/creation/link-remix/media");
  const response = await fetch(sourceUrl, {
    headers: {
      accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      "user-agent": "Mozilla/5.0 (compatible; XiaoguCoverBot/1.0)",
      ...(input.refererUrl && /^https?:\/\//i.test(input.refererUrl) ? { referer: input.refererUrl } : {}),
      ...(isAgentMedia ? { authorization: `Bearer ${localAgentToken}` } : {}),
    },
    redirect: "follow",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`封面下载失败（${response.status}）`);

  const contentType = normalizeContentType(response.headers.get("content-type"));
  if (!contentType) throw new Error("封面源未返回支持的图片格式");
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_VIRAL_COVER_BYTES) throw new Error("封面文件超过 10MB 限制");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < MIN_VIRAL_COVER_BYTES || bytes.length > MAX_VIRAL_COVER_BYTES) throw new Error("封面文件不是可用图片");

  return persistViralCover({ contentId: input.contentId, contentType, bytes, sourceUrl: sourceUrl.toString() });
}

export async function storeUploadedViralCover(input: { contentId: string; contentType: string; bytes: Buffer; sourceUrl?: string }) {
  const contentType = normalizeContentType(input.contentType);
  if (!contentType) throw new Error("仅支持 JPG、PNG、WebP 或 GIF 图片");
  if (input.bytes.length < MIN_VIRAL_COVER_BYTES || input.bytes.length > MAX_VIRAL_COVER_BYTES) throw new Error("封面文件需介于 1KB 和 10MB 之间");
  return persistViralCover({ contentId: input.contentId, contentType, bytes: input.bytes, sourceUrl: input.sourceUrl ?? "uploaded://admin" });
}

export async function deleteViralCover(contentId: string) {
  await query("delete from viral_content_cover_assets where viral_content_id=$1", [contentId]);
}

async function persistViralCover(input: { contentId: string; contentType: string; bytes: Buffer; sourceUrl: string }) {
  const result = await query<{ updated_at: string }>(
    `insert into viral_content_cover_assets(viral_content_id,content_type,image_data,source_url,sha256,size_bytes)
     values($1,$2,$3,$4,$5,$6)
     on conflict (viral_content_id) do update set
       content_type=excluded.content_type,image_data=excluded.image_data,source_url=excluded.source_url,
       sha256=excluded.sha256,size_bytes=excluded.size_bytes,updated_at=now()
     returning updated_at`,
    [input.contentId, input.contentType, input.bytes, input.sourceUrl, createHash("sha256").update(input.bytes).digest("hex"), input.bytes.length],
  );
  return { contentType: input.contentType, sizeBytes: input.bytes.length, updatedAt: result.rows[0]?.updated_at ?? new Date().toISOString() };
}

export async function readViralCover(contentId: string) {
  const result = await query<StoredViralCover>(
    "select content_type,image_data,updated_at from viral_content_cover_assets where viral_content_id=$1",
    [contentId],
  );
  const asset = result.rows[0];
  if (!asset) return null;
  return { contentType: asset.content_type, bytes: toBuffer(asset.image_data), updatedAt: asset.updated_at };
}

function normalizeContentType(value: string | null) {
  const type = value?.split(";", 1)[0]?.trim().toLowerCase();
  if (type === "image/jpg") return "image/jpeg";
  return type && allowedContentTypes.has(type) ? type : null;
}

function toBuffer(value: StoredViralCover["image_data"]) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  return Buffer.from(value, "base64");
}
