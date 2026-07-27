import { requireSessionUser } from "@/lib/auth/session";
import { inspectWechatChannelsWithContainerBrowser } from "@/lib/creation/wechat-channels-container";

const wechatShareHost = /^(?:www\.)?weixin\.qq\.com$/i;

export async function POST(request: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const body = (await request.json().catch(() => ({}))) as { url?: string };
  let sourceUrl: URL;
  try {
    sourceUrl = new URL(body.url?.trim() ?? "");
  } catch {
    return Response.json({ error: "请输入有效的视频号作品链接。" }, { status: 400 });
  }
  if (sourceUrl.protocol !== "https:" || !wechatShareHost.test(sourceUrl.hostname)) {
    return Response.json({ error: "目前仅支持视频号作品的流式转写。" }, { status: 400 });
  }

  const parsed = await inspectWechatChannelsWithContainerBrowser(sourceUrl.toString());
  if (parsed.status !== "success") {
    return Response.json({ error: parsed.status === "needs_login" ? parsed.reason : "视频号解析服务暂不可用。" }, { status: 409 });
  }
  const data = asRecord(parsed.payload.data);
  const feed = asRecord(data.feedInfo);
  const h264 = asRecord(feed.h264VideoInfo);
  const h265 = asRecord(feed.h265VideoInfo);
  const mediaUrl = stringValue(feed.videoUrl) || stringValue(feed.originVideoUrl) || stringValue(h264.videoUrl) || stringValue(h265.videoUrl);
  if (!mediaUrl) return Response.json({ error: "视频号作品没有返回可转写的视频地址。" }, { status: 422 });

  const encoder = new TextEncoder();
  const event = (payload: unknown) => encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);
  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: unknown) => controller.enqueue(event(payload));
      try {
        send({ type: "status", message: "正在获取视频音频..." });
        const media = await fetch(mediaUrl, { signal: AbortSignal.timeout(30000) });
        if (!media.ok) throw new Error("视频文件暂时无法下载。");
        const bytes = await media.arrayBuffer();
        if (bytes.byteLength > 100 * 1024 * 1024) throw new Error("视频文件超过本地转写大小限制。");
        send({ type: "status", message: "正在识别语音..." });
        const form = new FormData();
        form.append("file", new Blob([bytes], { type: media.headers.get("content-type") ?? "video/mp4" }), "source-media.mp4");
        form.append("language", "zh");
        const base = process.env.VIRAL_TRANSCRIBE_API_BASE?.trim();
        if (!base) throw new Error("本地语音转写服务尚未启用。");
        const upstream = await fetch(`${base.replace(/\/$/, "")}/transcribe/stream`, { method: "POST", body: form, signal: AbortSignal.timeout(Number(process.env.VIRAL_INSPECT_TRANSCRIBE_TIMEOUT_MS ?? 240000)) });
        if (!upstream.ok || !upstream.body) throw new Error("本地语音转写服务暂不可用。");
        const reader = upstream.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const messages = buffer.split("\n\n");
          buffer = messages.pop() ?? "";
          for (const message of messages) {
            const line = message.split("\n").find((item) => item.startsWith("data: "));
            if (!line) continue;
            const payload = JSON.parse(line.slice(6)) as { type?: string; content?: string; message?: string };
            if (payload.type === "delta" && payload.content) send({ type: "delta", content: payload.content });
            if (payload.type === "error") throw new Error(payload.message ?? "本地语音转写失败。");
          }
        }
        send({ type: "done" });
      } catch (error) {
        send({ type: "error", message: error instanceof Error ? error.message : "本地语音转写失败。" });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", "x-accel-buffering": "no" } });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
