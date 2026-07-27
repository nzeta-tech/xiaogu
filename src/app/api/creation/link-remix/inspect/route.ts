import { createHash } from "node:crypto";
import { requireSessionUser } from "@/lib/auth/session";
import { runInsuranceContentAgent } from "@/lib/agent/insurance-agent";
import { downloadDouyinPublic, transcribeDownloadedDouyin } from "@/lib/creation/douyin-download";
import { inspectWechatChannelsWithContainerBrowser } from "@/lib/creation/wechat-channels-container";
import { isAuthorizedLocalAgentRequest } from "@/lib/local-agent/auth";
import { enqueueLocalAgentTask, getLinkRemixAvailability, isLocalAgentDelegationEnabled } from "@/lib/local-agent/repository";
import { inferHotTopicCategory } from "@/lib/topics/rules";

const allowedHosts = /(^|\.)((douyin\.com)|(weixin\.qq\.com)|(channels\.weixin\.qq\.com))$/i;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { url?: string; deferTranscription?: boolean; agentUserId?: string };
  const isAgentExecution = process.env.LOCAL_AGENT_EXECUTOR === "1" && isAuthorizedLocalAgentRequest(request);
  const user = isAgentExecution ? { id: body.agentUserId?.trim() || "local-agent" } : await requireSessionUser();
  if (user instanceof Response) return user;
  const rawUrl = extractUrlFromShareText(body.url?.trim() ?? "");
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return Response.json({ error: "请输入有效的作品链接。" }, { status: 400 });
  }
  if (!/^https?:$/.test(parsed.protocol) || !allowedHosts.test(parsed.hostname)) {
    return Response.json({ error: "爆款二创目前仅支持抖音和微信视频号作品链接。" }, { status: 400 });
  }

  if (!isAgentExecution && process.env.LOCAL_AGENT_ENABLED === "1") {
    const availability = await getLinkRemixAvailability();
    if (!availability.available) return Response.json({ error: availability.reason, code: "LOCAL_AGENT_OFFLINE" }, { status: 503 });
    if (!await isLocalAgentDelegationEnabled()) return Response.json({ error: "功能暂不可用", code: "LOCAL_AGENT_DISABLED" }, { status: 503 });
    const canonicalUrl = parsed.toString();
    const dedupeKey = createHash("sha256").update(`${user.id}:${canonicalUrl}`).digest("hex");
    const task = await enqueueLocalAgentTask({
      taskType: "source.inspect",
      ownerUserId: user.id,
      payload: { url: canonicalUrl, userId: user.id },
      dedupeKey,
      priority: 100,
      maxAttempts: 3,
    });
    return Response.json({ status: "queued", taskId: task.id }, { status: 202, headers: { "cache-control": "no-store" } });
  }

  try {
    if (/douyin\.com$/i.test(parsed.hostname) && !/\/video\/\d+/i.test(parsed.pathname)) {
      const resolved = await resolveDouyinShareUrl(parsed);
      if (resolved) parsed = resolved;
    }
    if (/douyin\.com$/i.test(parsed.hostname) && /\/video\/\d+/i.test(parsed.pathname) && process.env.VIRAL_DOUYIN_DOWNLOAD_ENABLED !== "0") {
      try {
        const downloaded = await downloadDouyinPublic(parsed.toString());
        const mediaBase = `/api/creation/link-remix/media?file=`;
        const transcript = body.deferTranscription === true ? "" : await transcribeDownloadedDouyin(downloaded.videoFile);
        const evidence = transcript ? await summarizePublicEvidence({ title: downloaded.title, description: transcript, userId: user.id }) : "";
        const fields = Object.fromEntries(Object.entries({
          source_type: "douyin",
          source_content_type: "视频",
          source_title: downloaded.title,
          source_author: downloaded.author,
          source_published_at: downloaded.publishedAt,
          source_like_count: downloaded.likeCount,
          source_topic: inferHotTopicCategory(downloaded.title),
          source_tags: extractSourceTags(downloaded.title),
          source_transcript: transcript,
          source_evidence: evidence,
        }).filter(([, value]) => Boolean(value?.trim())));
        return Response.json({
          status: "downloaded",
          finalUrl: downloaded.sourceUrl,
          thumbnailUrl: downloaded.thumbnailFile ? `${mediaBase}${encodeURIComponent(downloaded.thumbnailFile)}` : undefined,
          mediaUrl: `${mediaBase}${encodeURIComponent(downloaded.videoFile)}`,
          fields,
          note: body.deferTranscription === true
            ? "已下载真实作品并回填公开元数据，正在准备本地流式转写。"
            : transcript ? "已下载真实作品，自动回填元数据、转写稿和证据摘要。" : "已下载真实作品并回填公开元数据；转写服务暂不可用，已保留真实视频和封面。",
        });
      } catch (downloadError) {
        const message = downloadError instanceof Error ? downloadError.message : "抖音下载失败。";
        if (/需要登录 Cookie|未安装 yt-dlp|限流/.test(message)) {
          return Response.json({ status: "unavailable", fields: {}, note: message }, { status: 200 });
        }
      }
    }
    if (/^(?:www\.)?weixin\.qq\.com$/i.test(parsed.hostname) || /(^|\.)channels\.weixin\.qq\.com$/i.test(parsed.hostname)) {
      return inspectWechatChannelsSource(parsed.toString(), user.id, body.deferTranscription === true);
    }
    const deepInspectBase = process.env.VIRAL_INSPECT_API_BASE;
    if (deepInspectBase) {
      const deepResponse = await fetch(`${deepInspectBase.replace(/\/$/, "")}/inspect`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: parsed.toString() }),
        signal: AbortSignal.timeout(Number(process.env.VIRAL_INSPECT_TIMEOUT_MS ?? 20000)),
      });
      if (deepResponse.ok) {
        const payload = await deepResponse.json() as { fields?: Record<string, string>; thumbnailUrl?: string; mediaUrl?: string; embedUrl?: string; transcript?: string; evidence?: string; note?: string };
        return Response.json({ status: "deep", ...payload, fields: { source_type: sourceTypeForHost(parsed.hostname), ...(payload.fields ?? {}), ...(payload.transcript ? { source_transcript: payload.transcript } : {}), ...(payload.evidence ? { source_evidence: payload.evidence } : {}) }, note: payload.note ?? "已由配置的公开来源解析服务返回。" });
      }
    }
    const response = await fetch(parsed.toString(), {
      headers: { "user-agent": "Mozilla/5.0 (compatible; XiaoguPublicSourceInspector/1.0)" },
      signal: AbortSignal.timeout(8000),
      redirect: "follow",
    });
    if (!response.ok) return Response.json({ error: `公开页面暂时不可读（${response.status}）。` }, { status: 502 });
    const html = await response.text();
    const finalUrl = response.url || parsed.toString();
    const title = firstMeta(html, ["og:title", "twitter:title"]) ?? firstTitle(html);
    const description = firstMeta(html, ["og:description", "description"]);
    const thumbnailUrl = firstMeta(html, ["og:image", "twitter:image"]);
    const mediaUrl = firstMeta(html, ["og:video:secure_url", "og:video", "twitter:player:stream"]);
    const author = firstMeta(html, ["author", "article:author"]);
    const publishedAt = firstMeta(html, ["article:published_time", "datePublished", "publish_time"]);
    const likeCount = firstMeta(html, ["like_count", "interactionCount", "interactionStatistic"]);
    const finalHostname = new URL(finalUrl).hostname;
    const isXhs = /(^|\.)xiaohongshu\.com$|(^|\.)xhslink\.com$/i.test(finalHostname);
    const articleText = /mp\.weixin\.qq\.com$/i.test(finalHostname) ? extractWechatArticleText(html) : "";
    const sourceText = isXhs ? description : articleText;
    const fields = Object.fromEntries(
      Object.entries({
        source_type: sourceTypeForHost(finalHostname),
        source_content_type: contentTypeForSource({ hostname: finalHostname, url: finalUrl, mediaUrl }),
        source_title: title,
        source_author: author,
        source_published_at: normalizePublishedAt(publishedAt),
        source_like_count: likeCount,
        source_topic: inferHotTopicCategory(title || description),
        source_tags: extractSourceTags(`${title} ${description}`),
        source_evidence: description,
        source_text: sourceText,
      }).filter(([, value]) => Boolean(value?.trim())),
    );
    const evidence = description ? await summarizePublicEvidence({ title, description, userId: user.id }) : "";
    if (evidence) fields.source_evidence = evidence;
    const transcript = body.deferTranscription === true ? "" : mediaUrl ? await transcribePublicMedia(mediaUrl) : "";
    if (transcript) fields.source_transcript = transcript;
    return Response.json({
      status: Object.keys(fields).length > 0 ? "partial" : "unavailable",
      finalUrl,
      thumbnailUrl,
      mediaUrl,
      fields,
      note: isXhs && mediaUrl
        ? "已识别为小红书视频；仅回填公开页面明确暴露的字段，视频转写需以可访问媒体和转写服务为准。"
        : isXhs
        ? "已识别为小红书纯图文；正文放入作品文字内容，不会误当作语音转写。"
        : "仅回填公开页面明确暴露的字段；点赞数、发布时间和证据摘要仍需以作品详情页核验。",
    });
  } catch {
    return Response.json({ error: "公开页面暂时不可读，请确认链接是单条作品页，而不是检索页。" }, { status: 502 });
  }
}

