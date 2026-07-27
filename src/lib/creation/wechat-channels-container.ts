import { randomBytes } from "node:crypto";

type ContainerInspectionResult =
  | { status: "success"; payload: Record<string, unknown> }
  | { status: "needs_login"; reason: string }
  | { status: "unavailable" };

type CdpPage = { id?: string; webSocketDebuggerUrl?: string };

type ResolvedWechatChannelsMedia = {
  url: string;
  decryptKey: string;
  title: string;
  author: string;
  coverUrl: string;
};

type CdpCookie = { name?: string; value?: string; domain?: string };

// Mirrors the pinned wx_channel SPH worker adapter. Cookies are supplied only
// from the local browser session and never leave the Agent result boundary.
const yuanbaoParseHeaders = {
  accept: "application/json, text/plain, */*",
  "content-type": "application/json",
  origin: "https://yuanbao.tencent.com",
  referer: "https://yuanbao.tencent.com/chat/naQivTmsDa/cf4d0079-ed1b-4c55-a3f3-2ca1379727d1",
  "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/148.0.0.0 Safari/537.36",
  "t-userid": "b9575f6b0a8c4a55a08096904a5ef20a",
  "x-agentid": "naQivTmsDa/cf4d0079-ed1b-4c55-a3f3-2ca1379727d1",
  "x-commit-tag": "72282a0d",
  "x-device-id": "1921b001708100d7fa31002b9646bd0cc15a3e2e1f",
  "x-hy92": "e963067ffa31002b9646bd0c03000008b1951a",
  "x-hy93": "1921b001708100d7fa31002b9646bd0cc15a3e2e1f",
  "x-id": "b9575f6b0a8c4a55a08096904a5ef20a",
  "x-instance-id": "5",
  "x-language": "zh-CN",
  "x-platform": "mac",
  "x-requested-with": "XMLHttpRequest",
  "x-source": "web",
  "x-webversion": "2.69.0",
};

/**
 * The public finder-preview page supplies stable metadata. Media resolution
 * uses wx_channel's Cookie backend protocol with the local browser session,
 * then falls back to its outer share resolver.
 */
export async function inspectWechatChannelsWithContainerBrowser(sourceUrl: string): Promise<ContainerInspectionResult> {
  if (process.env.VIRAL_WECHAT_CONTAINER_BROWSER_ENABLED === "0") return { status: "unavailable" };
  const cdpBase = (process.env.VIRAL_WECHAT_CDP_URL ?? "http://127.0.0.1:9222").replace(/\/$/, "");
  let pageId = "";
  try {
    const opened = await fetch(`${cdpBase}/json/new?${encodeURIComponent(sourceUrl)}`, {
      method: "PUT",
      signal: AbortSignal.timeout(10_000),
    });
    if (!opened.ok) return { status: "unavailable" };
    const page = await opened.json() as CdpPage;
    pageId = page.id ?? "";
    if (!pageId) return { status: "unavailable" };

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const targets = await fetch(`${cdpBase}/json/list`, { signal: AbortSignal.timeout(3_000) })
        .then((response) => response.json()) as CdpPage[];
      const target = targets.find((item) => item.id === pageId);
      if (!target?.webSocketDebuggerUrl) return { status: "unavailable" };
      const evaluated = await sendCdpCommand(target.webSocketDebuggerUrl, "Runtime.evaluate", {
        expression: `JSON.stringify((() => {
          const root = document.querySelector('.page-feed');
          const text = root?.innerText?.trim() || '';
          return {
            title: document.querySelector('.feed-desc-wrap.clickable-area')?.textContent?.trim() || '',
            author: document.querySelector('.author-name')?.textContent?.trim() || '',
            coverUrl: document.querySelector('img.video-player')?.src || '',
            text,
            publishedDate: text.match(/\\d{4}年\\d{1,2}月\\d{1,2}日/)?.[0] || ''
          };
        })())`,
        returnByValue: true,
      });
      const metadata = parseMetadata((evaluated.result as Record<string, unknown> | undefined)?.value);
      if (metadata.title && metadata.author && metadata.publishedDate) {
        const resolvedMedia = await resolveWechatChannelsMedia(sourceUrl, target.webSocketDebuggerUrl);
        return {
          status: "success",
          payload: {
            data: {
              feedInfo: {
                description: resolvedMedia?.title || metadata.title,
                coverUrl: resolvedMedia?.coverUrl || metadata.coverUrl,
                createtime: dateToUnixSeconds(metadata.publishedDate),
                pageText: metadata.text,
                videoUrl: resolvedMedia?.url || "",
                mediaDecryptKey: resolvedMedia?.decryptKey || "",
              },
              authorInfo: { nickname: resolvedMedia?.author || metadata.author },
            },
          },
        };
      }
      await delay(1_500);
    }
    return { status: "needs_login", reason: "视频号作品页未返回可用详情。请确认容器浏览器已登录并重试。" };
  } catch {
    return { status: "unavailable" };
  } finally {
    if (pageId) fetch(`${cdpBase}/json/close/${pageId}`).catch(() => {});
  }
}

