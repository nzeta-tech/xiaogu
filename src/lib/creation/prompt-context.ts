import { creationExamples, getCreationAppBySlug, type CreationApp } from "@/lib/apps/catalog";
import { getEntryAdjustedApp, shouldShowRealExample } from "@/lib/apps/entry-app";

export function buildCreationCaseContext(appSlug: string) {
  const example = creationExamples.find((item) => item.appSlug === appSlug);
  if (!example) return [] as string[];
  return [
    `用户从功能示例“${example.title}”进入创作。示例仅用于说明功能，不得复写示例正文、标题或具体情节。`,
    "只使用用户本次提交的信息；信息不足时明确标注待核实项，不得补造客户、产品、收益或理赔事实。",
  ];
}

export function buildCreationPromptContext(appOrSlug: CreationApp | string, entry = "") {
  const baseApp = typeof appOrSlug === "string" ? getCreationAppBySlug(appOrSlug) : appOrSlug;
  if (!baseApp) return [] as string[];

  const app = getEntryAdjustedApp(baseApp, entry);
  const exampleContext = shouldShowRealExample(app.slug, entry) ? buildCreationCaseContext(app.slug) : [];
  if (exampleContext.length > 0) return exampleContext;

  const lines = [
    `应用描述：${app.description}`,
    `prompt 线索：${app.promptHint}`,
  ];

  if (app.exampleTitle) lines.push(`功能示例名称：${app.exampleTitle}（仅用于界面说明，不作为仿写文本）`);
  lines.push("请严格依据应用描述和用户输入完成任务，不推测或模仿其他产品的页面结构。");
  return lines;
}