async function resolveDouyinShareUrl(sourceUrl: URL) {
  try {
    const response = await fetch(sourceUrl, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; XiaoguPublicSourceInspector/1.0)" },
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
    });
    const finalUrl = response.url;
    await response.body?.cancel();
    if (!finalUrl || !/^https?:$/i.test(new URL(finalUrl).protocol)) return null;
    return new URL(finalUrl);
  } catch {
    return null;
  }
}

function extractUrlFromShareText(value: string) {
  const match = value.match(/https?:\/\/[^\s"'<>]+/i)?.[0] ?? value;
  return match.replace(/[，。！？；：、）》】]+$/g, "");
}

function extractSourceTags(value: string) {
  const tags = [...value.matchAll(/#([^#\s]{1,24})/g)].map((match) => match[1]).filter(Boolean);
  return [...new Set(tags)].slice(0, 8).join("、");
}

async function inspectWechatArticleSource(parsed: URL) {
  const response = await fetch(parsed.toString(), {
    headers: { "user-agent": "Mozilla/5.0 (compatible; XiaoguPublicSourceInspector/1.0)" },
    signal: AbortSignal.timeout(12000),
    redirect: "follow",
  });
  if (!response.ok) return Response.json({ error: `公众号文章暂时不可读（${response.status}）。` }, { status: 502 });
  const html = await response.text();
  const finalUrl = response.url || parsed.toString();
  const title = firstMeta(html, ["og:title", "twitter:title"]) || firstTitle(html) || extractWechatArticleTitle(html);
  const description = firstMeta(html, ["og:description", "description"]);
  const articleText = extractWechatArticleText(html);
  const fields = Object.fromEntries(
    Object.entries({
      source_type: "wechat_article",
      source_content_type: "公众号正文",
      source_title: title,
      source_author: firstMeta(html, ["author", "article:author"]) || extractWechatAuthor(html),
      source_published_at: normalizePublishedAt(firstMeta(html, ["article:published_time", "datePublished", "publish_time"]) || extractWechatPublishTime(html)),
      source_evidence: description,
      source_text: articleText,
    }).filter(([, value]) => Boolean(value?.trim())),
  );
  return Response.json({
    status: articleText || Object.keys(fields).length > 1 ? "partial" : "unavailable",
    finalUrl,
    thumbnailUrl: firstMeta(html, ["og:image", "twitter:image"]),
    fields,
    note: articleText
      ? "已提取公众号正文、标题和公开元信息，可直接进入二创。"
      : "只读到公众号公开元信息，正文可能需要登录态或手动粘贴。",
  });
}

async function inspectXhsWithConfiguredApi(sourceUrl: string) {
  const base = process.env.VIRAL_XHS_INSPECT_API_BASE;
  if (!base) return null;
  try {
    const endpoint = `${base.replace(/\/$/, "")}/xhs/detail`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: sourceUrl, download: false }),
      signal: AbortSignal.timeout(Number(process.env.VIRAL_XHS_INSPECT_TIMEOUT_MS ?? 30000)),
    });
    if (!response.ok) return Response.json({ status: "unavailable", fields: {}, note: `小红书解析服务暂不可用（${response.status}）。` });
    const payload = await response.json() as Record<string, unknown>;
    const fields = Object.fromEntries(
      Object.entries({
        source_type: "xiaohongshu",
        source_content_type: contentTypeForSource({ hostname: new URL(sourceUrl).hostname, url: sourceUrl, mediaUrl: findString(payload, ["video_url", "videoUrl", "download_url", "downloadUrl"]) }),
        source_title: findString(payload, ["title", "note_title", "noteTitle"]),
        source_author: findString(payload, ["author", "nickname", "user.nickname", "user_nickname"]),
        source_published_at: normalizePublishedAt(findString(payload, ["published_at", "publish_time", "time"])),
        source_like_count: findString(payload, ["like_count", "liked_count", "likes"]),
        source_evidence: findString(payload, ["description", "desc", "content"]),
        source_text: findString(payload, ["content", "desc", "description"]),
      }).filter(([, value]) => Boolean(value)),
    );
    return Response.json({
      status: Object.keys(fields).length > 1 ? "deep" : "unavailable",
      finalUrl: sourceUrl,
      thumbnailUrl: findString(payload, ["thumbnail", "cover", "cover_url", "image_url"]),
      mediaUrl: findString(payload, ["video_url", "videoUrl", "download_url", "downloadUrl"]),
      fields,
      note: Object.keys(fields).length > 1 ? "已通过配置的小红书 API 回填作品信息。" : "小红书解析服务未返回可用字段。",
    });
  } catch {
    return Response.json({ status: "unavailable", fields: {}, note: "小红书解析服务请求超时或暂时不可用。" });
  }
}

