export type ImageDeliverablePlan = {
  expectedCount: number;
  variantPrompts: string[];
  sourceItems: string[];
  source: "explicit-items" | "explicit-count" | "default";
};

export function buildImageDeliverablePlan(sourceText: string, basePrompt: string): ImageDeliverablePlan {
  const source = sourceText.trim();
  const explicitItems = extractExplicitItems(source);
  const items = (explicitItems.length > 1 ? explicitItems : extractHeadingItems(source)).slice(0, 4);
  if (items.length > 1) {
    return {
      expectedCount: items.length,
      source: "explicit-items",
      sourceItems: items,
      variantPrompts: items.map((item, index) => {
        const isolatedPrompt = source && basePrompt.includes(source) ? basePrompt.replace(source, item) : basePrompt;
        return `${isolatedPrompt}\n\n【本张图片的唯一内容任务】\n这是第 ${index + 1} 张独立图片。只呈现下面这个主题，不得与其他主题合并：\n${item}\n\n必须返回一张可以独立发布的完整图片。`;
      }),
    };
  }
  const explicitCount = inferImageCount(source);
  if (explicitCount > 1) {
    return {
      expectedCount: explicitCount,
      source: "explicit-count",
      sourceItems: [],
      variantPrompts: Array.from({ length: explicitCount }, (_, index) => `${basePrompt}\n\n【独立交付要求】\n这是用户要求的第 ${index + 1}/${explicitCount} 张图片。必须与其他图片构成独立交付，不得把 ${explicitCount} 个交付合并成一张拼图。`),
    };
  }
  return { expectedCount: 1, variantPrompts: [], sourceItems: [], source: "default" };
}

export function assertImageDeliverablesComplete(expectedCount: number, actualCount: number) {
  if (actualCount >= expectedCount) return;
  throw new Error(`图片交付不完整：用户要求 ${expectedCount} 张，实际只生成 ${actualCount} 张，请重试缺失图片。`);
}

function extractExplicitItems(source: string) {
  const marker = /(?:卡片|图片|知识图|主题|案例|例子|文案)\s*([1-4一二三四])\s*(?:主题)?\s*[：:]/g;
  const matches = [...source.matchAll(marker)];
  if (matches.length < 2) return [];
  return matches.map((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? source.length;
    return source.slice(start, end)
      .split(/\n\s*【(?:已取得|最近相关对话|用户补充资料|当前工作流)/, 1)[0]
      .replace(/两张均使用[\s\S]*$/u, "")
      .trim()
      .slice(0, 6000);
  }).filter(item => item.length >= 8);
}

/** Preserve independent application outputs when a downstream image tool
 * receives them as markdown sections. This is the text equivalent of keeping
 * tool-call/result pairs intact: each source section becomes one image task. */
function extractHeadingItems(source: string) {
  const matches = [...source.matchAll(/^##\s+(.+?)\s*$/gm)];
  if (matches.length < 2) return [];
  return matches.map((match, index) => {
    const start = match.index ?? 0;
    const end = matches[index + 1]?.index ?? source.length;
    return source.slice(start, end)
      .split(/\n\s*【(?:用户本次要求|应用执行目标|当前工作流|最近相关对话)/, 1)[0]
      .trim()
      .slice(0, 9000);
  }).filter(item => item.length >= 20);
}

function inferImageCount(source: string) {
  const explicit = source.match(/(?:生成|制作|做|出|需要|要求)?\s*([一二两三四1-4])\s*张(?:知识)?(?:图片|卡片|图)/)?.[1];
  if (explicit) return toCount(explicit);
  if (/(?:两个|两篇|这两|以上两)[\s\S]{0,20}(?:分别|各自)|(?:分别|各自)[\s\S]{0,20}(?:一张|制作|生成|做)/.test(source)) return 2;
  return 1;
}

function toCount(value: string) {
  return ({ 一: 1, 二: 2, 两: 2, 三: 3, 四: 4 } as Record<string, number>)[value] ?? Number(value);
}
