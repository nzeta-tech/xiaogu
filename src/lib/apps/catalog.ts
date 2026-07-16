export type CreationCategoryId = "content" | "ip" | "growth";

import { creationExamples } from "./clean-examples";
export { creationExamples };

export type CreationFieldType = "textarea" | "select" | "multiselect" | "radio" | "file" | "text" | "text_or_file";

export type CreationFieldOption = {
  label: string;
  value: string;
  previewUrl?: string;
};

export type CreationField = {
  id: string;
  label: string;
  type: CreationFieldType;
  required?: boolean;
  placeholder?: string;
  helper?: string;
  options?: CreationFieldOption[];
  accept?: string;
  uploadLabel?: string;
  uploadHint?: string;
  multiple?: boolean;
  maxLength?: number;
};

export type CreationApp = {
  id: string;
  slug: string;
  name: string;
  emoji: string;
  category: CreationCategoryId;
  points: number;
  badge?: string;
  featured?: boolean;
  requiresThinking?: boolean;
  description: string;
  promptHint: string;
  resultType: "text" | "image-plan" | "image";
  exampleTitle?: string;
  exampleSummary?: string;
  fields: CreationField[];
};

export type CreationAppFamily =
  | "default"
  | "write-copy"
  | "image-card"
  | "topic-picker"
  | "wechat-images"
  | "xiaohongshu-check"
  | "polish-video"
  | "polish-wechat-article";

export type CreationExample = {
  slug: string;
  appSlug: string;
  title: string;
  summary: string;
  intro: string;
  highlight?: string;
  ctaLabel?: string;
  tabs?: string[];
  linkedExamples?: string[];
  exampleType?: "text" | "image";
  sections: Array<{
    id?: string;
    title: string;
    body: string;
    quote?: string;
  }>;
  outputs?: Array<{
    id?: string;
    title: string;
    tag?: string;
    body: string;
    quote?: string;
    viewMode?: "plain" | "wechat";
    children?: Array<{
      id?: string;
      title: string;
      body: string;
      quote?: string;
    }>;
  }>;
  imageResults?: Array<{
    id?: string;
    title: string;
    imageUrl: string;
    badge?: string;
    ratio?: string;
    prompt?: string;
  }>;
};

export type CreationCategory = {
  id: CreationCategoryId;
  label: string;
  description: string;
};

export const creationCategories: CreationCategory[] = [
  { id: "content", label: "获客内容", description: "文案、图片、引流资料、选题，一站式完成日常获客创作。" },
  { id: "ip", label: "IP成长", description: "定位、破局、风格提纯，让内容更像你，也更容易被记住。" },
  { id: "growth", label: "团队增长", description: "围绕招募、增员、团队展示，生成更有转化力的增长素材。" },
];

