export type DigitalHumanSceneReference = {
  id: string;
  name: string;
  originalName: string;
  category: string;
  aspectRatio: "9:16" | "16:9";
  image: string;
  tags: string[];
  kind: "composition" | "visual-style";
  providerStyleId?: string;
};

export const digitalHumanBackgroundScenes = [
  { id: "#F5F2EC", name: "专业办公室", category: "商务", image: "/digital-human-scenes/professional-office.jpg" },
  { id: "#0F2740", name: "财经演播室", category: "专业", image: "/digital-human-scenes/news-studio.jpg" },
  { id: "#4A3328", name: "书房讲堂", category: "知识", image: "/digital-human-scenes/library-study.jpg" },
  { id: "#D6B38A", name: "温馨客厅", category: "生活", image: "/digital-human-scenes/warm-living-room.jpg" },
  { id: "#1A2630", name: "播客直播间", category: "内容", image: "/digital-human-scenes/podcast-studio.jpg" },
  { id: "#DDE8EF", name: "城市落地窗", category: "高端", image: "/digital-human-scenes/city-window.jpg" },
  { id: "#0F766E", name: "品牌发布厅", category: "发布", image: "/digital-human-scenes/brand-stage.jpg" },
  { id: "#D9C2A2", name: "极简咨询室", category: "亲和", image: "/digital-human-scenes/minimal-consulting.jpg" },
] as const;

// Curated from the locally archived official catalogs. Provider identity stays
// internal so the creator-facing workflow remains portable across channels.
export const digitalHumanSceneReferences: DigitalHumanSceneReference[] = [
  { id: "composition-office-seated", name: "专业办公室·坐姿", originalName: "雅珊-商务", category: "办公室", aspectRatio: "9:16", image: "/digital-human-research/compositions/office-seated.png", tags: ["AI实景", "休闲", "坐姿"], kind: "composition" },
  { id: "composition-office-standing", name: "商务办公室·站姿", originalName: "文清-商务", category: "办公室", aspectRatio: "9:16", image: "/digital-human-research/compositions/office-standing.png", tags: ["AI实景", "商务", "站姿"], kind: "composition" },
  { id: "composition-study-professional", name: "专业书房", originalName: "浩康-商务", category: "书房", aspectRatio: "9:16", image: "/digital-human-research/compositions/study-professional.png", tags: ["法律", "商务", "坐姿"], kind: "composition" },
  { id: "composition-living-room", name: "生活客厅", originalName: "晓菲-休闲", category: "客厅", aspectRatio: "9:16", image: "/digital-human-research/compositions/living-room.png", tags: ["AI实景", "生活", "坐姿"], kind: "composition" },
  { id: "composition-cafe", name: "商务咖啡厅", originalName: "浩庭-商务", category: "咖啡厅", aspectRatio: "9:16", image: "/digital-human-research/compositions/cafe.png", tags: ["AI实景", "商务", "坐姿"], kind: "composition" },
  { id: "composition-insurance-stage", name: "保险演讲", originalName: "张蕾-演讲", category: "金融保险", aspectRatio: "9:16", image: "/digital-human-research/compositions/insurance-stage.png", tags: ["演讲", "商务", "站姿"], kind: "composition" },
  { id: "composition-insurance-consulting", name: "保险咨询", originalName: "晓蕾-休闲", category: "金融保险", aspectRatio: "9:16", image: "/digital-human-research/compositions/insurance-consulting.png", tags: ["顾问", "AI实景", "坐姿"], kind: "composition" },
  { id: "composition-study-casual", name: "亲和书房", originalName: "文华-休闲", category: "书房", aspectRatio: "9:16", image: "/digital-human-research/compositions/study-casual.png", tags: ["AI实景", "休闲", "坐姿"], kind: "composition" },
  { id: "style-minimalism", providerStyleId: "f26aa6ac4cb045eaabf7ea254f5d807e", name: "极简叙事", originalName: "Minimalism", category: "极简", aspectRatio: "16:9", image: "/digital-human-research/styles/minimalism.jpg", tags: ["留白", "现代"], kind: "visual-style" },
  { id: "style-simple-text", providerStyleId: "a75448dac9bb4875be6cdd750d6e8973", name: "简洁字幕", originalName: "Simple Text", category: "极简", aspectRatio: "16:9", image: "/digital-human-research/styles/simple-text.jpg", tags: ["字幕", "信息表达"], kind: "visual-style" },
  { id: "style-finance-terminal", providerStyleId: "4c3951ed25ec4e80a8f9385b442b40fc", name: "财经终端", originalName: "Bloomberg", category: "财经", aspectRatio: "16:9", image: "/digital-human-research/styles/finance-terminal.jpg", tags: ["数据", "复古科技"], kind: "visual-style" },
  { id: "style-economist", providerStyleId: "e7f9a12679ec426099db7646b70a4639", name: "财经杂志", originalName: "Economist", category: "杂志", aspectRatio: "9:16", image: "/digital-human-research/styles/economist.jpg", tags: ["印刷", "观点"], kind: "visual-style" },
  { id: "style-journal", providerStyleId: "a7d2cc8d4f114a0f9c625ff33a9c495b", name: "手账笔记", originalName: "Journal", category: "知识", aspectRatio: "9:16", image: "/digital-human-research/styles/journal.png", tags: ["手作", "亲和"], kind: "visual-style" },
  { id: "style-presentation", providerStyleId: "b8b5947dc4a74fa8a9eeb69120284328", name: "商务演示", originalName: "PowerPoint", category: "商务", aspectRatio: "16:9", image: "/digital-human-research/styles/presentation.jpg", tags: ["演示文稿", "复古科技"], kind: "visual-style" },
  { id: "style-watercolor", providerStyleId: "d0b90e8bc9f94817b48a1c884527ca86", name: "水彩故事", originalName: "Watercolor", category: "手绘", aspectRatio: "16:9", image: "/digital-human-research/styles/watercolor.jpg", tags: ["手作", "柔和"], kind: "visual-style" },
  { id: "style-film-noir", providerStyleId: "0d03454b528141999c6a47e120d7cdd7", name: "黑白电影", originalName: "Film Noir", category: "电影", aspectRatio: "9:16", image: "/digital-human-research/styles/film-noir.jpg", tags: ["电影感", "黑白"], kind: "visual-style" },
  { id: "style-polaroid", providerStyleId: "4602f137a7204b86a4f36b2848858118", name: "拍立得记录", originalName: "Polaroid", category: "生活", aspectRatio: "9:16", image: "/digital-human-research/styles/polaroid.jpg", tags: ["电影感", "复古"], kind: "visual-style" },
  { id: "style-blueprint", providerStyleId: "4c9025a3b9734c6ea6c122fc00e04767", name: "蓝图解析", originalName: "Blueprint", category: "知识", aspectRatio: "16:9", image: "/digital-human-research/styles/blueprint.jpg", tags: ["手作", "结构化"], kind: "visual-style" },
  { id: "style-newspaper", providerStyleId: "41dbccc16bc24f329ce1c28e62316389", name: "新闻报刊", originalName: "Newspaper", category: "新闻", aspectRatio: "16:9", image: "/digital-human-research/styles/newspaper.jpg", tags: ["印刷", "资讯"], kind: "visual-style" },
  { id: "style-pop-comic", providerStyleId: "053e05957d6841da9c773c581c84948e", name: "流行漫画", originalName: "Pop Comic", category: "潮流", aspectRatio: "16:9", image: "/digital-human-research/styles/pop-comic.jpg", tags: ["流行文化", "高对比"], kind: "visual-style" },
];
