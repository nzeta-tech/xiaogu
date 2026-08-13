"use client";

import { useEffect, useRef } from "react";
import { apiPath } from "@/lib/client/url";

export function useRestoredWorkStream(input: {
  workId: string;
  enabled: boolean;
  onContent: (content: string) => void;
  onDone: (content: string) => void;
  onError: (message: string) => void;
}) {
  const callbacks = useRef(input);

  useEffect(() => {
    callbacks.current = input;
  }, [input]);

  useEffect(() => {
    if (!input.enabled || !input.workId) return;
    const controller = new AbortController();

    async function connect() {
      try {
        const response = await fetch(apiPath(`/api/works/${input.workId}/stream`), {
          signal: controller.signal,
          headers: { accept: "text/event-stream" },
        });
        if (!response.ok || !response.body) throw new Error("生成进度流暂时无法连接。");
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let content = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";
          for (const event of events) {
            const line = event.split("\n").find((item) => item.trim().startsWith("data:"));
            if (!line) continue;
            const payload = JSON.parse(line.slice(line.indexOf("data:") + 5).trim()) as { type?: string; content?: string; result?: string };
            if (payload.type === "delta" && typeof payload.content === "string") {
              content += payload.content;
              callbacks.current.onContent(content);
            }
            if (payload.type === "done") {
              content = typeof payload.result === "string" ? payload.result : content;
              callbacks.current.onDone(content);
            }
            if (payload.type === "error") throw new Error(payload.content || "内容生成失败。");
          }
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        callbacks.current.onError(error instanceof Error ? error.message : "生成进度流中断。");
      }
    }

    void connect();
    return () => controller.abort();
  }, [input.enabled, input.workId]);
}