export const creationApps: CreationApp[] = [
  {
    id: "write-copy",
    slug: "write-copy",
    name: "写文案",
    emoji: "🎨",
    category: "content",
    points: 5,
    badge: "推荐",
    featured: true,
    description: "把一份真实素材整理成口播、公众号、小红书和朋友圈版本，保留核心观点并适配渠道表达。",
    promptHint: "先提炼用户素材中的事实、观点和表达边界，再按所选渠道分别生成可发布内容。",
    resultType: "text",
    exampleTitle: "保险规划师的人设文案案例",
    exampleSummary: "同一份素材拆成口播稿、朋友圈和公众号三类输出。",
    fields: [
      {
        id: "tone",
        label: "表达倾向",
        type: "radio",
        required: true,
        options: [
          { label: "偏像自己", value: "self" },
          { label: "偏犀利", value: "traffic" },
          { label: "偏温和", value: "trust" },
          { label: "偏素材原味（还原整理）", value: "raw" },
        ],
      },
      {
        id: "source",
        label: "创作素材",
        type: "text_or_file",
        required: true,
        placeholder: "粘贴文章、口播逐字稿、客户问题、产品资料或你想表达的观点。",
        helper: "上传文字资料（txt, docx, pdf），暂不支持图片",
      },
      {
        id: "targets",
        label: "选择生成内容",
        type: "multiselect",
        required: true,
        options: [
          { label: "口播稿x3", value: "video_script" },
          { label: "小红书x2", value: "xiaohongshu" },
          { label: "公众号x2", value: "wechat_article" },
          { label: "朋友圈x3", value: "moments" },
        ],
      },
    ],
  },
  {
    id: "image-card",
    slug: "image-card",
    name: "做图",
    emoji: "🪄",
    category: "content",
    points: 5,
    badge: "图片工具",
    description: "输入图文内容，生成适合获客场景的知识卡片与配图方案。",
    promptHint: "根据内容目标、阅读场景、署名和比例生成原创知识卡片，优先保证中文可读性与信息层级。",
    resultType: "image",
    exampleTitle: "公众号配图案例",
    exampleSummary: "同一篇文章生成 1 张知识卡片配图策划。",
    fields: [
      {
        id: "style",
        label: "图片风格",
        type: "radio",
        required: true,
        options: [
          { label: "手绘插画", value: "illustration", previewUrl: "/examples/image-card-styles/illustration.webp" },
          { label: "白板手写风格", value: "whiteboard", previewUrl: "/examples/image-card-styles/whiteboard.webp" },
          { label: "东方禅意", value: "zen", previewUrl: "/examples/image-card-styles/zen.webp" },
          { label: "手绘线稿插画", value: "line-illustration", previewUrl: "/examples/image-card-styles/line-illustration.webp" },
          { label: "奢侈高端风格", value: "luxury", previewUrl: "/examples/image-card-styles/luxury.webp" },
          { label: "杂志风格", value: "magazine", previewUrl: "/examples/image-card-styles/magazine.webp" },
          { label: "城市涂鸦风格", value: "graffiti", previewUrl: "/examples/image-card-styles/graffiti.webp" },
          { label: "演讲现场风格", value: "event-stage", previewUrl: "/examples/image-card-styles/event-stage.webp" },
          { label: "手写笔记风格", value: "handwritten-notes", previewUrl: "/examples/image-card-styles/handwritten-notes.webp" },
          { label: "立体粘土风格", value: "clay", previewUrl: "/examples/image-card-styles/clay.webp" },
          { label: "极简手绘", value: "minimal-drawing", previewUrl: "/examples/image-card-styles/minimal-drawing.webp" },
          { label: "商务风格", value: "business", previewUrl: "/examples/image-card-styles/business.webp" },
          { label: "黑板报风格", value: "blackboard", previewUrl: "/examples/image-card-styles/blackboard.webp" },
          { label: "扁平知识风格", value: "flat-knowledge", previewUrl: "/examples/image-card-styles/flat-knowledge.webp" },
          { label: "莫兰迪平面风格", value: "morandi", previewUrl: "/examples/image-card-styles/morandi.webp" },
          { label: "科普知识手绘", value: "science-sketch", previewUrl: "/examples/image-card-styles/science-sketch.webp" },
          { label: "深色专业", value: "dark-pro", previewUrl: "/examples/image-card-styles/dark-pro.webp" },
          { label: "清爽简约卡片", value: "fresh-card", previewUrl: "/examples/image-card-styles/fresh-card.webp" },
          { label: "质感日签", value: "daily-sign", previewUrl: "/examples/image-card-styles/daily-sign.webp" },
          { label: "学霸笔记", value: "study", previewUrl: "/examples/image-card-styles/study.webp" },
          { label: "大字版日签", value: "large-sign", previewUrl: "/examples/image-card-styles/large-sign.webp" },
          { label: "黑白调", value: "black-white", previewUrl: "/examples/image-card-styles/black-white.webp" },
          { label: "手账拼贴风", value: "scrapbook", previewUrl: "/examples/image-card-styles/scrapbook.webp" },
          { label: "简洁白橙蓝", value: "white-orange-blue", previewUrl: "/examples/image-card-styles/white-orange-blue.webp" },
          { label: "日报风格", value: "daily", previewUrl: "/examples/image-card-styles/daily.webp" },
          { label: "自定义（自己写提示词）", value: "custom" },
        ],
        helper: "选择一种图片风格",
      },
      {
        id: "source",
        label: "图片内容",
        type: "textarea",
        required: true,
        placeholder: "可粘贴文章、学习录音整理、口播稿、或一个主题等",
      },
      {
        id: "signature",
        label: "如需署名，请输入",
        type: "textarea",
        placeholder: "请输入想在图片上的署名，如:IP名、本人名、xx制作，最多6个字。如不需要，忽略不填",
        helper: "请输入想在图片上的署名，如:IP名、本人名、xx制作，最多6个字。如不需要，忽略不填",
      },
      {
        id: "draw_portrait",
        label: "是否画我的形象",
        type: "radio",
        required: true,
        options: [
          { label: "否，不要画人物形象", value: "no" },
          { label: "是，我已在下方上传形象照", value: "yes" },
        ],
      },
      {
        id: "reference_image",
        label: "上传参考图（可选）",
        type: "file",
        accept: "image/*",
      },
      {
        id: "ratio",
        label: "选择图片比例",
        type: "radio",
        required: true,
        options: [
          { label: "3:4 竖版", value: "3:4" },
          { label: "4:5 竖版", value: "4:5" },
          { label: "2:3 竖版", value: "2:3" },
          { label: "9:16 竖版", value: "9:16" },
          { label: "1:1 方形", value: "1:1" },
          { label: "4:3 横版", value: "4:3" },
          { label: "5:4 横版", value: "5:4" },
          { label: "3:2 横版", value: "3:2" },
          { label: "16:9 横版", value: "16:9" },
        ],
        helper: "请选择生成图片的比例",
      },
    ],
  },
  {
    id: "lead-copy",
    slug: "lead-copy",
    name: "写引流文案",
    emoji: "🌱",
    category: "content",
    points: 5,
    description: "更侧重引流文案的创作：口播稿、小红书笔记、公众号文章，一次搞定。可输入：观点录音、文章、口播稿等。",
    promptHint: "从用户素材提炼可交付价值，分别生成口播、小红书和公众号内容，并设计克制清晰的互动动作。",
    resultType: "text",
    fields: [
      {
        id: "tone",
        label: "表达倾向",
        type: "radio",
        required: true,
        options: [
          { label: "犀利洞察", value: "sharp_insight" },
          { label: "温和共鸣", value: "gentle_empathy" },
          { label: "类比思维", value: "analogy_thinking" },
          { label: "原汁原味（还原整理）", value: "raw_restore" },
        ],
      },
      {
        id: "source",
        label: "创作素材",
        type: "text_or_file",
        required: true,
        placeholder: "输入你的主题、观点等、粘贴要参考的内容，也可上传文件",
        helper: "上传资料（文件暂只支持.txt, .docx, .pdf, .md，大小不超过10MB）",
      },
      {
        id: "targets",
        label: "选择生成内容",
        type: "multiselect",
        required: true,
        options: [
          { label: "口播稿x3", value: "video_batch" },
          { label: "小红书x2", value: "redbook_batch" },
          { label: "公众号x2", value: "wechat_batch" },
        ],
      },
    ],
  },
  {
    id: "traffic-copy",
    slug: "traffic-copy",
    name: "流量文案",
    emoji: "⚡",
    category: "content",
    points: 5,
    badge: "新",
    description: "把热点、事件或观点改写成更有冲突感、代入感和传播力的流量内容。",
    promptHint: "沿用流量文案能力：用反常识钩子明确立场，以事实、迁移逻辑和普通人场景推进，最后给出可执行启发与互动动作。",
    resultType: "text",
    fields: [
      {
        id: "source",
        label: "你的创作素材",
        type: "textarea",
        required: true,
        placeholder: "请粘贴热点事件、行业变化、个人观点或需要改写的原始材料",
      },
    ],
  },
  {
    id: "marketing-copy",
    slug: "marketing-copy",
    name: "营销文案",
    emoji: "📣",
    category: "content",
    points: 5,
    badge: "新",
    description: "围绕客户画像、产品规则和投保难点，生成兼顾专业边界、信任建立与转化承接的营销内容。",
    promptHint: "沿用营销文案能力：分别从产品、方案、案例和观念四个角度展开，同时讲清适用人群、规则边界和具体互动动作。",
    resultType: "text",
    fields: [
      {
        id: "source",
        label: "你的营销素材",
        type: "textarea",
        required: true,
        placeholder: "请粘贴客户画像、产品亮点、方案材料、健康告知或既往症规则等真实信息",
      },
    ],
  },
  {
    id: "lead-package",
    slug: "lead-package",
    name: "【引流资料】制作",
    emoji: "🎁",
    category: "content",
    points: 5,
    description: "输入主题，生成可用于获客的资料包标题、正文、领取话术和发布文案。",
    promptHint: "围绕一个真实问题设计资料定位、目录、交付内容和领取说明，不制造稀缺感或虚假承诺。",
    resultType: "text",
    exampleTitle: "宝妈医疗险资料包案例",
    exampleSummary: "一次给出正文、朋友圈、自媒体选题和留资文案。",
    fields: [
      {
        id: "theme",
        label: "输入资料主题",
        type: "text",
        required: true,
        placeholder: "例如：宝妈家庭医疗险避坑清单、家庭保单体检表。",
      },
      {
        id: "offer",
        label: "设置领取福利",
        type: "text",
        required: true,
        placeholder: "例如：回复「清单」领取 3 分钟医疗险避坑表。",
      },
      {
        id: "audience",
        label: "选择目标人群",
        type: "text",
        required: true,
        placeholder: "例如：30-40 岁有娃家庭、企业主、女性客户。",
      },
    ],
  },
  {
    id: "topic-picker",
    slug: "topic-picker",
    name: "找选题",
    emoji: "✨",
    category: "content",
    points: 5,
    requiresThinking: true,
    description: "结合你的人设画像，批量生成流量、信任、转化三个方向的选题。",
    promptHint: "根据账号定位、目标读者和发布平台，生成覆盖触达、解释与信任目标的选题矩阵。",
    resultType: "text",
    exampleTitle: "6 个高质量选题案例",
    exampleSummary: "同主题拆成流量、信任、转化三种内容任务。",
    fields: [
      {
        id: "special_requirements",
        label: "特殊要求",
        type: "textarea",
        placeholder: "如果没有特殊要求，可不填写，会根据个人定位和风格自动生成（需完成人设问卷）",
      },
    ],
  },
  {
    id: "ip-positioning",
    slug: "ip-positioning",
    name: "IP定位",
    emoji: "🎯",
    category: "ip",
    points: 5,
    requiresThinking: true,
    description: "根据你的思维和业务现状，生成专属 IP 定位、账号标签和内容主线。",
    promptHint: "从人设、客群、差异化、表达风格四个角度给出定位方案，让账号更容易被记住。",
    resultType: "text",
    exampleTitle: "IP 定位方案案例",
    exampleSummary: "从现状、客群和服务标签里抽出更清楚的人设主张。",
    fields: [
      {
        id: "current_state",
        label: "输入当前账号状态",
        type: "textarea",
        required: true,
        placeholder: "描述你现在的账号、客群、服务方向、代表案例和卡点。",
      },
      {
        id: "target_client",
        label: "输入目标客群",
        type: "text",
        required: true,
        placeholder: "例如：高净值家庭、宝妈家庭、企业主、医生群体。",
      },
    ],
  },
  {
    id: "breakthrough",
    slug: "breakthrough",
    name: "陪你破局增长",
    emoji: "🚀",
    category: "ip",
    points: 5,
    description: "把当前卡点拆成问题诊断、破局路径和可执行动作清单。",
    promptHint: "以增长陪跑的方式分析现状：先定位卡点，再给短期动作、内容策略和复盘指标。",
    resultType: "text",
    exampleTitle: "破局增长案例",
    exampleSummary: "针对私信多转化少的账号，给出节奏和动作拆解。",
    fields: [
      {
        id: "source",
        label: "上传攻略 / 粘贴你的情况",
        type: "text_or_file",
        required: true,
        placeholder: "请粘贴你当前的业务背景、最近动作、最卡的环节和已经试过但没跑通的方法，也可以先下载攻略模板填写后再上传。",
        helper: "支持直接粘贴文本，或上传 .txt / .docx / .pdf / .md 文件",
      },
      {
        id: "desired_result",
        label: "你最想先看到什么结果",
        type: "textarea",
        required: true,
        placeholder: "例如：先把私信承接跑顺、每周稳定发 3 条内容、让成交动作更可复盘。",
      },
    ],
  },
  {
    id: "team-recruit",
    slug: "team-recruit",
    name: "招募文案",
    emoji: "🤝",
    category: "growth",
    points: 5,
    description: "生成团队招募文案、朋友圈、海报标题和私信沟通话术。",
    promptHint: "围绕团队优势、适合人群、成长路径和加入理由，写出可信的招募内容。",
    resultType: "text",
    exampleTitle: "团队招募案例",
    exampleSummary: "从训练体系和陪跑支持切进，写成更可信的招募文案。",
    fields: [
      {
        id: "team_offer",
        label: "输入团队亮点",
        type: "textarea",
        required: true,
        placeholder: "例如培训体系、陪跑支持、客户资源、主打赛道、团队氛围。",
      },
      {
        id: "candidate",
        label: "输入招募对象",
        type: "text",
        required: true,
        placeholder: "例如想转型的宝妈、银行离职顾问、销售新人、自由职业者。",
      },
    ],
  },
  {
    id: "live-script",
    slug: "live-script",
    name: "写直播稿",
    emoji: "🎬",
    category: "content",
    points: 5,
    description: "按引导说情况，拿走你的专属直播稿：从直播经验、主题、客群到产品卖点和人设内容，一次整理成更完整的直播流程脚本。",
    promptHint: "适合按直播实战思路整理脚本。请围绕直播经验、主题、目标客群、讲述框架、误区观点、案例、转化目标、产品卖点和个人人设，输出可直接开讲的直播流程稿。",
    resultType: "text",
    exampleTitle: "直播流程稿案例",
    exampleSummary: "从开场钩子、问题拆解到收口转化，展示一版更完整的直播脚本案例。",
    fields: [
      {
        id: "experience_level",
        label: "做过直播吗",
        type: "radio",
        required: true,
        options: [
          { label: "没做过", value: "never" },
          { label: "做过，效果一般", value: "average" },
          { label: "做过，还可以", value: "good" },
        ],
      },
      {
        id: "theme",
        label: "这次直播讲什么主题",
        type: "text",
        required: true,
        placeholder: "越具体越好，例如：孩子医疗险怎么买更稳、普通家庭怎么买重疾险更不踩坑。",
      },
      {
        id: "audience",
        label: "目标客群",
        type: "textarea",
        required: true,
        placeholder: "请写年龄、性别、生活状态、认知水平、当前困扰等，越具体越好。",
      },
      {
        id: "live_style",
        label: "是否有自己的直播特点或框架",
        type: "textarea",
        placeholder: "例如喜欢先讲故事再拆观点、偏问答式、节奏快、喜欢举客户案例。",
      },
      {
        id: "core_points",
        label: "直播核心观点 / 常见误区 / 盲区 / 想解答的问题",
        type: "textarea",
        required: true,
        placeholder: "把这场直播一定要讲透的观点、误区、盲区和高频问题写出来。",
      },
      {
        id: "case_material",
        label: "是否有真实案例",
        type: "textarea",
        placeholder: "有就尽量写清楚；如果没有，直接写“没有案例”。",
      },
      {
        id: "goal",
        label: "希望观众最终做什么",
        type: "radio",
        required: true,
        options: [
          { label: "买课", value: "course" },
          { label: "咨询", value: "consult" },
          { label: "先建立认知", value: "awareness" },
        ],
      },
      {
        id: "focus_mode",
        label: "这场直播重点讲什么",
        type: "radio",
        required: true,
        options: [
          { label: "重点讲理念", value: "concept" },
          { label: "重点讲产品", value: "product" },
          { label: "理念 + 产品混合", value: "mixed" },
        ],
      },
      {
        id: "product_points",
        label: "产品卖点 / 产品案例",
        type: "textarea",
        placeholder: "如果会涉及产品，请把卖点、适合人群、常见异议、真实案例尽量写详细。",
      },
      {
        id: "persona_points",
        label: "直播里可以说的人设内容",
        type: "textarea",
        placeholder: "例如从业时间、服务客户数、累计保费、个人优势、荣誉、经历等。",
      },
    ],
  },
  {
    id: "general-content",
    slug: "general-content",
    name: "泛内容创作",
    emoji: "📝",
    category: "content",
    points: 5,
    description: "把输入的内容，变成更有共鸣、容易破圈的口播文案+公众号文章。",
    promptHint: "更适合普通观点、分享型素材和非强销售内容。",
    resultType: "text",
    exampleTitle: "泛内容创作案例",
    exampleSummary: "把普通观点改写成更有共鸣、更适合破圈传播的文案。",
    fields: [
      {
        id: "source",
        label: "请输入你要创作的内容",
        type: "textarea",
        required: true,
        placeholder: "请输入你要创作的内容，智能体会帮你生成更有流量的泛选题+文案",
      },
      {
        id: "targets",
        label: "生成类型",
        type: "multiselect",
        required: true,
        options: [
          { label: "口播稿x2", value: "video_script" },
          { label: "公众号x2", value: "wechat_article" },
        ],
      },
    ],
  },
  {
    id: "wechat-images",
    slug: "wechat-images",
    name: "公众号配图",
    emoji: "🖼️",
    category: "content",
    points: 5,
    description: "输入公众号文稿并选择通用视觉风格，生成适配章节节奏的多张配图。",
    promptHint: "更强调公众号阅读场景、段落节奏和多张配图输出。",
    resultType: "image",
    exampleTitle: "公众号配图案例",
    exampleSummary: "围绕公众号文章内容生成更适合段落阅读节奏的配图方案。",
    fields: [
      {
        id: "style",
        label: "图片风格",
        type: "radio",
        required: true,
        helper: "选择一种图片风格",
        options: [
          { label: "自然纪实", value: "documentary", previewUrl: "/examples/image-card-styles/business.webp" },
          { label: "城市风景", value: "landscape", previewUrl: "/examples/image-card-styles/magazine.webp" },
          { label: "几何抽象", value: "abstract", previewUrl: "/examples/image-card-styles/flat-knowledge.webp" },
          { label: "温暖手绘", value: "warm-drawing", previewUrl: "/examples/image-card-styles/illustration.webp" },
          { label: "电影光影", value: "cinematic-light", previewUrl: "/examples/image-card-styles/dark-pro.webp" },
          { label: "东方线描", value: "eastern-line", previewUrl: "/examples/image-card-styles/line-illustration.webp" },
          { label: "简笔叙事", value: "simple-story", previewUrl: "/examples/image-card-styles/minimal-drawing.webp" },
          { label: "松弛速写", value: "loose-sketch", previewUrl: "/examples/image-card-styles/science-sketch.webp" },
          { label: "童趣拼贴", value: "playful-collage", previewUrl: "/examples/image-card-styles/scrapbook.webp" },
          { label: "厚涂质感", value: "painted", previewUrl: "/examples/image-card-styles/luxury.webp" },
          { label: "水彩晕染", value: "watercolor", previewUrl: "/examples/image-card-styles/morandi.webp" },
          { label: "彩铅手绘", value: "colored-pencil", previewUrl: "/examples/image-card-styles/handwritten-notes.webp" },
          { label: "细线插画", value: "fine-line", previewUrl: "/examples/image-card-styles/whiteboard.webp" },
          { label: "水墨留白", value: "ink", previewUrl: "/examples/image-card-styles/zen.webp" },
          { label: "纸张绘本", value: "paper-story", previewUrl: "/examples/image-card-styles/study.webp" },
          { label: "城市细节", value: "city-detail", previewUrl: "/examples/image-card-styles/daily.webp" },
          { label: "安静戏剧感", value: "quiet-drama", previewUrl: "/examples/image-card-styles/black-white.webp" },
          { label: "黄昏街景", value: "city-sunset", previewUrl: "/examples/image-card-styles/event-stage.webp" },
          { label: "柔和治愈", value: "soft-healing", previewUrl: "/examples/image-card-styles/fresh-card.webp" },
          { label: "复古印刷", value: "retro-print", previewUrl: "/examples/image-card-styles/daily-sign.webp" },
          { label: "明快插画", value: "vivid-illustration", previewUrl: "/examples/image-card-styles/graffiti.webp" },
        ],
      },
      {
        id: "article",
        label: "文章内容",
        type: "text_or_file",
        required: true,
        placeholder: "请粘贴完整文章或核心段落内容",
        helper: "上传您的资料文件(txt/docx/pdf格式)",
      },
    ],
  },
  {
    id: "video-script-polish",
    slug: "video-script-polish",
    name: "口播文案精修",
    emoji: "🔮",
    category: "content",
    points: 5,
    badge: "推荐",
    description: "逐段检查口播稿的逻辑、信息密度和口语节奏，并给出有依据的精修版本。",
    promptHint: "适合已经有口播底稿时，直接贴入原稿并拿到更详细的改稿建议与精修版文案。",
    resultType: "text",
    fields: [
      {
        id: "draft",
        label: "你的口播文案",
        type: "textarea",
        required: true,
        placeholder: "请直接粘贴你准备用的口播文案，我帮你升级它！",
      },
    ],
  },
  {
    id: "letter",
    slug: "letter",
    name: "走心一封信",
    emoji: "📝",
    category: "content",
    points: 5,
    description: "根据你的思维与风格，生成一篇符合你调性的信，在纪念和特别节点把情绪价值拉满。",
    promptHint: "适合围绕一个主题、背景和情感诉求，生成一篇更适合公众号场景发布的走心长信。",
    resultType: "text",
    fields: [
      {
        id: "theme",
        label: "主题",
        type: "textarea",
        required: true,
        placeholder: "您想写的一封信的主题、背景信息、大体要求。可直接语音口述转文字，复制进来",
        helper: "文字数至少：50字",
      },
      {
        id: "targets",
        label: "生成类型",
        type: "multiselect",
        required: true,
        options: [{ label: "公众号", value: "wechat_article" }],
      },
    ],
  },
  {
    id: "xiaohongshu-check",
    slug: "xiaohongshu-check",
    name: "小红书违规检测",
    emoji: "🧐",
    category: "content",
    points: 5,
    description: "检查小红书文案的潜在违规点，并给改写建议。",
    promptHint: "更偏审核和修改建议，不是重新从零创作。",
    resultType: "text",
    fields: [
      { id: "content", label: "小红书内容", type: "textarea", required: true, placeholder: "粘贴准备发的小红书文案。" },
    ],
  },
  {
    id: "policy-diagnosis",
    slug: "policy-diagnosis",
    name: "保单架构诊断",
    emoji: "🛡️",
    category: "content",
    points: 5,
    badge: "新！工具",
    description: "帮你先从结构上识别保单的利益风险和配置缺口。",
    promptHint: "根据保单信息输出结构诊断、风险提醒和优化建议。",
    resultType: "text",
    fields: [
      {
        id: "household_stage",
        label: "家庭阶段",
        type: "radio",
        required: true,
        options: [
          { label: "单身 / 刚组建家庭", value: "early-family" },
          { label: "已婚有娃", value: "parenting" },
          { label: "三明治家庭 / 上有老下有小", value: "sandwich" },
          { label: "临近退休 / 养老规划中", value: "retirement" },
        ],
      },
      {
        id: "diagnosis_goal",
        label: "这次最想优先诊断什么",
        type: "multiselect",
        required: true,
        options: [
          { label: "家庭保障缺口", value: "gap" },
          { label: "重疾 / 医疗责任是否重复", value: "duplicate" },
          { label: "保费压力和缴费年限", value: "premium-pressure" },
          { label: "利益风险和现金流隐患", value: "risk" },
        ],
      },
      {
        id: "insured_overview",
        label: "家庭成员与当前保障概况",
        type: "textarea",
        required: true,
        placeholder: "例如：夫妻 32/30 岁，两个孩子 6 岁/2 岁；大人已有重疾、医疗、寿险，孩子目前只有居民医保。",
      },
      {
        id: "policy_info",
        label: "保单信息",
        type: "text_or_file",
        required: true,
        placeholder: "请尽量按成员整理：险种、保额、保费、缴费年限、保障期限、是否附加医疗/豁免等。也可直接粘贴保单摘要或上传文本资料。",
        helper: "如果有多份保单，建议按“投保人 / 被保人 / 险种 / 保额 / 年缴保费”分行整理，诊断会更准。",
      },
      {
        id: "concerns",
        label: "想特别提醒系统关注的风险点（可选）",
        type: "textarea",
        placeholder: "例如：担心孩子重疾不够、夫妻寿险缺口、某份年金是否拖累现金流、医疗险是否断档。",
      },
    ],
  },
  {
    id: "wechat-article-polish",
    slug: "wechat-article-polish",
    name: "公众号文章精修",
    emoji: "🖊️",
    category: "content",
    points: 5,
    description: "在不改变事实和立场的前提下，优化公众号文章的标题、结构、段落和结尾。",
    promptHint: "适合已有成稿的公众号内容做升级，保留原意但显著优化读感。",
    resultType: "text",
    fields: [
      {
        id: "article",
        label: "你的公众号文章",
        type: "textarea",
        required: true,
        placeholder: "请直接粘贴你准备用的文章，也再开头说些你的想法，我帮你升级它！",
      },
      {
        id: "target",
        label: "生成类型",
        type: "multiselect",
        required: true,
        options: [{ label: "公众号", value: "wechat_article" }],
      },
    ],
  },
];

