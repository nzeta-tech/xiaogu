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
      "先完成语义到视觉的转换，不要只提取名词：识别本章的核心主体、关键动作或变化、主体之间的关系，以及读者最需要看见的结果。",
      "根据内容选择最合适的视觉表达：人物、事件、故事或情绪用纯场景叙事图；方法、流程、分类、对比、数据关系或知识框架用概念解释图或知识提炼图；抽象观点可使用与正文语义直接对应的视觉隐喻。不要固定套用某一种题材或版式。",
      "自行判断是否需要文字：画面本身足以讲清楚时使用纯图片；当短标题、关键词、步骤名、分类名或对比标签能显著提升理解时，可以在图中加入少量文字。文字必须直接提炼或原样取自本章节，准确、简短、易校对，不得编造数据和结论，不放长段正文。",
      "画面必须有一个清楚的视觉中心，并包含 2-3 个来自本章语义的支持细节。读者不看文字，也应能感到这一章的对象、关系或变化，而不只是看见相关装饰物。",
      "只使用正文能够支持的对象、场景、关系和行为；不得凭空补充具体数字、品牌、身份、地点、结论或戏剧性事件。正文没有人物时不强行加入人物，没有具体场景时可用结构化概念插画。",
      "避免静物罗列和图库式万能隐喻，例如无语义依据的握手、拼图、灯泡、箭头、天际线、人物围桌或对着屏幕微笑。除非章节本身需要，不要为排字预留大面积空白。",
      "本图是文章内页配图。它可以是纯图片、编辑插画、图解、信息图或知识卡片，由章节内容决定。允许为了突出主体、组织知识或容纳必要的短文字使用合理留白；不要出现无意义空白、二维码、Logo、水印或与正文无关的装饰文字。",
      "同一篇文章的多张图保持色彩、镜头语言、人物设定和材质一致，但每张图必须有不同的场景与信息任务。",
      `对应章节内容：${section.content.slice(0, 1800)}`,
    ].join("\n\n")),
  };
}
