import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { getOrLoadWechatChannelCache } from "./wechat-channel-discovery-cache.ts";

const apiBase = "https://api.tikhub.io/api/v1/wechat_channels/v2";
const MAX_CHANNEL_TRAINING_WORKS = 500;

export type WechatChannelCandidate = {
  id: string;
  title: string;
  authorName: string;
  publishedAt: string | null;
  durationSeconds: number | null;
  coverUrl: string;
  likeCount: number | null;
  commentCount: number | null;
  forwardCount: number | null;
  trainingToken: string;
};

export type WechatChannelTrainingWork = {
  id: string;
  title: string;
  authorName: string;
  publishedAt: string | null;
  mediaUrl: string;
  decodeKey: string;
  sourceUrl: string;
};

export async function discoverWechatChannelWorks(input: { channelId: string; limit: 10 | 20 | 50 | 100 | "all" }, refreshAccount = false) {
  const token = process.env.TIKHUB_API_TOKEN?.trim();
  if (!token) throw new Error("尚未配置 TIKHUB_API_TOKEN");
  let providerRequestCount = 0;
  let cacheHitCount = 0;
  const accountResult = await getOrLoadWechatChannelCache({
    scope: "account",
    identity: input.channelId,
    // The channel ID → finder username mapping is stable. Keep it indefinitely
    // and refresh only when a downstream request proves it stale.
    ttlSeconds: null,
    forceRefresh: refreshAccount,
    load: async () => {
      providerRequestCount += 1;
      const account = await postTikHub("fetch_channel_id_to_username", { channel_id: input.channelId, raw: false }, token);
      return record(account.data);
    },
  });
  if (accountResult.cacheHit) cacheHitCount += 1;
  const accountData = accountResult.value;
  const username = text(accountData.username);
  if (!username) throw new Error(text(accountData.error) || "没有找到对应的视频号账号");
  const authorName = text(accountData.nickname);
  // A training run has a hard 500-work safety limit. “全部” therefore means
  // every discoverable work within that supported training capacity.
  const target = input.limit === "all" ? MAX_CHANNEL_TRAINING_WORKS : input.limit;
  const candidates: WechatChannelCandidate[] = [];
  const seen = new Set<string>();
  let lastBuffer = "";
  let pageCount = 0;
  for (let page = 0; page < 100 && candidates.length < target; page += 1) {
    let pageResult: Awaited<ReturnType<typeof getOrLoadWechatChannelCache<{ works: WechatChannelCandidate[]; nextBuffer: string; rawCount: number }>>>;
    try {
      pageResult = await getOrLoadWechatChannelCache({
        scope: "page",
        identity: `${username}:${lastBuffer}`,
        ttlSeconds: lastBuffer ? 30 * 24 * 60 * 60 : 6 * 60 * 60,
        load: async () => {
          providerRequestCount += 1;
          const payload = await postTikHub("fetch_user_videos", { username, last_buffer: lastBuffer, raw: false }, token);
          const data = record(payload.data);
          return {
            works: normalizePageWorks(array(data.videos), authorName),
            nextBuffer: text(data.last_buffer ?? data.lastBuffer ?? data.next_buffer ?? data.nextBuffer),
            rawCount: array(data.videos).length,
          };
        },
      });
    } catch (error) {
      if (!refreshAccount && accountResult.cacheHit && isStaleAccountError(error)) return discoverWechatChannelWorks(input, true);
      throw error;
    }
    pageCount += 1;
    if (pageResult.cacheHit) cacheHitCount += 1;
    const pageWorks = array(pageResult.value.works) as unknown as WechatChannelCandidate[];
    for (const rawWork of pageWorks) {
      const work = rawWork as WechatChannelCandidate;
      if (!work.id || seen.has(work.id)) continue;
      seen.add(work.id);
      candidates.push(work);
      if (candidates.length >= target) break;
    }
    const nextBuffer = text(pageResult.value.nextBuffer);
    const rawCount = Number(pageResult.value.rawCount ?? pageWorks.length);
    if (!nextBuffer || nextBuffer === lastBuffer || rawCount === 0) break;
    lastBuffer = nextBuffer;
  }
  if (!refreshAccount && accountResult.cacheHit && candidates.length === 0) {
    // Empty data from a cached mapping can indicate a renamed/recycled finder
    // username. Retry once against TikHub before treating the account as empty.
    return discoverWechatChannelWorks(input, true);
  }
  return { channelId: input.channelId, username, authorName, candidates, requestCount: pageCount, pageCount, cacheHitCount, providerRequestCount, reachedTrainingLimit: input.limit === "all" && candidates.length >= MAX_CHANNEL_TRAINING_WORKS, maxTrainingWorks: MAX_CHANNEL_TRAINING_WORKS };
}