async function inspectWechatChannelsSource(sourceUrl: string, userId: string, deferTranscription = false) {
  const containerResult = await inspectWechatChannelsWithContainerBrowser(sourceUrl);
  if (containerResult.status === "success") {
    return wechatChannelsPayloadResponse(sourceUrl, containerResult.payload, "已通过容器内 Yuanbao 浏览器会话获取视频号作品信息", userId, deferTranscription);
  }
  if (containerResult.status === "needs_login") {
    return unavailableWechatChannelsResponse(sourceUrl, containerResult.reason);
  }
  const localBase = process.env.VIRAL_WECHAT_LOCAL_API_BASE?.trim();
  if (localBase) {
    return inspectWechatChannelsLocalSource(sourceUrl, localBase, userId, deferTranscription);
  }
  const endpoint = process.env.VIRAL_WECHAT_INSPECT_API_BASE ?? "https://sph.litao.workers.dev/api/fetch_video_profile";
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: sourceUrl }),
      signal: AbortSignal.timeout(Number(process.env.VIRAL_WECHAT_INSPECT_TIMEOUT_MS ?? 30000)),
    });
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) {
      return unavailableWechatChannelsResponse(sourceUrl, `视频号解析服务暂不可用（${response.status}）。`);
    }

    const data = (payload.data && typeof payload.data === "object" ? payload.data : payload) as Record<string, unknown>;
    const feed = (data.feedInfo && typeof data.feedInfo === "object" ? data.feedInfo : {}) as Record<string, unknown>;
    const authorInfo = (data.authorInfo && typeof data.authorInfo === "object" ? data.authorInfo : {}) as Record<string, unknown>;
    const h264 = (feed.h264VideoInfo && typeof feed.h264VideoInfo === "object" ? feed.h264VideoInfo : {}) as Record<string, unknown>;
    const h265 = (feed.h265VideoInfo && typeof feed.h265VideoInfo === "object" ? feed.h265VideoInfo : {}) as Record<string, unknown>;
    const description = stringValue(feed.description);
    const mediaUrl = stringValue(feed.videoUrl) || stringValue(feed.originVideoUrl) || stringValue(h264.videoUrl) || stringValue(h265.videoUrl);
    const fields = Object.fromEntries(
      Object.entries({
        source_type: "unknown",
        source_title: description.slice(0, 160),
        source_author: stringValue(authorInfo.nickname),
        source_published_at: unixTimeValue(feed.createtime),
        source_like_count: stringValue(feed.likeCountFmt),
        source_evidence: description,
      }).filter(([, value]) => Boolean(value)),
    );
    const transcript = deferTranscription ? "" : mediaUrl ? await transcribePublicMedia(mediaUrl) : "";
    if (transcript) {
      fields.source_transcript = transcript;
      const evidence = await summarizeTranscriptEvidence(description, transcript, userId);
      if (evidence) fields.source_evidence = evidence;
    }
    if (!mediaUrl && !description && Object.keys(fields).length === 1) {
      return unavailableWechatChannelsResponse(sourceUrl, "视频号解析服务没有返回作品详情。");
    }
    return Response.json({
      status: Object.keys(fields).length > 0 ? "downloaded" : "unavailable",
      finalUrl: sourceUrl,
      thumbnailUrl: stringValue(feed.coverUrl),
      mediaUrl,
      fields,
      note: deferTranscription && mediaUrl
        ? "已回填视频号作品信息，正在准备本地语音转写。"
        : transcript
        ? "已参考 wx_channels_download 的分享链接解析流程，并完成视频号作品转写。"
        : "已参考 wx_channels_download 的分享链接解析流程，回填视频号公开信息；如需口播级分析，请补充视频文字内容。",
    });
  } catch {
    return unavailableWechatChannelsResponse(sourceUrl, "视频号解析服务暂时不可用。");
  }
}