export function getCreationCategory(categoryId: CreationCategoryId) {
  return creationCategories.find((category) => category.id === categoryId) ?? creationCategories[0];
}

export function getCreationAppBySlug(slug: string) {
  return creationApps.find((app) => app.slug === slug) ?? null;
}

export function getCreationExampleBySlug(slug: string) {
  return creationExamples.find((example) => example.slug === slug) ?? null;
}

export function listCreationAppsByCategory(categoryId: CreationCategoryId) {
  return creationApps.filter((app) => app.category === categoryId);
}

export function getCreationAppFamily(appSlug: string): CreationAppFamily {
  if (appSlug === "write-copy") return "write-copy";
  if (appSlug === "image-card") return "image-card";
  if (appSlug === "topic-picker") return "topic-picker";
  if (appSlug === "wechat-images") return "wechat-images";
  if (appSlug === "xiaohongshu-check") return "xiaohongshu-check";
  if (appSlug === "video-script-polish") return "polish-video";
  if (appSlug === "wechat-article-polish") return "polish-wechat-article";
  return "default";
}

export function getCreationExampleForApp(appSlug: string, exampleTitle?: string) {
  if (exampleTitle) {
    const exactMatch = creationExamples.find((item) => item.appSlug === appSlug && item.title === exampleTitle);
    if (exactMatch) return exactMatch;
  }
  return creationExamples.find((item) => item.appSlug === appSlug) ?? null;
}

export function hasCreationExample(appSlug: string, exampleTitle?: string) {
  return Boolean(getCreationExampleForApp(appSlug, exampleTitle));
}
