export type WechatArticleSection = {
  index: number;
  title: string;
  content: string;
};

export function extractWechatArticleSections(article: string, limit = 5): WechatArticleSection[] {
  const normalized = article.replace(/\r/g, "").trim();
  const matches = Array.from(normalized.matchAll(/^##\s+(.+)$/gm));
  if (matches.length > 0) {
    return matches.slice(0, limit).map((match, index) => {
      const start = (match.index ?? 0) + match[0].length;
      const end = matches[index + 1]?.index ?? normalized.length;
      return { index, title: match[1].trim(), content: normalized.slice(start, end).trim() };
    });
  }
  const paragraphs = normalized.split(/\n{2,}/).map((item) => item.replace(/^#\s+/, "").trim()).filter(Boolean);
  const chunkSize = Math.max(1, Math.ceil(paragraphs.length / Math.min(limit, Math.max(1, Math.ceil(paragraphs.length / 3)))));
  const sections: WechatArticleSection[] = [];
  for (let index = 0; index < paragraphs.length && sections.length < limit; index += chunkSize) {
    const content = paragraphs.slice(index, index + chunkSize).join("\n\n");
    sections.push({ index: sections.length, title: sections.length === 0 ? "开篇" : `正文第 ${sections.length + 1} 部分`, content });
  }
  return sections.length ? sections : [{ index: 0, title: "正文", content: normalized }];
}

export function buildWechatSectionImagePrompts(article: string, basePrompt: string, limit = 5) {
  const sections = extractWechatArticleSections(article, limit);
  return {
    sections,
    prompts: sections.map((section, index) => [
      basePrompt,
      `这是正文配图第 ${index + 1} 张，对应章节《${section.title}》。`,
      "只围绕本章节的核心场景、人物关系或关键概念构图，不概括整篇文章，不重复其他章节画面。",
      "画面不放文章标题、长段文字、二维码、Logo、水印或无法校对的中文；重点承担阅读停顿和章节情绪定位。",
      `对应章节内容：${section.content.slice(0, 1800)}`,
    ].join("\n\n")),
  };
}
