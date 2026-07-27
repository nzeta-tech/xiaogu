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

/**
 * Video Channel's former Yuanbao parsing API is no longer available. The
 * public finder-preview page does expose the same public metadata after the
 * container browser has been authenticated, so read it from the rendered DOM.
 */
export async function inspectWechatChannelsWithContainerBrowser(sourceUrl: string): Promise<ContainerInspectionResult> {
  if (process.env.VIRAL_WECHAT_CONTAINER_BROWSER_ENABLED === "0") return { status: "unavailable" };
  const cdpBase = (process.env.VIRAL_WECHAT_CDP_URL ?? "http://127.0.0.1:9222").replace(/\/$/, "");
  const resolvedMediaPromise = resolveWechatChannelsMedia(sourceUrl);
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
        const resolvedMedia = await resolvedMediaPromise;
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

async function resolveWechatChannelsMedia(sourceUrl: string): Promise<ResolvedWechatChannelsMedia | null> {
  if (process.env.VIRAL_WECHAT_DISCOVERY_ENABLED !== "1") return null;
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
