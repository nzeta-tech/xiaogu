import { getCreationAppBySlug } from "@/lib/apps/catalog";
import { creationExamples } from "@/lib/apps/catalog";

export function buildCreationCaseContext(appSlug: string) {
  const example = creationExamples.find((item) => item.appSlug === appSlug);
  if (!example) return [] as string[];

  const lines = [
    `参考案例：${example.title}`,
    `案例概述：${example.summary}`,
  ];

  if (example.intro) lines.push(`案例引导：${example.intro}`);
  if (example.highlight) lines.push(`案例亮点：${example.highlight}`);
  if (example.tabs?.length) lines.push(`案例标签：${example.tabs.join("、")}`);
  if (example.sections?.length) {
    lines.push(`案例结构：${example.sections.map((section) => section.title).join("、")}`);
  }
  if (example.outputs?.length) {
    lines.push(`案例输出：${example.outputs.map((output) => output.title).join("、")}`);
  }
  if (example.imageResults?.length) {
    lines.push(`图片结果：${example.imageResults.map((result) => result.title).join("、")}`);
  }

  lines.push("请优先参考这个案例的结构、语气、信息密度和输出节奏来生成本次内容。");
  return lines;
}

export function buildCreationPromptContext(appSlug: string) {
  const exampleContext = buildCreationCaseContext(appSlug);
  if (exampleContext.length > 0) return exampleContext;

  const app = getCreationAppBySlug(appSlug);
  if (!app) return [] as string[];

  const lines = [
    `应用描述：${app.description}`,
    `prompt 线索：${app.promptHint}`,
  ];

  if (app.exampleTitle) lines.push(`案例标题线索：${app.exampleTitle}`);
  if (app.exampleSummary) lines.push(`案例摘要线索：${app.exampleSummary}`);
  lines.push("请根据这些描述推测该应用的结果页结构、字段密度和输出节奏。");
  return lines;
}
