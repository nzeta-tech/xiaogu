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
  { id: "content", label: "获客内容", description: "完成文案、图片、资料和选题等日常内容任务。" },
  { id: "ip", label: "IP成长", description: "梳理账号定位、表达风格和当前增长问题。" },
  { id: "growth", label: "团队增长", description: "准备招募、面谈和候选人跟进内容。" },
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
    description: "把一份真实素材改写成适合口播、小红书、公众号和朋友圈发布的不同版本。",
    promptHint: "先提炼用户素材中的事实、观点和表达边界，再按所选渠道分别生成可发布内容。",
    resultType: "text",
    exampleTitle: "保险规划师的人设文案案例",
    exampleSummary: "同一份素材拆成口播稿、朋友圈和公众号三类输出。",
    fields: [
      {
        id: "tone",
        label: "这次想怎么表达",
        type: "radio",
        required: true,
        options: [
          { label: "自然真实", value: "self" },
          { label: "观点鲜明", value: "traffic" },
          { label: "温和共情", value: "trust" },
          { label: "尽量保留原话", value: "raw" },
        ],
      },
      {
        id: "source",
        label: "粘贴你的原始素材",
        type: "text_or_file",
        required: true,
        placeholder: "例如：一段口播逐字稿、客户常问的问题、产品资料，或你对一件事的完整看法。素材越完整，改写越准确。",
        helper: "可上传 TXT、DOCX、PDF 或 Markdown 文件，单个文件不超过 10MB。",
      },
      {
        id: "targets",
        label: "选择要生成的渠道",
        type: "multiselect",
        required: true,
        options: [
          { label: "口播稿（3篇）", value: "video_script" },
          { label: "小红书（2篇）", value: "xiaohongshu" },
          { label: "公众号（2篇）", value: "wechat_article" },
          { label: "朋友圈（3篇）", value: "moments" },
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
    description: "把文章、口播稿或一个明确主题做成适合发布的知识卡片。",
    promptHint: "根据内容目标、阅读场景、署名和比例生成原创知识卡片，优先保证中文可读性与信息层级。",
    resultType: "image",
    exampleTitle: "公众号配图案例",
    exampleSummary: "同一篇文章生成 1 张知识卡片配图策划。",
    fields: [
      {
        id: "style",
        label: "选择视觉风格",
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
        helper: "选择最接近你账号现有视觉的一种风格。",
      },
      {
        id: "source",
        label: "填写卡片内容",
        type: "textarea",
        required: true,
        placeholder: "粘贴文章、口播稿或要做成卡片的核心观点。请尽量提供完整句子，不要只写一个词。",
      },
      {
        id: "signature",
        label: "卡片署名（可选）",
        type: "textarea",
        placeholder: "例如：林顾问、安心家庭说",
        helper: "最多 6 个字；不需要署名可以留空。",
      },
      {
        id: "draw_portrait",
        label: "是否加入人物形象",
        type: "radio",
        required: true,
        options: [
          { label: "不需要人物", value: "no" },
          { label: "使用我上传的形象照", value: "yes" },
        ],
      },
      {
        id: "reference_image",
        label: "上传形象照或参考图（可选）",
        type: "file",
        accept: "image/*",
      },
      {
        id: "ratio",
        label: "选择发布尺寸",
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
        helper: "小红书常用 3:4 或 4:5，朋友圈常用 1:1，视频封面常用 9:16。",
      },
    ],
  },
  {
    id: "policy-renewal-card",
    slug: "policy-renewal-card",
    name: "保单续保提醒卡",
    emoji: "🗓️",
    category: "content",
    points: 5,
    badge: "服务工具",
    description: "把续保日期、保费和顾问信息做成文字准确、可直接发送给客户的提醒图片。",
    promptHint: "客户与保单数据只参与服务端精确排版，不发送给图片模型；保单状态以保险公司通知和合同约定为准。",
    resultType: "image",
    fields: [
      {
        id: "style",
        label: "主视觉偏好",
        type: "radio",
        required: true,
        options: [
          { label: "手写服务单", value: "renewal-handwritten", previewUrl: "/examples/image-card-styles/handwritten-notes.webp" },
          { label: "温暖顾问版", value: "renewal-warm", previewUrl: "/examples/image-card-styles/illustration.webp" },
          { label: "简洁商务版", value: "renewal-business", previewUrl: "/examples/image-card-styles/business.webp" },
        ],
        helper: "每次同时生成两套版式，方便按客户关系选择。",
      },
      { id: "customer_salutation", label: "客户称呼", type: "text", required: true, maxLength: 24, placeholder: "例如：亲爱的牟女士" },
      { id: "insurer", label: "保险公司", type: "text", required: true, maxLength: 30, placeholder: "例如：永明金融" },
      { id: "product_name", label: "产品名称", type: "text", required: true, maxLength: 34, placeholder: "例如：万年青 Q 保单" },
      {
        id: "policy_number",
        label: "保单号",
        type: "text",
        required: true,
        maxLength: 30,
        placeholder: "例如：H6888888",
        helper: "默认仅在图片中展示脱敏号码。",
      },
      { id: "renewal_date", label: "续费日期", type: "text", required: true, maxLength: 28, placeholder: "例如：2026年6月6日" },
      { id: "premium_amount", label: "本期保费", type: "text", required: true, maxLength: 20, placeholder: "例如：5万" },
      {
        id: "currency",
        label: "币种",
        type: "select",
        required: true,
        options: [
          { label: "人民币", value: "人民币" },
          { label: "美元", value: "美元" },
          { label: "港币", value: "港币" },
          { label: "新加坡元", value: "新加坡元" },
        ],
      },
      {
        id: "privacy_mode",
        label: "保单号展示方式",
        type: "radio",
        required: true,
        options: [
          { label: "自动脱敏（推荐）", value: "masked" },
          { label: "显示完整号码", value: "full" },
        ],
      },
      { id: "advisor_name", label: "顾问姓名", type: "text", required: true, maxLength: 18, placeholder: "例如：新小湾" },
      { id: "advisor_company", label: "公司或团队（可选）", type: "text", maxLength: 28, placeholder: "例如：新湾国际" },
      {
        id: "contact_text",
        label: "联系提示",
        type: "textarea",
        maxLength: 80,
        placeholder: "例如：如需协助了解续费流程，请随时联系我。",
      },
      {
        id: "reference_image",
        label: "临时上传顾问形象照（可选）",
        type: "file",
        accept: "image/jpeg,image/png,image/webp",
        helper: "优先使用数字分身形象库；临时照片仅用于本次本地合成，客户与保单信息不会发送给图片模型。",
      },
      {
        id: "portrait_treatment",
        label: "头像处理方式",
        type: "radio",
        required: true,
        options: [
          { label: "柔和手绘感", value: "soft-illustration" },
          { label: "保留清晰原照", value: "original" },
        ],
      },
      {
        id: "ratio",
        label: "图片尺寸",
        type: "radio",
        required: true,
        options: [
          { label: "3:4 竖版", value: "3:4" },
          { label: "1:1 方形", value: "1:1" },
        ],
      },
      {
        id: "confirmation",
        label: "信息确认",
        type: "radio",
        required: true,
        options: [{ label: "我已核对日期、金额、币种和保单号", value: "confirmed" }],
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
    description: "围绕一个真实问题或观点，生成能自然承接咨询的口播、小红书和公众号内容。",
    promptHint: "从用户素材提炼可交付价值，分别生成口播、小红书和公众号内容，并设计克制清晰的互动动作。",
    resultType: "text",
    fields: [
      {
        id: "tone",
        label: "这次想怎么表达",
        type: "radio",
        required: true,
        options: [
          { label: "观点鲜明", value: "sharp_insight" },
          { label: "温和共情", value: "gentle_empathy" },
          { label: "多用类比", value: "analogy_thinking" },
          { label: "尽量保留原话", value: "raw_restore" },
        ],
      },
      {
        id: "source",
        label: "粘贴你的原始素材",
        type: "text_or_file",
        required: true,
        placeholder: "写清客户遇到的问题、你的判断和希望读者采取的下一步，也可以粘贴参考文章或口播稿。",
        helper: "可上传 TXT、DOCX、PDF 或 Markdown 文件，单个文件不超过 10MB。",
      },
      {
        id: "targets",
        label: "选择要生成的渠道",
        type: "multiselect",
        required: true,
        options: [
          { label: "口播稿（3篇）", value: "video_batch" },
          { label: "小红书（2篇）", value: "redbook_batch" },
          { label: "公众号（2篇）", value: "wechat_batch" },
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
    description: "把热点、事件或观点整理成开头抓人、逻辑清楚且事实边界明确的传播型内容。",
    promptHint: "沿用流量文案能力：用反常识钩子明确立场，以事实、迁移逻辑和普通人场景推进，最后给出可执行启发与互动动作。",
    resultType: "text",
    fields: [
      {
        id: "source",
        label: "热点素材和你的观点",
        type: "textarea",
        required: true,
        placeholder: "请写清：发生了什么、信息来源、你怎么看，以及它和目标客户有什么关系。",
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
    description: "根据真实客户问题和产品规则，生成讲产品、讲方案、讲案例和讲观念的营销内容。",
    promptHint: "沿用营销文案能力：分别从产品、方案、案例和观念四个角度展开，同时讲清适用人群、规则边界和具体互动动作。",
    resultType: "text",
    fields: [
      {
        id: "source",
        label: "客户与产品资料",
        type: "textarea",
        required: true,
        placeholder: "请提供目标客户、真实需求、产品亮点、适用条件和不能省略的规则边界。信息不足的部分会标为待确认。",
      },
    ],
  },
  {
    id: "lead-package",
    slug: "lead-package",
    name: "制作引流资料",
    emoji: "🎁",
    category: "content",
    points: 5,
    description: "围绕一个具体问题，制作可领取的资料正文，并配好领取和发布话术。",
    promptHint: "围绕一个真实问题设计资料定位、目录、交付内容和领取说明，不制造稀缺感或虚假承诺。",
    resultType: "text",
    exampleTitle: "宝妈医疗险资料包案例",
    exampleSummary: "一次给出正文、朋友圈、自媒体选题和留资文案。",
    fields: [
      {
        id: "theme",
        label: "资料要解决什么问题",
        type: "text",
        required: true,
        placeholder: "例如：宝妈家庭医疗险避坑清单、家庭保单体检表。",
      },
      {
        id: "offer",
        label: "用户为什么愿意领取",
        type: "text",
        required: true,
        placeholder: "例如：回复「清单」领取 3 分钟医疗险避坑表。",
      },
      {
        id: "audience",
        label: "这份资料写给谁",
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
    description: "结合你的定位和客户问题，生成兼顾触达、信任和转化的 6 个选题。",
    promptHint: "根据账号定位、目标读者和发布平台，生成覆盖触达、解释与信任目标的选题矩阵。",
    resultType: "text",
    exampleTitle: "6 个高质量选题案例",
    exampleSummary: "同主题拆成流量、信任、转化三种内容任务。",
    fields: [
      {
        id: "special_requirements",
        label: "近期想重点写什么（可选）",
        type: "textarea",
        placeholder: "例如：本月重点写少儿医疗险；避开产品测评；更适合视频号。留空则根据数字分身生成。",
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
    description: "结合当前业务、优势和目标客户，梳理清晰的账号定位、标签与长期内容主线。",
    promptHint: "从人设、客群、差异化、表达风格四个角度给出定位方案，让账号更容易被记住。",
    resultType: "text",
    exampleTitle: "IP 定位方案案例",
    exampleSummary: "从现状、客群和服务标签里抽出更清楚的人设主张。",
    fields: [
      {
        id: "current_state",
        label: "你现在的账号和业务情况",
        type: "textarea",
        required: true,
        placeholder: "描述你现在的账号、客群、服务方向、代表案例和卡点。",
      },
      {
        id: "target_client",
        label: "你最想服务哪类客户",
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
    description: "梳理当前最影响增长的问题，并给出优先顺序、下一步动作和复盘指标。",
    promptHint: "以增长陪跑的方式分析现状：先定位卡点，再给短期动作、内容策略和复盘指标。",
    resultType: "text",
    exampleTitle: "破局增长案例",
    exampleSummary: "针对私信多转化少的账号，给出节奏和动作拆解。",
    fields: [
      {
        id: "source",
        label: "描述你目前的情况",
        type: "text_or_file",
        required: true,
        placeholder: "请粘贴你当前的业务背景、最近动作、最卡的环节和已经试过但没跑通的方法，也可以先下载攻略模板填写后再上传。",
        helper: "可直接粘贴文本，或上传 TXT、DOCX、PDF、Markdown 文件。",
      },
      {
        id: "desired_result",
        label: "未来 2 到 4 周最想改善什么",
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
    description: "根据团队优势和候选人顾虑，生成招募文案、海报标题和私信沟通话术。",
    promptHint: "围绕团队优势、适合人群、成长路径和加入理由，写出可信的招募内容。",
    resultType: "text",
    exampleTitle: "团队招募案例",
    exampleSummary: "从训练体系和陪跑支持切进，写成更可信的招募文案。",
    fields: [
      {
        id: "team_offer",
        label: "团队能为新人提供什么",
        type: "textarea",
        required: true,
        placeholder: "例如培训体系、陪跑支持、客户资源、主打赛道、团队氛围。",
      },
      {
        id: "candidate",
        label: "这次想招募哪类人",
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
    description: "根据直播主题、观众问题和已有材料，生成从开场、讲解、互动到收尾的完整脚本。",
    promptHint: "适合按直播实战思路整理脚本。请围绕直播经验、主题、目标客群、讲述框架、误区观点、案例、转化目标、产品卖点和个人人设，输出可直接开讲的直播流程稿。",
    resultType: "text",
    exampleTitle: "直播流程稿案例",
    exampleSummary: "从开场钩子、问题拆解到收口转化，展示一版更完整的直播脚本案例。",
    fields: [
      {
        id: "experience_level",
        label: "你的直播经验",
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
        label: "这场直播要讲清什么",
        type: "text",
        required: true,
        placeholder: "越具体越好，例如：孩子医疗险怎么买更稳、普通家庭怎么买重疾险更不踩坑。",
      },
      {
        id: "audience",
        label: "谁会来看这场直播",
        type: "textarea",
        required: true,
        placeholder: "请写年龄、性别、生活状态、认知水平、当前困扰等，越具体越好。",
      },
      {
        id: "live_style",
        label: "你习惯怎么讲（可选）",
        type: "textarea",
        placeholder: "例如喜欢先讲故事再拆观点、偏问答式、节奏快、喜欢举客户案例。",
      },
      {
        id: "core_points",
        label: "必须讲到的观点和问题",
        type: "textarea",
        required: true,
        placeholder: "把这场直播一定要讲透的观点、误区、盲区和高频问题写出来。",
      },
      {
        id: "case_material",
        label: "可使用的真实案例（可选）",
        type: "textarea",
        placeholder: "有就尽量写清楚；如果没有，直接写“没有案例”。",
      },
      {
        id: "goal",
        label: "希望观众看完后做什么",
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
        label: "内容重点",
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
        label: "产品规则与案例（涉及产品时填写）",
        type: "textarea",
        placeholder: "如果会涉及产品，请把卖点、适合人群、常见异议、真实案例尽量写详细。",
      },
      {
        id: "persona_points",
        label: "可以公开的个人经历与专业证明",
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
    description: "把一份完整观点或分享素材，整理成口播稿和公众号文章。",
    promptHint: "更适合普通观点、分享型素材和非强销售内容。",
    resultType: "text",
    exampleTitle: "泛内容创作案例",
    exampleSummary: "展示同一份观点如何分别整理成口播稿和公众号文章。",
    fields: [
      {
        id: "source",
        label: "粘贴你的观点或分享素材",
        type: "textarea",
        required: true,
        placeholder: "请尽量写清事件背景、你的判断和希望读者理解的重点。",
      },
      {
        id: "targets",
        label: "选择要生成的内容",
        type: "multiselect",
        required: true,
        options: [
          { label: "口播稿（2篇）", value: "video_script" },
          { label: "公众号（2篇）", value: "wechat_article" },
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
    description: "分析公众号文章的开篇、重点和转折，为不同段落生成节奏匹配的配图。",
    promptHint: "更强调公众号阅读场景、段落节奏和多张配图输出。",
    resultType: "image",
    exampleTitle: "公众号配图案例",
    exampleSummary: "围绕公众号文章内容生成更适合段落阅读节奏的配图方案。",
    fields: [
      {
        id: "style",
        label: "选择整篇文章的视觉风格",
        type: "radio",
        required: true,
        helper: "所有配图会沿用同一视觉方向，保证整篇文章风格统一。",
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
        label: "粘贴完整文章",
        type: "text_or_file",
        required: true,
        placeholder: "建议粘贴带标题和段落的完整文章；只有核心段落时，也请保留上下文。",
        helper: "可上传 TXT、DOCX 或 PDF 文件。",
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
    description: "检查口播稿的开场、逻辑和说话节奏，并给出可逐句对照的修改建议与精修稿。",
    promptHint: "适合已经有口播底稿时，直接贴入原稿并拿到更详细的改稿建议与精修版文案。",
    resultType: "text",
    fields: [
      {
        id: "draft",
        label: "粘贴准备发布的口播原稿",
        type: "textarea",
        required: true,
        placeholder: "请粘贴完整原稿。保留你平时真实会说的话，修改结果会更自然。",
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
    description: "根据真实人物关系和事件背景，写一封适合纪念、感谢或重要节点发布的信。",
    promptHint: "适合围绕一个主题、背景和情感诉求，生成一篇更适合公众号场景发布的走心长信。",
    resultType: "text",
    fields: [
      {
        id: "theme",
        label: "这封信写给谁、为什么写",
        type: "textarea",
        required: true,
        placeholder: "请写清收信人、你们的关系、真实背景、最想表达的内容，以及不能写错的细节。",
        helper: "至少 50 字。真实细节越具体，成稿越自然。",
      },
      {
        id: "targets",
        label: "发布形式",
        type: "multiselect",
        required: true,
        options: [{ label: "公众号", value: "wechat_article" }],
      },
    ],
  },
  {
    id: "xiaohongshu-check",
    slug: "xiaohongshu-check",
    name: "小红书文案风险检查",
    emoji: "🧐",
    category: "content",
    points: 5,
    description: "标出小红书文案中的高风险表达，解释原因，并提供更稳妥的替换写法。",
    promptHint: "更偏审核和修改建议，不是重新从零创作。",
    resultType: "text",
    fields: [
      { id: "content", label: "粘贴准备发布的小红书文案", type: "textarea", required: true, placeholder: "请包含标题、正文、话题和结尾引导，系统会按原句定位风险。" },
    ],
  },
  {
    id: "policy-diagnosis",
    slug: "policy-diagnosis",
    name: "保单结构复核",
    emoji: "🛡️",
    category: "content",
    points: 5,
    badge: "结构复核",
    description: "根据家庭情况和保单摘要，梳理保障缺口、重复责任、保费压力与待确认信息。",
    promptHint: "根据保单信息输出结构诊断、风险提醒和优化建议。",
    resultType: "text",
    fields: [
      {
        id: "household_stage",
        label: "家庭目前处于什么阶段",
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
        label: "这次最想先看清什么",
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
        label: "家庭成员和现有保障",
        type: "textarea",
        required: true,
        placeholder: "例如：夫妻 32/30 岁，两个孩子 6 岁/2 岁；大人已有重疾、医疗、寿险，孩子目前只有居民医保。",
      },
      {
        id: "policy_info",
        label: "逐份填写保单关键信息",
        type: "text_or_file",
        required: true,
        placeholder: "请尽量按成员整理：险种、保额、保费、缴费年限、保障期限、是否附加医疗/豁免等。也可直接粘贴保单摘要或上传文本资料。",
        helper: "如果有多份保单，建议按“投保人 / 被保人 / 险种 / 保额 / 年缴保费”分行整理，诊断会更准。",
      },
      {
        id: "concerns",
        label: "特别担心的问题（可选）",
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
    description: "保留原文事实和立场，优化标题、结构、段落衔接和结尾行动。",
    promptHint: "适合已有成稿的公众号内容做升级，保留原意但显著优化读感。",
    resultType: "text",
    fields: [
      {
        id: "article",
        label: "粘贴准备发布的公众号原稿",
        type: "textarea",
        required: true,
        placeholder: "请粘贴完整文章；如果有必须保留的观点、案例或语气，请写在开头。",
      },
      {
        id: "target",
        label: "发布形式",
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