async function resolveWechatChannelsMedia(sourceUrl: string, cdpUrl: string): Promise<ResolvedWechatChannelsMedia | null> {
  if (process.env.VIRAL_WECHAT_DISCOVERY_ENABLED !== "1") return null;
  const browserResolved = await resolveWechatChannelsMediaWithBrowserCookie(sourceUrl, cdpUrl);
  if (browserResolved) return browserResolved;
  const base = process.env.VIRAL_WECHAT_DISCOVERY_API_BASE?.trim();
  if (!base) return null;
  try {
    const response = await fetch(`${base.replace(/\/$/, "")}/api/channels/share/resolve`, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ urls: [sourceUrl], mode: "page" }),
      signal: AbortSignal.timeout(Number(process.env.VIRAL_WECHAT_DISCOVERY_TIMEOUT_MS ?? 70_000)),
    });
    if (!response.ok) return null;
    const payload = await response.json() as Record<string, unknown>;
    return parseResolvedWechatChannelsMedia(payload);
  } catch {
    return null;
  }
}

async function resolveWechatChannelsMediaWithBrowserCookie(sourceUrl: string, cdpUrl: string): Promise<ResolvedWechatChannelsMedia | null> {
  try {
    const cdpResult = await sendCdpCommand(cdpUrl, "Network.getAllCookies", {});
    const cookies = Array.isArray(cdpResult.cookies) ? cdpResult.cookies.map(cookieValue).filter(Boolean) as Required<CdpCookie>[] : [];
    const tencentCookies = cookies.filter((cookie) => cookie.domain === ".tencent.com" || cookie.domain === "yuanbao.tencent.com");
    if (!tencentCookies.some((cookie) => cookie.name === "hy_token")) return null;
    const cookieHeader = tencentCookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");

    const parseResponse = await fetch("https://yuanbao.tencent.com/api/weixin/get_parse_result", {
      method: "POST",
      headers: { ...yuanbaoParseHeaders, cookie: cookieHeader },
      body: JSON.stringify({ type: "video_channel_url", url: sourceUrl, scene: 1 }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!parseResponse.ok) return null;
    const parsePayload = await parseResponse.json() as Record<string, unknown>;
    if (numberValue(parsePayload.code) !== 0) return null;
    const parseData = recordValue(parsePayload.data);
    const playableUrl = new URL(stringValue(parseData.playable_url));
    if (playableUrl.protocol !== "https:" || playableUrl.hostname !== "channels.weixin.qq.com") return null;
    const token = playableUrl.searchParams.get("token")?.trim() ?? "";
    const exportId = playableUrl.searchParams.get("eid")?.trim() || stringValue(parseData.wx_export_id);
    if (!token || !exportId) return null;

    const rid = `${Math.floor(Date.now() / 1000).toString(16)}-${randomBytes(4).toString("hex")}`;
    const referer = new URL("https://channels.weixin.qq.com/finder-preview/pages/feed");
    for (const [key, value] of Object.entries({ entry_card_type: "48", comment_scene: "39", appid: "0", token, entry_scene: "0", eid: exportId })) {
      referer.searchParams.set(key, value);
    }
    const feedUrl = new URL("https://channels.weixin.qq.com/finder-preview/api/feed/get_feed_info");
    feedUrl.searchParams.set("_rid", rid);
    feedUrl.searchParams.set("_pageUrl", "https://channels.weixin.qq.com/finder-preview/pages/feed");
    const feedResponse = await fetch(feedUrl, {
      method: "POST",
      headers: {
        accept: "application/json, text/plain, */*",
        "content-type": "application/json",
        origin: "https://channels.weixin.qq.com",
        referer: referer.toString(),
        "user-agent": yuanbaoParseHeaders["user-agent"],
      },
      body: JSON.stringify({ baseReq: { generalToken: token }, exportId }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!feedResponse.ok) return null;
    const feedPayload = await feedResponse.json() as Record<string, unknown>;
    if (numberValue(feedPayload.errCode) !== 0) return null;
    return parseWechatChannelsSphMedia(feedPayload);
  } catch {
    return null;
  }
}

export function parseWechatChannelsSphMedia(payload: Record<string, unknown>): ResolvedWechatChannelsMedia | null {
  const data = recordValue(payload.data);
  const feed = recordValue(data.feedInfo);
  const author = recordValue(data.authorInfo);
  const h264 = recordValue(feed.h264VideoInfo);
  const h265 = recordValue(feed.h265VideoInfo);
  const url = [feed.originVideoUrl, feed.videoUrl, h264.videoUrl, h265.videoUrl]
    .map(stringValue)
    .find(isAllowedWechatMediaUrl) ?? "";
  if (!url) return null;
  return {
    url,
    decryptKey: "",
    title: stringValue(feed.description),
    author: stringValue(author.nickname),
    coverUrl: stringValue(feed.coverUrl),
  };
}

export function parseResolvedWechatChannelsMedia(payload: Record<string, unknown>): ResolvedWechatChannelsMedia | null {
  const data = recordValue(payload.data);
  const item = Array.isArray(data.resolved) ? recordValue(data.resolved[0]) : {};
  const url = stringValue(item.url);
  const decryptKey = stringValue(item.key);
  if (!isAllowedWechatMediaUrl(url) || !/^\d+$/.test(decryptKey)) return null;
  return {
    url,
    decryptKey,
    title: stringValue(item.title),
    author: stringValue(item.authorName),
    coverUrl: stringValue(item.coverUrl),
  };
}

function isAllowedWechatMediaUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && /(^|\.)finder\.video\.qq\.com$/i.test(url.hostname);
  } catch {
    return false;
  }
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function cookieValue(value: unknown): Required<CdpCookie> | null {
  const cookie = recordValue(value);
  const name = stringValue(cookie.name);
  const domain = stringValue(cookie.domain);
  const rawValue = typeof cookie.value === "string" ? cookie.value : "";
  return name && domain && rawValue ? { name, domain, value: rawValue } : null;
}

function numberValue(value: unknown) { return typeof value === "number" ? value : Number.NaN; }

function parseMetadata(value: unknown) {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : {};
    return {
      title: stringValue(parsed.title), author: stringValue(parsed.author),
      coverUrl: stringValue(parsed.coverUrl), text: stringValue(parsed.text), publishedDate: stringValue(parsed.publishedDate),
    };
  } catch { return { title: "", author: "", coverUrl: "", text: "", publishedDate: "" }; }
}

function dateToUnixSeconds(value: string) {
  const match = /^(\d{4})年(\d{1,2})月(\d{1,2})日$/.exec(value);
  return match ? Math.floor(Date.parse(`${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}T00:00:00+08:00`) / 1000) : null;
}

function delay(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function stringValue(value: unknown) { return typeof value === "string" ? value.trim() : ""; }

function sendCdpCommand(url: string, method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const timeout = setTimeout(() => { socket.close(); reject(new Error("CDP request timed out")); }, 10_000);
    socket.addEventListener("open", () => socket.send(JSON.stringify({ id: 1, method, params })));
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as { id?: number; result?: Record<string, unknown>; error?: { message?: string } };
      if (message.id !== 1) return;
      clearTimeout(timeout); socket.close();
      message.error ? reject(new Error(message.error.message ?? "CDP request failed")) : resolve(message.result ?? {});
    });
    socket.addEventListener("error", () => { clearTimeout(timeout); reject(new Error("CDP connection failed")); });
  });
}