async function wechatChannelsPayloadResponse(sourceUrl: string, payload: Record<string, unknown>, prefix: string, userId: string, deferTranscription = false) {
  const data = (payload.data && typeof payload.data === "object" ? payload.data : payload) as Record<string, unknown>;
  const feed = (data.feedInfo && typeof data.feedInfo === "object" ? data.feedInfo : {}) as Record<string, unknown>;
  const authorInfo = (data.authorInfo && typeof data.authorInfo === "object" ? data.authorInfo : {}) as Record<string, unknown>;
  const h264 = (feed.h264VideoInfo && typeof feed.h264VideoInfo === "object" ? feed.h264VideoInfo : {}) as Record<string, unknown>;
  const h265 = (feed.h265VideoInfo && typeof feed.h265VideoInfo === "object" ? feed.h265VideoInfo : {}) as Record<string, unknown>;
  const description = stringValue(feed.description);
  const mediaUrl = stringValue(feed.videoUrl) || stringValue(feed.originVideoUrl) || stringValue(h264.videoUrl) || stringValue(h265.videoUrl);
  const mediaDecryptKey = stringValue(feed.mediaDecryptKey);
  const fields = Object.fromEntries(
    Object.entries({
      source_type: "unknown",
      source_title: description.slice(0, 160),
      source_author: stringValue(authorInfo.nickname),
      source_published_at: unixTimeValue(feed.createtime),
      source_like_count: stringValue(feed.likeCountFmt),
      source_evidence: description,
    }).filter(([, value]) => Boolean(value)),
  );
  const transcript = deferTranscription ? "" : mediaUrl ? await transcribePublicMedia(mediaUrl) : "";
  if (transcript) {
    fields.source_transcript = transcript;
    const evidence = await summarizeTranscriptEvidence(description, transcript, userId);
    if (evidence) fields.source_evidence = evidence;
  }
  if (!mediaUrl && !description && Object.keys(fields).length === 1) {
    return unavailableWechatChannelsResponse(sourceUrl, `${prefix}，但没有返回作品详情。`);
  }
  return Response.json({
    status: Object.keys(fields).length > 0 ? "downloaded" : "unavailable",
    finalUrl: sourceUrl,
    thumbnailUrl: stringValue(feed.coverUrl),
    mediaUrl,
    mediaDecryptKey,
    fields,
    note: deferTranscription && mediaUrl
      ? `${prefix}，正在准备本地语音转写。`
      : transcript ? `${prefix}并完成视频转写。` : `${prefix}；如需口播级分析，请确认转写服务已配置。`,
  });
}