function normalizePageWorks(videos: unknown[], fallbackAuthorName: string): WechatChannelCandidate[] {
  const works: WechatChannelCandidate[] = [];
  const seen = new Set<string>();
  for (const rawVideo of videos) {
      const video = record(rawVideo);
      const id = text(video.id ?? video.object_id ?? video.objectId);
      const media = record(video.media);
      const mediaUrl = text(media.full_url) || `${text(media.url)}${text(media.url_token)}`;
      const decodeKey = text(media.decode_key);
      if (!id || seen.has(id) || !mediaUrl) continue;
      seen.add(id);
      const title = richText(video.description) || richText(video.title) || richText(video.desc) || "未命名作品";
      const publishedAt = dateValue(video.published_at ?? video.publish_time ?? video.create_time ?? video.createtime);
      const work: WechatChannelTrainingWork = {
        id, title, authorName: text(video.author_name ?? video.nickname) || fallbackAuthorName,
        publishedAt, mediaUrl, decodeKey, sourceUrl: `https://weixin.qq.com/sph/${encodeURIComponent(id)}`,
      };
      works.push({
        id, title, authorName: work.authorName, publishedAt,
        durationSeconds: numberValue(video.duration ?? media.duration),
        coverUrl: text(video.cover_img_url ?? video.cover_url ?? video.thumb_url ?? media.cover_url ?? media.thumb_url),
        likeCount: numberValue(video.like_count ?? video.likeCount),
        commentCount: numberValue(video.comment_count ?? video.commentCount),
        forwardCount: numberValue(video.forward_count ?? video.forwardCount ?? video.share_count),
        trainingToken: encryptSettingSecret(JSON.stringify(work)),
      });
  }
  return works;
}

export function decodeWechatChannelTrainingTokens(tokens: string[]) {
  return tokens.map((token) => {
    const value = JSON.parse(decryptSettingSecret(token)) as WechatChannelTrainingWork;
    if (!value.id || !value.mediaUrl || !value.sourceUrl) throw new Error("视频号候选作品已失效，请重新获取作品列表");
    return value;
  });
}

function trainingTokenKey() {
  const source = process.env.SETTINGS_ENCRYPTION_KEY ?? process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!source) throw new Error("缺少 SETTINGS_ENCRYPTION_KEY 或 AUTH_SECRET");
  return createHash("sha256").update(source).digest();
}

function encryptSettingSecret(value: string) {
  const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", trainingTokenKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

function decryptSettingSecret(value: string) {
  const [version, iv, tag, encrypted] = value.split(".");
  if (version !== "v1" || !iv || !tag || !encrypted) throw new Error("视频号候选作品令牌无效");
  const decipher = createDecipheriv("aes-256-gcm", trainingTokenKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}

async function postTikHub(endpoint: string, body: Record<string, unknown>, token: string) {
  const response = await fetch(`${apiBase}/${endpoint}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(35_000),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || Number(payload.code ?? 200) >= 400) {
    const fallback = response.status === 402
      ? "TikHub 拒绝了计费请求（HTTP 402），请检查账户余额和视频号接口权限"
      : `TikHub 请求失败（HTTP ${response.status}）`;
    throw new Error(text(payload.message_zh ?? payload.message) || fallback);
  }
  return payload;
}

function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function text(value: unknown) { return typeof value === "string" || typeof value === "number" ? String(value).trim() : ""; }
function isStaleAccountError(error: unknown) { return /账号|username|finder|用户不存在|not found|invalid|404/i.test(error instanceof Error ? error.message : ""); }
function richText(value: unknown): string {
  const direct = text(value);
  if (direct) return direct;
  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = richText(item);
      if (nested) return nested;
    }
    return "";
  }
  const object = record(value);
  for (const key of ["shortTitle", "short_title", "text", "title", "desc", "description", "content"]) {
    if (object[key] === undefined || object[key] === null) continue;
    const nested = richText(object[key]);
    if (nested) return nested;
  }
  return "";
}
function numberValue(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; }
function dateValue(value: unknown) {
  if (typeof value === "number" || /^\d{10,13}$/.test(text(value))) {
    const numeric = Number(value); const date = new Date(numeric < 1e12 ? numeric * 1000 : numeric);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const parsed = new Date(text(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}
