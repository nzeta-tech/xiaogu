import { stringifyCreationFieldValue, type CreationFieldValue } from "@/lib/creation/output";

export const XIAOHONGSHU_CHECK_DISCLAIMER =
  "⚠️ 合规 ≠ 流量保证。 内容是否获得推流受多种因素影响，本工具的核心目的是降低内容触发平台限流或违规的风险，不对修改后的实际流量表现作任何承诺。";

export const XIAOHONGSHU_CHECK_REPORT_HEADINGS = [
  "风险等级",
  "文章性质",
  "风险概览",
  "【修改后正文】",
  "【改动说明】",
] as const;

/**
 * Reconstructed prompt contract for the Xiaohongshu compliance report.
 *
 * The target instance is authentication-protected, so this is deliberately
 * isolated from UI copy and versioned as a local product template. Its stable
 * headings are also the contract consumed by the dedicated result renderer.
 */
export function buildXiaohongshuCheckPrompt(
  values: Record<string, CreationFieldValue>,
  caseContext: string[],
  promptHint: string,
) {
  const content = stringifyCreationFieldValue(values.content).trim();

  return [
    "你现在在执行小谷应用：小红书违规检测。",
    "这是一个合规审查与修改建议应用，不是普通改写器，也不是重新从零创作文案的应用。",
    ...caseContext,
    `应用提示：${promptHint}`,
    "请严格按下述报告结构输出，不要自由换结构，不要输出任何前言、寒暄、总结或多余解释。",
    "输出必须严格按以下顺序，字段名必须完全一致：",
    `1. 第一行原样输出：${XIAOHONGSHU_CHECK_DISCLAIMER}`,
    "2. 第二行输出：风险等级：高风险 / 中等风险 / 低风险 其中之一。",
    "3. 第三行输出：文章性质：例如科普教育向、经验分享向、观点表达向、种草测评向等，必须给出一个判断。",
    "4. 第四行输出：风险概览：用 120-220 字概述这篇内容最容易触发审核、限流、误导或敏感判定的点，语气专业克制，像审核报告。",
    "5. 然后单独输出标题：【修改后正文】",
    "6. 在该标题下给出一版完整修改后的正文，保留用户原意，但主动去除或弱化违规、夸大、绝对化、功效承诺、规避审核、敏感承诺、资产隔离避债暗示、具体险种硬引导等风险表达。",
    "7. 然后单独输出标题：【改动说明】",
    "8. 在该标题下至少输出 3 条改动说明。每条严格包含两行：第一行格式为 原文：「...」→ 改为：「...」；第二行格式为 原因：...",
    "9. 原因必须具体指出风险来源，例如绝对化承诺、诱导交易、具体险种敏感表达、规避审核暗示、收益暗示、资产隔离避债表述、医疗或财税误导等。",
    "10. 整体语气要像专业内容审核顾问，不要写成聊天回复、提纲、教程或营销文案。",
    "11. 不要输出 Markdown 表格，不要使用代码块，不要额外添加花哨结构。",
    "待检查的小红书内容：",
    content,
  ].filter(Boolean).join("\n\n");
}