async function inspectWechatChannelsLocalSource(sourceUrl: string, base: string, userId: string, deferTranscription = false) {
  const endpoint = `${base.replace(/\/$/, "")}/api/channels/parse_sph?url=${encodeURIComponent(sourceUrl)}`;
  try {
    const response = await fetch(endpoint, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(Number(process.env.VIRAL_WECHAT_INSPECT_TIMEOUT_MS ?? 30000)),
    });
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok || Number(payload.code) !== 0) {
      const message = stringValue(payload.msg) || `本地视频号解析服务不可用（${response.status}）。`;
      return unavailableWechatChannelsResponse(sourceUrl, message);
    }
    const data = (payload.data && typeof payload.data === "object" ? payload.data : {}) as Record<string, unknown>;
    const feed = (data.feedInfo && typeof data.feedInfo === "object" ? data.feedInfo : {}) as Record<string, unknown>;
    const authorInfo = (data.authorInfo && typeof data.authorInfo === "object" ? data.authorInfo : {}) as Record<string, unknown>;
    const h264 = (feed.h264VideoInfo && typeof feed.h264VideoInfo === "object" ? feed.h264VideoInfo : {}) as Record<string, unknown>;
    const h265 = (feed.h265VideoInfo && typeof feed.h265VideoInfo === "object" ? feed.h265VideoInfo : {}) as Record<string, unknown>;
    const description = stringValue(feed.description);
    const mediaUrl = stringValue(feed.videoUrl) || stringValue(feed.originVideoUrl) || stringValue(h264.videoUrl) || stringValue(h265.videoUrl);
    const fields = Object.fromEntries(
      Object.entries({
        source_type: "unknown",
        source_title: description.slice(0, 160),
        source_author: stringValue(authorInfo.nickname),
        source_published_at: unixTimeValue(feed.createtime),
        source_like_count: stringValue(feed.likeCountFmt),
        source_evidence: description,
      }).filter(([, value]) => Boolean(value)),
    );
    const transcript = deferTranscription ? "" : mediaUrl ? await transcribePublicMedia(mediaUrl) : "";
    if (transcript) {
      fields.source_transcript = transcript;
      const evidence = await summarizeTranscriptEvidence(description, transcript, userId);
      if (evidence) fields.source_evidence = evidence;
    }
    return Response.json({
      status: mediaUrl || description ? "downloaded" : "unavailable",
      finalUrl: sourceUrl,
      thumbnailUrl: stringValue(feed.coverUrl),
      mediaUrl,
      fields,
      note: deferTranscription && mediaUrl
        ? "已通过本机 wx_channels_download 解析服务获取视频号公开信息，正在准备本地语音转写。"
        : transcript
        ? "已通过本机 wx_channels_download 解析服务获取视频并完成转写。"
        : "已通过本机 wx_channels_download 解析服务获取视频号公开信息；如需口播级分析，请确认转写服务已配置。",
    });
  } catch {
    return unavailableWechatChannelsResponse(sourceUrl, "本地视频号解析服务连接失败，请确认 wx_channels_download 正在运行并监听配置端口。");
  }
}

