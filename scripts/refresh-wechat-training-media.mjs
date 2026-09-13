import { Client } from "pg";

const [runId, authorName] = process.argv.slice(2);
if (!runId || !authorName) throw new Error("Usage: node scripts/refresh-wechat-training-media.mjs <run-id> <author-name>");
const token = process.env.TIKHUB_API_TOKEN?.trim();
if (!token) throw new Error("TIKHUB_API_TOKEN is required");
const client = new Client({ connectionString: process.env.DATABASE_URL });
const text = (value) => typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};

function title(value, depth = 0) {
  if (depth > 5 || value == null) return "";
  const direct = text(value); if (direct) return direct;
  if (Array.isArray(value)) return value.map((item) => title(item, depth + 1)).find(Boolean) || "";
  const raw = object(value);
  return ["shortTitle", "short_title", "text", "title", "desc", "description", "content"]
    .map((field) => raw[field] === undefined ? "" : title(raw[field], depth + 1)).find(Boolean) || "";
}

await client.connect();
try {
  const cached = await client.query("select payload from wechat_channel_discovery_cache where cache_scope='account' and payload->>'nickname'=$1 order by updated_at desc limit 1", [authorName]);
  const username = text(cached.rows[0]?.payload?.username);
  if (!username) throw new Error("video channel cache is unavailable");
  const cachedPages = await client.query("select payload from wechat_channel_discovery_cache where cache_scope='page' and payload::text ilike $1", [`%${authorName}%`]);
  const cursors = [...new Set(["", ...cachedPages.rows.map((row) => text(row.payload?.nextBuffer)).filter(Boolean)])];
  const works = new Map(); let requestCount = 0;
  const fetchPage = async (cursor) => {
    let body;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const response = await fetch("https://api.tikhub.io/api/v1/wechat_channels/v2/fetch_user_videos", {
          method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify({ username, last_buffer: cursor, raw: false }), signal: AbortSignal.timeout(35_000),
        });
        body = await response.json().catch(() => ({}));
        if (response.ok && Number(body.code ?? 200) < 400) break;
        throw new Error(`TikHub refresh failed: HTTP ${response.status}`);
      } catch (error) {
        if (attempt === 3) throw error;
        await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
      }
    }
    requestCount += 1;
    const data = object(body.data); const videos = Array.isArray(data.videos) ? data.videos : [];
    for (const raw of videos) {
      const video = object(raw); const media = object(video.media); const id = text(video.id ?? video.object_id ?? video.objectId);
      const mediaUrl = text(media.full_url) || `${text(media.url)}${text(media.url_token)}`;
      if (!id || !mediaUrl) continue;
      works.set(id, { id, title: title(video.description) || title(video.title) || title(video.desc) || "未命名作品", authorName: text(video.author_name ?? video.nickname) || authorName, publishedAt: text(video.published_at ?? video.publish_time ?? video.create_time ?? video.createtime) || null, mediaUrl, decodeKey: text(media.decode_key), sourceUrl: `https://weixin.qq.com/sph/${encodeURIComponent(id)}` });
    }
  };
  // Reuse persisted page cursors to refresh signed media URLs in parallel.
  // This avoids a long sequential chain while keeping provider pressure bounded.
  for (let index = 0; index < cursors.length; index += 2) {
    await Promise.all(cursors.slice(index, index + 2).map(fetchPage));
  }
  await client.query("begin");
  const tasks = await client.query("select lat.id,lat.status,lat.payload from avatar_training_tasks att join local_agent_tasks lat on lat.id=att.local_agent_task_id where att.training_run_id=$1 for update", [runId]);
  let reset = 0; let refreshed = 0; let unmatched = 0;
  for (const task of tasks.rows) {
    const work = works.get(text(task.payload.id));
    if (!work) { unmatched += 1; continue; }
    const payload = { ...task.payload, ...work, mediaDecryptKey: work.decodeKey, sourceType: "wechat_channels_media", purpose: "avatar_training" };
    if (["failed", "leased"].includes(task.status)) {
      await client.query("update local_agent_tasks set status='pending',payload=$2::jsonb,error_message=null,agent_id=null,lease_token_hash=null,lease_expires_at=null,attempt_count=0,available_at=now(),updated_at=now() where id=$1", [task.id, JSON.stringify(payload)]);
      reset += 1;
    } else await client.query("update local_agent_tasks set payload=$2::jsonb,updated_at=now() where id=$1", [task.id, JSON.stringify(payload)]);
    refreshed += 1;
  }
  await client.query("commit");
  console.log(JSON.stringify({ ok: true, providerRequests: requestCount, freshWorks: works.size, refreshed, reset, unmatched }));
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  throw error;
} finally { await client.end(); }
