"use client";

import { apiPath } from "@/lib/client/url";

export type StreamedCreationImage = { id: string; url: string };

export async function streamCreationImages(slug: string, values: Record<string, unknown>, workId?: string) {
  const response = await fetch(apiPath(`/api/creation/apps/${slug}/stream`), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ values, workId }),
  });
  if (!response.ok || !response.body) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(payload?.error || "配图任务没有成功启动，请稍后重试。");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let images: StreamedCreationImage[] = [];
  let error = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const event of events) {
      const line = event.split("\n").find((item) => item.startsWith("data: "));
      if (!line) continue;
      const payload = JSON.parse(line.slice(6)) as { type?: string; content?: string; images?: StreamedCreationImage[] };
      if (payload.type === "images" || payload.type === "done") images = payload.images ?? images;
      if (payload.type === "error") error = payload.content || "配图生成失败，请稍后重试。";
    }
  }

  if (error) throw new Error(error);
  if (!images.length) throw new Error("图片服务暂时未返回可用图片，请稍后重试。");
  return images;
}