function unavailableWechatChannelsResponse(sourceUrl: string, reason: string) {
  return Response.json({
    status: "unavailable",
    finalUrl: sourceUrl,
    fields: {
      source_type: "unknown",
      source_evidence: "参考链接内容待核验，当前没有读取到视频号作品详情。",
    },
    note: `${reason} 已保留链接，可继续提交进行原创二创；如需提炼原视频内容，请配置自建视频号解析服务，或补充作品转写。`,
  });
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function unixTimeValue(value: unknown) {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : "";
}

function sourceTypeForHost(hostname: string) {
  if (/mp\.weixin\.qq\.com$/i.test(hostname)) return "wechat_article";
  if (/xiaohongshu\.com$|xhslink\.com$/i.test(hostname)) return "xiaohongshu";
  if (/douyin\.com$/i.test(hostname)) return "douyin";
  if (/weixin\.qq\.com$/i.test(hostname)) return "wechat_channels";
  return "unknown";
}

function contentTypeForSource(input: { hostname: string; url: string; mediaUrl?: string }) {
  if (/mp\.weixin\.qq\.com$/i.test(input.hostname)) return "公众号正文";
  if (/douyin\.com$/i.test(input.hostname)) return "视频";
  if (/xiaohongshu\.com$|xhslink\.com$/i.test(input.hostname)) {
    const queryType = new URL(input.url).searchParams.get("type");
    return queryType === "video" || Boolean(input.mediaUrl) ? "小红书视频" : "小红书纯图文";
  }
  return "未确认";
}

function findString(value: unknown, paths: string[]) {
  for (const path of paths) {
    const result = path.split(".").reduce<unknown>((current, key) => current && typeof current === "object" ? (current as Record<string, unknown>)[key] : undefined, value);
    const text = stringValue(result);
    if (text) return text;
  }
  return "";
}

function extractWechatArticleTitle(html: string) {
  const match = html.match(/id=["']activity-name["'][^>]*>([\s\S]*?)<\//i);
  return match?.[1] ? decodeHtml(stripHtml(match[1])).trim() : "";
}

function extractWechatAuthor(html: string) {
  const match = html.match(/(?:id|class)=["'][^"']*(?:js_name|profile_nickname)[^"']*["'][^>]*>([\s\S]*?)<\//i);
  return match?.[1] ? decodeHtml(stripHtml(match[1])).trim() : "";
}

function extractWechatPublishTime(html: string) {
  const match = html.match(/(?:publish_time|ct)["']?\s*[:=]\s*["']([^"']+)["']/i);
  return match?.[1]?.trim() ?? "";
}

function normalizePublishedAt(value: string) {
  const normalized = value.trim();
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?/.test(normalized)) return normalized;
  if (/^\d{8}$/.test(normalized) || /^\d{10,13}$/.test(normalized)) return normalized;
  return "";
}

function extractWechatArticleText(html: string) {
  const match = html.match(/<div[^>]+id=["']js_content["'][^>]*>([\s\S]*?)<\/div>/i);
  if (!match?.[1]) return "";
  return decodeHtml(stripHtml(match[1]))
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 12000);
}

function stripHtml(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

async function summarizePublicEvidence(input: { title: string; description: string; userId: string }) {
  try {
    // Local Agent owns extraction and transcription only. Text generation and
    // user-profile enrichment stay on the AWS Web side.
    if (process.env.LOCAL_AGENT_EXECUTOR === "1") return "";
    const prompt = [
      "请只基于下面公开页面已经明确出现的标题和描述，提炼一条事实证据摘要。",
      "不要补充页面没有出现的播放量、点赞数、人物、案例、结论或转写内容。",
      "如果没有具体案例、数据、组织、时间范围、流程或边界，请返回‘未发现可核验证据’。",
      `标题：${input.title || "未提供"}`,
      `公开描述：${input.description}`,
      "只返回一段不超过80字的中文摘要，不要加标题或 Markdown。",
    ].join("\n");
    const key = process.env.VIRAL_INSPECT_OPENAI_API_KEY;
    if (key) {
      const response = await fetch(`${(process.env.VIRAL_INSPECT_OPENAI_API_BASE ?? "https://api.openai.com/v1").replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({ model: process.env.VIRAL_INSPECT_OPENAI_MODEL ?? "gpt-4o-mini", temperature: 0, messages: [{ role: "user", content: prompt }] }),
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) return "";
      const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      return payload.choices?.[0]?.message?.content?.trim().slice(0, 240) ?? "";
    }
    const output = await runInsuranceContentAgent([{ role: "user", content: prompt }], input.userId, "general");
    return output.trim().slice(0, 240);
  } catch {
    return "";
  }
}

async function transcribePublicMedia(mediaUrl: string) {
  try {
    const mediaResponse = await fetch(mediaUrl, { signal: AbortSignal.timeout(15000) });
    if (!mediaResponse.ok) return "";
    const contentLength = Number(mediaResponse.headers.get("content-length") ?? 0);
    if (contentLength > 100 * 1024 * 1024) return "";
    const bytes = await mediaResponse.arrayBuffer();
    if (bytes.byteLength > 100 * 1024 * 1024) return "";
    const form = new FormData();
    form.append("file", new Blob([bytes], { type: mediaResponse.headers.get("content-type") ?? "video/mp4" }), "source-media.mp4");
    form.append("language", "zh");
    const localBase = process.env.VIRAL_TRANSCRIBE_API_BASE?.trim();
    if (localBase) {
      const response = await fetch(`${localBase.replace(/\/$/, "")}/transcribe`, {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(Number(process.env.VIRAL_INSPECT_TRANSCRIBE_TIMEOUT_MS ?? 240000)),
      });
      if (!response.ok) return "";
      const payload = await response.json() as { text?: string };
      return payload.text?.trim().slice(0, 12000) ?? "";
    }
    return "";
  } catch {
    return "";
  }
}

async function summarizeTranscriptEvidence(description: string, transcript: string, userId: string) {
  const evidence = await summarizePublicEvidence({
    title: description.slice(0, 160),
    description: `作品公开文案：${description}\n\n视频转写（可能存在同音字或识别误差）：${transcript}`,
    userId,
  });
  return evidence === "未发现可核验证据" ? "" : evidence;
}

function firstMeta(html: string, names: string[]) {
  for (const name of names) {
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = html.match(new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${escapedName}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"))
      ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name|itemprop)=["']${escapedName}["'][^>]*>`, "i"));
    if (match?.[1]) return decodeHtml(match[1]).trim();
  }
  return "";
}

function firstTitle(html: string) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match?.[1] ? decodeHtml(match[1]).replace(/\s+/g, " ").trim() : "";
}

function decodeHtml(value: string) {
  return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}
