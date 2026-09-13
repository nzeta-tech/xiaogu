import os from "node:os";
import { createHash } from "node:crypto";
import pg from "pg";

const appBase = required("LOCAL_AGENT_BASE_URL").replace(/\/$/, "");
const executorBase = (process.env.LOCAL_AGENT_EXECUTOR_URL || appBase).replace(/\/$/, "");
const token = required("LOCAL_AGENT_TOKEN");
const platform = process.argv.find((argument) => argument.startsWith("--platform="))?.slice("--platform=".length) || "";
const limit = Number(process.argv.find((argument) => argument.startsWith("--limit="))?.slice("--limit=".length) || 100);

const client = new pg.Client({ connectionString: required("DATABASE_URL") });
await client.connect();
const result = await client.query(
  `select content.id, content.source_url, content.platform
   from viral_contents content
   left join viral_content_cover_assets cover on cover.viral_content_id = content.id
   where content.status = 'published'
     and cover.viral_content_id is null
     and ($1 = '' or content.platform = $1)
   order by content.is_pinned desc, content.is_featured desc, content.sort_order asc
   limit $2`,
  [platform, Math.max(1, Math.min(limit, 200))],
);

let cached = 0;
let unresolved = 0;
let failed = 0;
for (const item of result.rows) {
  try {
    const thumbnailUrl = await inspect(item.source_url);
    if (thumbnailUrl && await cache(item.id, thumbnailUrl, item.source_url)) cached += 1;
    else unresolved += 1;
  } catch {
    failed += 1;
  }
}

console.log(JSON.stringify({ host: os.hostname(), platform: platform || "all", scanned: result.rows.length, cached, unresolved, failed }));
await client.end();

async function inspect(sourceUrl) {
  const response = await fetch(`${executorBase}/api/creation/link-remix/inspect`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    // metadataOnly 必须为 false：抖音的公开页通常没有 OG 图，二创链路需要
    // 调用下载器/浏览器才能获得封面；deferTranscription 避免做无关的转写。
    body: JSON.stringify({ url: sourceUrl, agentUserId: "viral-cover-backfill", deferTranscription: true, metadataOnly: false }),
    signal: AbortSignal.timeout(180_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || typeof payload.thumbnailUrl !== "string" || !payload.thumbnailUrl) return "";
  return payload.thumbnailUrl.startsWith("/") ? `${executorBase}${payload.thumbnailUrl}` : payload.thumbnailUrl;
}

async function cache(contentId, thumbnailUrl, refererUrl) {
  if (thumbnailUrl.startsWith(`${executorBase}/api/creation/link-remix/media`)) {
    const media = await fetch(thumbnailUrl, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(60_000),
    });
    const contentType = normalizeImageType(media.headers.get("content-type"));
    const bytes = Buffer.from(await media.arrayBuffer());
    if (!media.ok || !contentType || bytes.length === 0 || bytes.length > 10 * 1024 * 1024) return false;
    await client.query(
      `insert into viral_content_cover_assets(viral_content_id,content_type,image_data,source_url,sha256,size_bytes)
       values($1,$2,$3,$4,$5,$6)
       on conflict (viral_content_id) do update set content_type=excluded.content_type,image_data=excluded.image_data,
         source_url=excluded.source_url,sha256=excluded.sha256,size_bytes=excluded.size_bytes,updated_at=now()`,
      [contentId, contentType, bytes, refererUrl, createHash("sha256").update(bytes).digest("hex"), bytes.length],
    );
    return true;
  }
  const response = await fetch(`${appBase}/api/internal/local-agent/viral-covers/cache`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ contentId, thumbnailUrl, refererUrl }),
    signal: AbortSignal.timeout(60_000),
  });
  return response.ok;
}

function normalizeImageType(value) {
  const type = value?.split(";", 1)[0]?.trim().toLowerCase();
  if (type === "image/jpg") return "image/jpeg";
  return ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(type) ? type : "";
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}
