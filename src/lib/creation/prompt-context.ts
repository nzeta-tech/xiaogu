import { getCreationAppBySlug, type CreationApp } from "@/lib/apps/catalog";
import { getEntryAdjustedApp } from "@/lib/apps/entry-app";

export function buildCreationPromptContext(appOrSlug: CreationApp | string, entry = "") {
  const baseApp = typeof appOrSlug === "string" ? getCreationAppBySlug(appOrSlug) : appOrSlug;
  if (!baseApp) return [] as string[];

  const app = getEntryAdjustedApp(baseApp, entry);
  const lines = [
    `应用描述：${app.description}`,
    `prompt 线索：${app.promptHint}`,
  ];

  lines.push("请严格依据应用描述和用户输入完成任务，不推测或模仿其他产品的页面结构。");
  return lines;
}
