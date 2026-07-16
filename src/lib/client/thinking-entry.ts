"use client";

import { useEffect, useState } from "react";
import { apiPath, appPath } from "@/lib/client/url";

type ThinkingEntryPayload = {
  summary?: {
    ready?: boolean;
  } | null;
  thinkingProfileSnapshot?: {
    id: string;
  } | null;
};

export function useThinkingEntryState() {
  const [hasThinking, setHasThinking] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadThinkingState() {
      try {
        const response = await fetch(apiPath("/api/thinking"), {
          credentials: "include",
          cache: "no-store",
        });

        if (!response.ok) {
          if (!cancelled) {
            setHasThinking(false);
          }
          return;
        }

        const payload = (await response.json()) as ThinkingEntryPayload;
        if (cancelled) return;
        setHasThinking(Boolean(payload.thinkingProfileSnapshot || payload.summary?.ready));
      } catch {
        if (!cancelled) {
          setHasThinking(false);
        }
      }
    }

    void loadThinkingState();

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    hasThinking,
    title: hasThinking ? "查看我的思维设定" : "创建我的思维",
    description: hasThinking
      ? "已完成内容画像，可随时查看和调整，让创作更贴近你的真实经验与表达"
      : "建立内容画像，让选题、语气和专业边界更贴近你的实际工作",
    actionLabel: hasThinking ? "查看思维设定" : "创建思维",
    href: appPath("/thinking"),
  };
}
