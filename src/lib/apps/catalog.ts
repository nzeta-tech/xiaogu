export type CreationCategoryId = "content" | "ip" | "growth";

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
  | "wechat-images"
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
    points: 100,
    badge: "推荐",
    featured: true,
    description: "一次搞定：口播稿、公众号文章、小红书笔记、朋友圈，有你的风格又有网感，量大管饱~可输入：观点录音（推荐）、文章、口播稿等。",
    promptHint: "像目标站一样按「素材输入 + 批量选择」执行：先提炼核心观点，再拆成不同平台可直接发布的内容。",
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
    points: 100,
    badge: "钻石+至尊",
    description: "输入图文内容，生成适合获客场景的知识卡片与配图方案。",
    promptHint: "按目标站图片应用流程执行：确定风格、内容、署名和图片比例，再输出可用于生成图片的卡片文案。",
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
          { label: "手绘插画", value: "illustration", previewUrl: "https://qingshanai.vip/api/files/preview-image?path=tos%3A%2F%2Fwenanpub%2Fradio-previews%2Fpreview_1777613263_0ba61348.jpg" },
          { label: "白板手写风格", value: "whiteboard", previewUrl: "https://qingshanai.vip/api/files/preview-image?path=tos%3A%2F%2Fwenanpub%2Fradio-previews%2Fpreview_1777613270_4a04b7f8.jpg" },
          { label: "东方禅意", value: "zen", previewUrl: "https://qingshanai.vip/api/files/preview-image?path=tos%3A%2F%2Fwenanpub%2Fradio-previews%2Fpreview_1782094759_5798d3fa.jpg" },
          { label: "手绘线稿插画", value: "line-illustration", previewUrl: "https://qingshanai.vip/api/files/preview-image?path=tos%3A%2F%2Fwenanpub%2Fradio-previews%2Fpreview_1777613283_bf8dab7d.jpg" },
          { label: "奢侈高端风格", value: "luxury", previewUrl: "https://qingshanai.vip/api/files/preview-image?path=tos%3A%2F%2Fwenanpub%2Fradio-previews%2Fpreview_1777613289_4cc255aa.jpg" },
          { label: "杂志风格", value: "magazine", previewUrl: "https://qingshanai.vip/api/files/preview-image?path=tos%3A%2F%2Fwenanpub%2Fradio-previews%2Fpreview_1777613294_b14d696a.jpg" },
          { label: "城市涂鸦风格", value: "graffiti", previewUrl: "https://qingshanai.vip/api/files/preview-image?path=tos%3A%2F%2Fwenanpub%2Fradio-previews%2Fpreview_1777613556_7c781005.jpg" },
          { label: "演讲现场风格", value: "event-stage", previewUrl: "https://qingshanai.vip/api/files/preview-image?path=tos%3A%2F%2Fwenanpub%2Fradio-previews%2Fpreview_1777613378_1754d6d4.jpg" },
          { label: "手写笔记风格", value: "handwritten-notes", previewUrl: "https://qingshanai.vip/api/files/preview-image?path=tos%3A%2F%2Fwenanpub%2Fradio-previews%2Fpreview_1777613385_06ea8936.jpg" },
          { label: "立体粘土风格", value: "clay", previewUrl: "https://qingshanai.vip/api/files/preview-image?path=tos%3A%2F%2Fwenanpub%2Fradio-previews%2Fpreview_1777613391_220f6f6b.jpg" },
          { label: "极简手绘", value: "minimal-drawing", previewUrl: "https://qingshanai.vip/api/files/preview-image?path=tos%3A%2F%2Fwenanpub%2Fradio-previews%2Fpreview_1777613347_558eb090.jpg" },
          { label: "商务风格", value: "business", previewUrl: "https://qingshanai.vip/api/files/preview-image?path=tos%3A%2F%2Fwenanpub%2Fradio-previews%2Fpreview_1777613398_43562222.jpg" },
          { label: "黑板报风格", value: "blackboard", previewUrl: "https://qingshanai.vip/api/files/preview-image?path=tos%3A%2F%2Fwenanpub%2Fradio-previews%2Fpreview_1777613404_91ba9fb4.jpg" },
          { label: "扁平知识风格", value: "flat-knowledge", previewUrl: "https://qingshanai.vip/api/files/preview-image?path=tos%3A%2F%2Fwenanpub%2Fradio-previews%2Fpreview_1777613410_751dafba.jpg" },
          { label: "莫兰迪平面风格", value: "morandi", previewUrl: "https://qingshanai.vip/api/files/preview-image?path=tos%3A%2F%2Fwenanpub%2Fradio-previews%2Fpreview_1777613418_fe6e5dd7.jpg" },
          { label: "科普知识手绘", value: "science-sketch", previewUrl: "https://qingshanai.vip/api/files/preview-image?path=tos%3A%2F%2Fwenanpub%2Fradio-previews%2Fpreview_1778554166_07fbcc13.jpg" },
          { label: "深色专业", value: "dark-pro", previewUrl: "https://qingshanai.vip/api/files/preview-image?path=tos%3A%2F%2Fwenanpub%2Fradio-previews%2Fpreview_1777613430_3c7db21c.jpg" },
          { label: "清爽简约卡片", value: "fresh-card", previewUrl: "https://qingshanai.vip/api/files/preview-image?path=tos%3A%2F%2Fwenanpub%2Fradio-previews%2Fpreview_1777613440_4f078fff.jpg" },
          { label: "质感日签", value: "daily-sign", previewUrl: "https://qingshanai.vip/api/files/preview-image?path=tos%3A%2F%2Fwenanpub%2Fradio-previews%2Fpreview_1777780015_adda0df2.jpg" },
          { label: "学霸笔记", value: "study", previewUrl: "https://qingshanai.vip/api/files/preview-image?path=tos%3A%2F%2Fwenanpub%2Fradio-previews%2Fpreview_1777972831_8acba733.jpg" },
          { label: "大字版日签", value: "large-sign", previewUrl: "https://qingshanai.vip/api/files/preview-image?path=tos%3A%2F%2Fwenanpub%2Fradio-previews%2Fpreview_1778905915_924b4acf.jpg" },
          { label: "黑白调", value: "black-white", previewUrl: "https://qingshanai.vip/api/files/preview-image?path=tos%3A%2F%2Fwenanpub%2Fradio-previews%2Fpreview_1779603427_5a66fa39.jpg" },
          { label: "手账拼贴风", value: "scrapbook", previewUrl: "https://qingshanai.vip/api/files/preview-image?path=tos%3A%2F%2Fwenanpub%2Fradio-previews%2Fpreview_1779529594_7eb9654b.jpg" },
          { label: "简洁白橙蓝", value: "white-orange-blue", previewUrl: "https://qingshanai.vip/api/files/preview-image?path=tos%3A%2F%2Fwenanpub%2Fradio-previews%2Fpreview_1780200039_504504c4.jpg" },
          { label: "日报风格", value: "daily", previewUrl: "https://qingshanai.vip/api/files/preview-image?path=tos%3A%2F%2Fwenanpub%2Fradio-previews%2Fpreview_1780628202_70f2c2c4.jpg" },
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
    points: 100,
    badge: "新",
    description: "更侧重引流文案的创作：口播稿、小红书笔记、公众号文章，一次搞定。可输入：观点录音、文章、口播稿等。",
    promptHint: "按目标应用执行：基于用户素材，围绕引流转化目标，一次产出口播稿、小红书笔记、公众号文章三类内容。",
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
        helper: "输入你的主题、观点等、粘贴要参考的内容，也可上传文件",
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
    id: "lead-package",
    slug: "lead-package",
    name: "【引流资料】制作",
    emoji: "🎁",
    category: "content",
    points: 100,
    description: "输入主题，生成可用于获客的资料包标题、正文、领取话术和发布文案。",
    promptHint: "按目标站引流资料逻辑输出：资料定位、目录结构、交付内容、评论/私信领取话术一次配齐。",
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
    points: 100,
    requiresThinking: true,
    description: "结合你的思维画像，批量生成流量、信任、转化三个方向的选题。",
    promptHint: "像目标站「找选题」一样，先判断账号定位和平台，再给出可直接进入创作的选题列表。",
    resultType: "text",
    exampleTitle: "6 个高质量选题案例",
    exampleSummary: "同主题拆成流量、信任、转化三种内容任务。",
    fields: [
      {
        id: "goal",
        label: "选择本轮目标",
        type: "select",
        required: true,
        options: [
          { label: "拉流量", value: "traffic" },
          { label: "建信任", value: "trust" },
          { label: "做转化", value: "conversion" },
        ],
      },
      {
        id: "platform",
        label: "选择发布平台",
        type: "select",
        required: true,
        options: [
          { label: "视频号", value: "wechat_video" },
          { label: "小红书", value: "xiaohongshu" },
          { label: "公众号", value: "wechat_article" },
        ],
      },
      {
        id: "extra",
        label: "补充账号背景",
        type: "textarea",
        placeholder: "例如最近准备讲高端医疗、养老、少儿保障，或正在做某个活动。",
      },
    ],
  },
  {
    id: "ip-positioning",
    slug: "ip-positioning",
    name: "IP定位",
    emoji: "🎯",
    category: "ip",
    points: 100,
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
    points: 100,
    description: "把当前卡点拆成问题诊断、破局路径和可执行动作清单。",
    promptHint: "以增长陪跑的方式分析现状：先定位卡点，再给短期动作、内容策略和复盘指标。",
    resultType: "text",
    exampleTitle: "破局增长案例",
    exampleSummary: "针对私信多转化少的账号，给出节奏和动作拆解。",
    fields: [
      {
        id: "bottleneck",
        label: "输入当前卡点",
        type: "textarea",
        required: true,
        placeholder: "例如有流量没转化、私信很多但成交少、直播没节奏、内容更新断档。",
      },
      {
        id: "desired_result",
        label: "输入期待结果",
        type: "text",
        required: true,
        placeholder: "例如：每周稳定发布、私信有承接、成交动作可复盘。",
      },
    ],
  },
  {
    id: "team-recruit",
    slug: "team-recruit",
    name: "招募文案",
    emoji: "🤝",
    category: "growth",
    points: 100,
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
    points: 100,
    description: "按主题、客群和转化目标，生成一版更完整的直播脚本。",
    promptHint: "适合从直播主题、目标客群和产品重点出发，整理成直播流程稿。",
    resultType: "text",
    fields: [
      { id: "theme", label: "直播主题", type: "text", required: true, placeholder: "例如：孩子医疗险怎么买更稳。" },
      { id: "audience", label: "目标客群", type: "text", required: true, placeholder: "例如：30-40 岁有娃家庭。" },
      { id: "goal", label: "直播目标", type: "radio", required: true, options: [
        { label: "卖课", value: "course" },
        { label: "咨询转化", value: "consult" },
        { label: "先讲认知", value: "awareness" },
      ] },
      { id: "material", label: "补充素材", type: "textarea", placeholder: "如产品卖点、案例、常见问题、直播风格。" },
    ],
  },
  {
    id: "general-content",
    slug: "general-content",
    name: "泛内容创作",
    emoji: "📝",
    category: "content",
    points: 100,
    description: "把输入内容改写成更有共鸣、更适合破圈传播的文案。",
    promptHint: "更适合普通观点、分享型素材和非强销售内容。",
    resultType: "text",
    fields: [
      { id: "source", label: "原始内容", type: "textarea", required: true, placeholder: "输入文章、口播整理稿或观点。" },
      { id: "style", label: "想要的表达气质", type: "radio", required: true, options: [
        { label: "更温柔", value: "gentle" },
        { label: "更锋利", value: "sharp" },
        { label: "更有故事感", value: "story" },
      ] },
    ],
  },
  {
    id: "wechat-images",
    slug: "wechat-images",
    name: "公众号配图",
    emoji: "🖼️",
    category: "content",
    points: 100,
    description: "调性拉满！输入你的公众号文稿，选择一个风格，会生成多张提高文章质感的配图",
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
          { label: "气质现实", value: "realistic", previewUrl: "https://qingshanai.vip/api/files/preview-image?path=tos%3A%2F%2Fwenanpub%2Fradio-previews%2Fpreview_1765695990_95e878ab.jpg" },
          { label: "风景", value: "landscape", previewUrl: "https://qingshanai.vip/api/files/preview-image?path=tos%3A%2F%2Fwenanpub%2Fradio-previews%2Fpreview_1765695064_adaebc48.jpg" },
          { label: "抽象", value: "abstract", previewUrl: "https://qingshanai.vip/api/files/preview-image?path=tos%3A%2F%2Fwenanpub%2Fradio-previews%2Fpreview_1765695041_132edfe6.jpg" },
          { label: "宫崎骏风格", value: "miyazaki", previewUrl: "https://qingshanai.vip/api/files/preview-image?path=tos%3A%2F%2Fwenanpub%2Fradio-previews%2Fpreview_1765695020_98945878.jpg" },
          { label: "新海诚风格", value: "shinkai", previewUrl: "https://qingshanai.vip/api/files/preview-image?path=tos%3A%2F%2Fwenanpub%2Fradio-previews%2Fpreview_1765694993_9174095f.jpg" },
          { label: "丰子恺风格", value: "feng-zikai", previewUrl: "https://qingshanai.vip/api/files/preview-image?path=tos%3A%2F%2Fwenanpub%2Fradio-previews%2Fpreview_1765694928_43132284.jpg" },
          { label: "蔡志忠风格", value: "cai-zhizhong", previewUrl: "https://qingshanai.vip/api/files/preview-image?path=tos%3A%2F%2Fwenanpub%2Fradio-previews%2Fpreview_1765694906_88704e90.jpg" },
          { label: "Quentin Blake风格", value: "quentin-blake", previewUrl: "https://qingshanai.vip/api/files/preview-image?path=tos%3A%2F%2Fwenanpub%2Fradio-previews%2Fpreview_1765695200_231d4c8d.jpg" },
          { label: "Oliver Jeffers风格", value: "oliver-jeffers", previewUrl: "https://qingshanai.vip/api/files/preview-image?path=tos%3A%2F%2Fwenanpub%2Fradio-previews%2Fpreview_1765694835_9bb3823e.jpg" },
          { label: "油画风格", value: "oil", previewUrl: "https://qingshanai.vip/api/files/preview-image?path=tos%3A%2F%2Fwenanpub%2Fradio-previews%2Fpreview_1765695246_db5d2e80.jpg" },
          { label: "水彩晕染风格", value: "watercolor", previewUrl: "https://qingshanai.vip/api/files/preview-image?path=tos%3A%2F%2Fwenanpub%2Fradio-previews%2Fpreview_1765694794_54c54246.jpg" },
          { label: "彩色铅笔手绘插画风格", value: "colored-pencil", previewUrl: "https://qingshanai.vip/api/files/preview-image?path=tos%3A%2F%2Fwenanpub%2Fradio-previews%2Fpreview_1765695285_f3186a77.jpg" },
          { label: "细线条插画", value: "fine-line", previewUrl: "https://qingshanai.vip/api/files/preview-image?path=tos%3A%2F%2Fwenanpub%2Fradio-previews%2Fpreview_1772681895_349ae0d2.jpg" },
          { label: "水墨画风格", value: "ink", previewUrl: "https://qingshanai.vip/api/files/preview-image?path=tos%3A%2F%2Fwenanpub%2Fradio-previews%2Fpreview_1765695305_8d87ed34.jpg" },
          { label: "几米风格", value: "jimmy", previewUrl: "https://qingshanai.vip/api/files/preview-image?path=tos%3A%2F%2Fwenanpub%2Fradio-previews%2Fpreview_1765695927_c51bff7e.jpg" },
          { label: "城市细节", value: "city-detail", previewUrl: "https://qingshanai.vip/api/files/preview-image?path=tos%3A%2F%2Fwenanpub%2Fradio-previews%2Fpreview_1765939273_e6450650.jpg" },
          { label: "静谧中的戏剧性", value: "quiet-drama", previewUrl: "https://qingshanai.vip/api/files/preview-image?path=tos%3A%2F%2Fwenanpub%2Fradio-previews%2Fpreview_1765939491_f4bdc3c5.jpg" },
          { label: "城市日落时间", value: "city-sunset", previewUrl: "https://qingshanai.vip/api/files/preview-image?path=tos%3A%2F%2Fwenanpub%2Fradio-previews%2Fpreview_1766071172_9e0824a3.jpg" },
          { label: "治愈系插画", value: "healing", previewUrl: "https://qingshanai.vip/api/files/preview-image?path=tos%3A%2F%2Fwenanpub%2Fradio-previews%2Fpreview_1767584133_9eec6546.jpg" },
          { label: "复古手绘插画", value: "retro-drawing", previewUrl: "https://qingshanai.vip/api/files/preview-image?path=tos%3A%2F%2Fwenanpub%2Fradio-previews%2Fpreview_1767767990_67dba7ff.jpg" },
          { label: "高饱治愈插画", value: "vivid-healing", previewUrl: "https://qingshanai.vip/api/files/preview-image?path=tos%3A%2F%2Fwenanpub%2Fradio-previews%2Fpreview_1767769578_3ff8f1ae.jpg" },
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
    points: 100,
    badge: "重磅升级",
    description: "把现有口播稿精修得更高级、更有节奏、更有流量。",
    promptHint: "适合已经有底稿，只想做高级改稿和提效。",
    resultType: "text",
    fields: [
      { id: "draft", label: "现有口播稿", type: "textarea", required: true, placeholder: "粘贴已有口播稿。" },
      { id: "goal", label: "本次想重点优化什么", type: "multiselect", required: true, options: [
        { label: "开头更抓人", value: "hook" },
        { label: "逻辑更顺", value: "logic" },
        { label: "情绪更稳", value: "tone" },
        { label: "更像自己", value: "self" },
      ] },
    ],
  },
  {
    id: "letter",
    slug: "letter",
    name: "走心一封信",
    emoji: "💌",
    category: "content",
    points: 100,
    requiresThinking: true,
    description: "根据你的思维与风格，写一封更有情绪价值的信。",
    promptHint: "适合节日、周年、客户感谢和人生节点内容。",
    resultType: "text",
    fields: [
      { id: "occasion", label: "想写给谁 / 什么场景", type: "text", required: true, placeholder: "例如：母亲节写给宝妈客户。" },
      { id: "emotion", label: "想传达的核心情绪", type: "textarea", required: true, placeholder: "例如：感谢、理解、陪伴、提醒。" },
    ],
  },
  {
    id: "xiaohongshu-check",
    slug: "xiaohongshu-check",
    name: "小红书违规检测",
    emoji: "🧐",
    category: "content",
    points: 10,
    description: "检查小红书文案的潜在违规点，并给改写建议。",
    promptHint: "更偏审核和修改建议，不是重新从零创作。",
    resultType: "text",
    fields: [
      { id: "content", label: "待检查文案", type: "textarea", required: true, placeholder: "粘贴准备发的小红书文案。" },
    ],
  },
  {
    id: "policy-diagnosis",
    slug: "policy-diagnosis",
    name: "保单架构诊断",
    emoji: "🛡️",
    category: "content",
    points: 0,
    badge: "新！工具",
    description: "帮你先从结构上识别保单的利益风险和配置缺口。",
    promptHint: "根据保单信息输出结构诊断、风险提醒和优化建议。",
    resultType: "text",
    fields: [
      { id: "policy_info", label: "保单信息", type: "textarea", required: true, placeholder: "输入家庭成员、险种、保额、保费、缴费年限等。" },
      { id: "focus", label: "最想先看什么", type: "radio", required: true, options: [
        { label: "保障缺口", value: "gap" },
        { label: "利益风险", value: "risk" },
        { label: "结构是否重复", value: "duplicate" },
      ] },
    ],
  },
  {
    id: "wechat-article-polish",
    slug: "wechat-article-polish",
    name: "公众号文章精修",
    emoji: "🖊️",
    category: "content",
    points: 100,
    description: "精修你的公众号文章，高级又有流量，也让你更懂文案。",
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

export const creationExamples: CreationExample[] = [
  {
    slug: "advisor-brand-copy",
    appSlug: "write-copy",
    title: "买重疾险，价格是最后一个该问的问题",
    summary: "把一段保险观点素材拆成朋友圈、口播稿和公众号文案，形成更强的案例展示页。",
    intro: "其实我很理解总选便宜产品的人。保费不低，家里开销又多，能省一点是一点。这个出发点完全没有错。",
    highlight: "适合同一观点拆成多个平台版本，方便直接复制、导出和继续做同款。",
    ctaLabel: "做同款",
    tabs: [
      "买重疾险，价格是最后一个该问的问题",
      "有灵感，马上录音，秒变接地气的自媒体素材",
      "看到好的公众号，直接粘过来",
      "用口述方法，来要求 AI 写文案",
    ],
    linkedExamples: ["advisor-brand-copy", "voice-note-copy", "paste-article-copy", "dictation-copy"],
    sections: [
      {
        id: "moments-1",
        title: "朋友圈 x3",
        body: "便宜是今天的事。\n\n兜底是那天的事。\n\n这两件事，不在同一个时间轴上。",
        quote: "保险人的段子：这条又要比比价群沉默了",
      },
      {
        id: "moments-2",
        title: "朋友圈 2（B:短文配图）",
        body: "重疾险买的不是今天的价格，\n\n是几十年后那个“有人兜底”。\n\n你现在省下来的每一分，\n都可能在未来某个节点，\n变成自己扛风险的代价。",
        quote: "被精准命中，但我还是想再比比价",
      },
      {
        id: "broadcast",
        title: "口播稿 x3",
        body: "很多人来问我重疾险，第一句就是：有没有更便宜一点的？\n\n我特别理解，因为保险本来就不是一笔轻松支出。\n\n但如果你真准备给家庭配一份长期保障，价格真的应该是最后问的那个问题。",
        quote: "你不是在买一张最便宜的保单，而是在买未来出事时，有没有人替你扛一下。",
      },
    ],
    outputs: [
      {
        id: "article-1",
        title: "公众号 x2",
        tag: "支持公众号格式",
        viewMode: "wechat",
        body: "切换成公众号格式后，会进入更贴近目标站的预览型长文展示。",
        children: [
          {
            id: "article-1-a",
            title: "买重疾险，价格是最后一个该问的问题",
            body:
              "【文章风格】洞察型\n\n【备选标题】\n1. 你在比价，但你比的根本不是同一件事\n2. 重疾险的钱，便宜的那部分在哪省的？\n3. 一张保单几十年，你真的算清楚了吗\n\n你觉得自己在货比三家，实际上你跳过了最重要的那个问题。\n\n互联网重疾险和线下产品，价格差可以很大。\n\n有人觉得这是大公司在收智商税。有人觉得选便宜的才叫理性消费。\n\n我不打算反驳这个逻辑，因为它在一个前提下是对的，你确定这两个产品，保的是同一件事。\n\n## 重疾险的本质是什么\n\n不是保费。\n\n不是条款。\n\n不是理赔率数字。\n\n是：当你真的出问题的时候，这家公司还在不在，赔不赔得出来。\n\n一张重疾险，短则覆盖二十年，孩子的保单可能跟着他到六十岁。\n\n你买的不是一个产品，你签的是一份几十年的契约。\n\n问题就在这里，几十年之后的事，没有人能保证。但有些公司，确定性更高。\n\n## 便宜的代价不是写在条款里的\n\n互联网产品为什么便宜？\n\n精算逻辑是清晰的：渠道成本低、运营成本低、不养代理人，省下来的给你优惠。\n\n这部分逻辑没问题。\n\n但还有另一部分没写出来，一些互联网保险公司，资本金规模有限，偿付能力是动态的，经营模式也在验证期。\n\n这不是说它们会出问题。\n\n是说：如果出了问题，你的索赔流程会是什么样的，你没经历过，你不知道。\n\n你省下来的那部分保费，有些是成本效率差异，有些是不确定性定价。\n\n## 理赔这件事，不只看赔不赔，还看怎么赔\n\n同样一个疾病，理赔申请提交之后，你有没有人跟你走完整个流程？\n\n有没有人帮你确认材料齐了？\n\n有没有人在医院端帮你推进？\n\n有没有人在理赔卡单的时候帮你找到解决路径？\n\n互联网产品的理赔，是你和一个客服系统之间的事。\n\n代理人模式的理赔，是你、代理人和公司三方之间的事。\n\n哪一种在你状态最差的时候更靠谱，你心里有数。\n\n## 便宜买单的时候，往往是最贵的时候\n\n重疾险是你用一笔小钱，换一个几十年内遭遇高额医疗风险时的兜底能力。\n\n它的价值不体现在平时，体现在那个你最不希望发生的时刻。\n\n那个时刻里，你需要的不是“当时省了多少钱”，你需要的是“这件事有人帮我搞定”。\n\n所以我一直觉得，买重疾险比价格之前，有一个问题更值得先回答：\n\n这家公司二十年后还在吗？我真的出了问题，流程走得顺吗？\n\n把这个问题想清楚了，再去谈价格，才是真正的理性。",
            quote: "标签：#保险规划 #重疾险 #育儿保障 #理性消费 #保险选择逻辑",
          },
          {
            id: "article-1-b",
            title: "给孩子买保险那天，我遇到一个让我想了很久的问题",
            body:
              "【文章风格】温度型\n\n【备选标题】\n1. 那位妈妈说，互联网的便宜多好，我没有马上反驳她\n2. 孩子两三岁，她想买最便宜的重疾险\n3. 保险，有些钱你现在不心疼，但那个时刻你会\n\n她打开手机给我看那个价格，语气里有一点骄傲，你看，便宜这么多。\n\n那是一位妈妈。\n\n孩子刚两三岁，她想给孩子配一份重疾险。\n\n比较了好几个产品，最后倾向于互联网上的一款，价格确实低，差距不小。\n\n她问我：你们这边的价格为什么高这么多？\n\n我没有直接回答。\n\n我想了一下，问她一个问题：你买这份保险，最终是为了什么？\n\n她想了想，说：理赔吧。真的出事了，能赔到钱。\n\n对。\n\n买保险不是为了“拥有一份保单”，是为了那个最坏的情况发生时，有人能兜住。\n\n## 那个最坏的情况，可能是二十年后\n\n孩子现在两三岁，一份重疾险配下去，可能陪着他到三十岁、四十岁。\n\n这不是一年期的产品，它是一个几十年的约定。\n\n二十年后，那家互联网保险公司还在吗？经营模式还一样吗？理赔流程还顺畅吗？\n\n这不是故意吓人。是一家公司的稳定性，本身就是保障的一部分。\n\n你买的不只是条款，你买的是这家公司扛住时间的能力。\n\n## 便宜的那部分，去哪了\n\n互联网产品省掉了代理人成本，省掉了线下运营，这部分差价是真实的效率红利。\n\n但有时候，便宜还来自另一个地方，规模更小、资本金更薄、偿付压力更动态。\n\n这不是说便宜的就是不好的。\n\n是说，你得知道自己省的是哪一部分。\n\n如果是效率省的，没问题。\n\n如果是稳定性让步的，那这个账要重新算。\n\n## 出问题的时候，你需要的不只是钱\n\n理赔不只是一笔钱打过来。\n\n真正走理赔流程的时候，材料要准备，医院端要沟通，进度要跟进，如果卡单了要有人帮你找解决路径。\n\n那个时候，你或者你的家人，状态大概率不会太好。\n\n代理人的存在，不是为了收你的保费。是为了在那个时候，有一个人帮你把这些事情推进下去。\n\n线上客服和一个认识你、了解你情况的人，差距就在这里。\n\n那次聊完，那位妈妈没有马上给我答复。\n\n她说回去再想想。\n\n我觉得这是正常的。\n\n但我希望她想的那个问题，是“二十年后，这家公司靠不靠谱”，而不只是“这个月保费能不能少几十块”。",
            quote: "标签：#妈妈群体 #孩子保险 #重疾险选择 #保险理念 #长期保障",
          },
        ],
      },
      {
        id: "article-2",
        title: "给孩子买保险那天，很多家长其实是在给未来做选择",
        tag: "选题延展",
        body: "如果今天为了省一点保费，忽略了保障责任、赔付门槛和家庭整体结构，未来真的发生风险时，后悔往往来得特别快。\n\n所以价格可以问，但请把它放到最后问。",
      },
    ],
  },
  {
    slug: "voice-note-copy",
    appSlug: "write-copy",
    title: "有灵感，马上录音，秒变接地气的自媒体素材",
    summary: "把 1 分钟左右的口述素材拆成口播、小红书和公众号长文，保留强烈个人表达感。",
    intro: "平时遇到客户咨询或者同事讨论、听培训、学习，有一些灵感的时候就马上拿起手机把它录下来。录音里既有观点，也很有你的风格，并且效率很高。",
    highlight: "真实目标站案例里，这一类素材会被批量拆成口播、小红书和公众号多版本。",
    ctaLabel: "做同款",
    tabs: [
      "买重疾险，价格是最后一个该问的问题",
      "有灵感，马上录音，秒变接地气的自媒体素材",
      "看到好的公众号，直接粘过来",
      "用口述方法，来要求 AI 写文案",
    ],
    linkedExamples: ["advisor-brand-copy", "voice-note-copy", "paste-article-copy", "dictation-copy"],
    sections: [
      {
        id: "voice-broadcast",
        title: "口播稿 x3",
        body: "你买养老金，不是为了死后有钱赔。\n\n养老金的核心功能，是让你活着的时候有稳定现金流。\n\n如果你真的担心身故赔付，那你要解决的不是养老问题，而是传承问题。",
        quote: "别把两个需求混在一起纠结。",
      },
      {
        id: "voice-note",
        title: "录音稿转内容的优势",
        body: "录音的好处，是你不需要先把逻辑整理得特别工整。\n\n很多接地气、有个人味道的表达，反而最适合先说出来，再交给 AI 帮你拆成成稿。",
      },
    ],
    outputs: [
      {
        id: "voice-article",
        title: "公众号 x2",
        tag: "支持公众号格式",
        viewMode: "wechat",
        body: "这组案例在目标站里也会转成长文模式，适合把口述观点整理成更完整的论证文章。",
        children: [
          {
            id: "voice-article-a",
            title: "你买养老金，不是为了死后有钱赔",
            body: "有个客户找我买养老年金，聊了半天，最后卡在一个点上，他特别纠结身故赔付。\n\n我说你等等，你买养老金，到底是为了什么？是为了活着的时候每个月有钱领，还是为了死了之后给家人留一笔？\n\n这是两件事。\n\n养老金的核心功能，就是让你活着的时候有稳定现金流。\n\n但现在很多人被营销洗脑了，觉得保证领取 20 年好像更划算，其实你仔细算算，每年领的钱是不是少了？\n\n如果你真的担心身故赔付这件事，那你要解决的不是养老问题，是传承问题。\n\n这是寿险责任，不是年金责任。\n\n别把两个需求混在一起纠结。\n\n你是想活得有底气，还是想死后有交代？想清楚了，配置就不会乱了。",
          },
        ],
      },
    ],
  },
  {
    slug: "paste-article-copy",
    appSlug: "write-copy",
    title: "看到好的公众号，直接粘过来",
    summary: "把一个现成公众号案例作为素材源，再由 AI 用你的口径重组出新表达。",
    intro: "如果你已经看到一篇结构很好、观点很清楚的公众号文章，最省力的办法就是直接把它贴给 AI，再明确告诉它你想保留什么、替换什么、强调什么。",
    highlight: "这一类案例更像“拿结构、换视角、变成自己的表达方式”。",
    ctaLabel: "做同款",
    tabs: [
      "买重疾险，价格是最后一个该问的问题",
      "有灵感，马上录音，秒变接地气的自媒体素材",
      "看到好的公众号，直接粘过来",
      "用口述方法，来要求 AI 写文案",
    ],
    linkedExamples: ["advisor-brand-copy", "voice-note-copy", "paste-article-copy", "dictation-copy"],
    sections: [
      {
        id: "paste-article-hero",
        title: "公众号 x2",
        body: "看到一个案例：109 人的炒股群里，108 个是托，只有 1 个是真实受害者。\n\n这类素材最适合保留事件冲击力，再由你重新注入自己的洞察和判断。",
        quote: "骗局的核心，不是技术，是剧场效应。",
      },
    ],
    outputs: [
      {
        id: "paste-article-output",
        title: "公众号长文",
        tag: "洞察型",
        body: "108 个托的炒股群，暴露了一个残酷真相。\n\n最近看到一条新闻，上海一位阿姨差点被骗走 10 万积蓄。骗局很简单：一个叫“创投精英汇”的微信群，每天都在讨论投资、晒收益、庆祝中新股。\n\n群里 109 个人，108 个都是演员，只有阿姨一个是真的受害者。\n\n为什么这种低级骗局还能反复得手？因为它早就不是简单的话术欺骗，而是一场沉浸式表演。\n\n假导师每天讲课，假学员接力晒单，假资料铺天盖地。受害者以为自己进入了一个真实而专业的投资社群，却不知道所有对话都是托号之间的对戏。\n\n这类写法很适合当作“高完成度结构样本”，你只需要告诉 AI：哪些事实保留、哪些观点替换成你的判断、整体语气要更客观还是更犀利。",
      },
    ],
  },
  {
    slug: "dictation-copy",
    appSlug: "write-copy",
    title: "用口述方法，来要求 AI 写文案",
    summary: "对于数据敏感或表述严格的内容，先给参考文章，再口述你真正想保留的边界和方向。",
    intro: "对于数据敏感类或措辞严格类的，还是要给到具体内容做支持。比如想写分红实现率的口播稿，那最好喂一篇你感觉不错的公众号内容，再口述你想要的方向。",
    highlight: "这一类案例的重点不是素材本身，而是你如何通过口述把 AI 的写作边界校准好。",
    ctaLabel: "做同款",
    tabs: [
      "买重疾险，价格是最后一个该问的问题",
      "有灵感，马上录音，秒变接地气的自媒体素材",
      "看到好的公众号，直接粘过来",
      "用口述方法，来要求 AI 写文案",
    ],
    linkedExamples: ["advisor-brand-copy", "voice-note-copy", "paste-article-copy", "dictation-copy"],
    sections: [
      {
        id: "dictation-broadcast",
        title: "口播稿 x3",
        body: "你以为都能报？很多人在这一步就吃亏了。\n\n很多人买了百万医疗，也买了中端医疗，结果真住院了，两个都想报，最后发现只能报一个。\n\n因为医疗险有个规则，叫补偿原则。",
        quote: "百万医疗解决的是看得起病，中端医疗解决的是看得舒服、看得及时。",
      },
    ],
    outputs: [
      {
        id: "dictation-output",
        title: "严谨表达示范",
        tag: "客观口径",
        body: "当你需要输出涉及责任范围、药品分类、社保关系这类内容时，单纯一句“帮我写一篇专业口播稿”是不够的。\n\n更稳的方式是：给 AI 一篇你认可的参考文章，再用口述明确交代你真正的目标，比如这篇要偏中立、不能乱写、要有专家感但也要有活人感。\n\n这样生成出来的内容，既更像你，也更不容易跑偏。",
      },
    ],
  },
  {
    slug: "wechat-image-pack",
    appSlug: "image-card",
    title: "一句话，也能搞定精美知识卡片！",
    summary: "和目标站一致，这里展示的是图片结果型案例，不是文案拆解页。",
    intro: "",
    exampleType: "image",
    linkedExamples: ["wechat-image-pack", "event-scene-image", "proposal-image", "growth-funnel-image"],
    sections: [],
    outputs: [],
    imageResults: [
      {
        id: "generated-images",
        title: "生成的图片",
        imageUrl: "https://wenanpub.tos-cn-beijing.volces.com/nano_banana/1766201972_0_0.png",
        badge: "共 1 张",
        ratio: "3 / 4",
      },
    ],
  },
  {
    slug: "event-scene-image",
    appSlug: "image-card",
    title: "演讲现场风格图",
    summary: "目标站里的第二个做图案例标签，展示演讲现场风格单图。",
    intro: "",
    exampleType: "image",
    linkedExamples: ["wechat-image-pack", "event-scene-image", "proposal-image", "growth-funnel-image"],
    sections: [],
    outputs: [],
    imageResults: [
      {
        id: "generated-images",
        title: "生成的图片",
        imageUrl: "https://wenanpub.tos-cn-beijing.volces.com/nano_banana/1766918341_0_0.png",
        badge: "共 1 张",
        ratio: "3 / 4",
      },
    ],
  },
  {
    slug: "proposal-image",
    appSlug: "image-card",
    title: "方案也能做图！",
    summary: "目标站里的第三个做图案例标签，展示方案图结果页。",
    intro: "",
    exampleType: "image",
    linkedExamples: ["wechat-image-pack", "event-scene-image", "proposal-image", "growth-funnel-image"],
    sections: [],
    outputs: [],
    imageResults: [
      {
        id: "generated-images",
        title: "生成的图片",
        imageUrl: "https://wenanpub.tos-cn-beijing.volces.com/nano_banana/1766151222_0_0.png",
        badge: "共 1 张",
        ratio: "3 / 4",
      },
    ],
  },
  {
    slug: "growth-funnel-image",
    appSlug: "image-card",
    title: "流量、激活、变现黑洞~",
    summary: "目标站里的第四个做图案例标签，当前展示同一张结果图。",
    intro: "",
    exampleType: "image",
    linkedExamples: ["wechat-image-pack", "event-scene-image", "proposal-image", "growth-funnel-image"],
    sections: [],
    outputs: [],
    imageResults: [
      {
        id: "generated-images",
        title: "生成的图片",
        imageUrl: "https://wenanpub.tos-cn-beijing.volces.com/nano_banana/1766151222_0_0.png",
        badge: "共 1 张",
        ratio: "3 / 4",
      },
    ],
  },
  {
    slug: "lead-copy-bridge",
    appSlug: "lead-copy",
    title: "高端医疗的三段式引流文案",
    summary: "围绕误区、福利资料和行动指令，生成更容易被评论和私信承接的引流案例。",
    intro: "先把用户最关心的问题抛出来，再把资料福利和下一步动作串起来，让内容不仅能看，还能带动作。",
    highlight: "目标是把咨询动作收束到评论关键词、私信承接或企微留资。",
    ctaLabel: "做同款",
    sections: [
      {
        id: "lead-copy-angle",
        title: "引流角度",
        body: "围绕“高端医疗到底值不值”这个常见误区切入，先降低用户防御，再用福利资料承接，把互动动作自然埋进去。",
      },
      {
        id: "lead-copy-offer",
        title: "承接资料",
        body: "承接资料不是一句“有需要找我”，而是一份用户此刻真的想拿走的资料，例如《高端医疗避坑清单》或《家庭就医续保对照表》。",
      },
    ],
    outputs: [
      {
        id: "lead-copy-video",
        title: "短视频引流口播",
        tag: "首屏钩子",
        viewMode: "plain",
        body: `标题：很多家庭不是不想配高端医疗，而是根本没人把这3件事讲明白

很多人一听高端医疗，第一反应就是贵。

但真正让我觉得可惜的是，很多家庭不是买不起，而是压根不知道自己到底适不适合，哪些责任是真的有用，哪些条款以后最容易踩坑。

我最近整理了一份《高端医疗避坑清单》，专门把大多数人最容易问错、买错、忽略掉的几个点，做成了一页能快速看懂的对照表。

如果你最近也在看这类产品，或者家里已经配过但不确定是不是买对了，可以在评论区留“清单”，我发你。`,
      },
      {
        id: "lead-copy-comment",
        title: "评论区引导文案",
        tag: "评论承接",
        viewMode: "plain",
        body: `【评论区引导】
想看《高端医疗避坑清单》的，评论区留“清单”。

我把最常见的误区、续保关注点和适配人群都整理进去了，你可以先自己对照一遍。`,
      },
      {
        id: "lead-copy-dm",
        title: "私信承接话术",
        tag: "私信承接",
        viewMode: "plain",
        body: `【私信承接话术】
收到啦，我先把《高端医疗避坑清单》发你。

你可以先重点看里面那几条“哪些家庭更需要关注续保稳定性”和“哪些责任看着高级但不一定适合你”。

如果你愿意，我也可以顺手帮你看看你现在的家庭情况，更适合关注哪一类保障重点。`,
      },
    ],
  },
  {
    slug: "lead-package-medical",
    appSlug: "lead-package",
    title: "宝妈医疗险资料包",
    summary: "把资料定位、目录结构、领取话术和发布文案一次配齐。",
    intro: "资料包类应用更像完整的获客产品，不只是正文，还要把领取动作和传播路径一起设计好。",
    highlight: "适合把一份内容扩成能留资的完整资料包。",
    ctaLabel: "做同款",
    sections: [
      {
        id: "lead-package-outline",
        title: "资料结构",
        body: "1. 为什么要做这份资料\n2. 目录清单\n3. 核心内容\n4. 领取方式\n5. 朋友圈/私信引导",
      },
    ],
    outputs: [
      {
        id: "lead-package-copy",
        title: "领取话术",
        tag: "留资动作",
        body: `回复【清单】领取这份宝妈医疗险避坑表。

如果你想要我帮你按家庭预算再筛一版，也可以直接私信我。`,
      },
    ],
  },
  {
    slug: "topic-picker-growth",
    appSlug: "topic-picker",
    title: "6 个高质量选题案例",
    summary: "按流量、信任、转化三种目标拆出一组能直接进入创作的选题。",
    intro: "先判断账号定位和平台，再给出可以直接开写的选题列表，而不是只给一个空泛方向。",
    highlight: "适合围绕一个主题拆出多种内容任务。",
    ctaLabel: "做同款",
    sections: [
      {
        id: "topic-picker-list",
        title: "选题方向",
        body: "流量：用问题和冲突吸引点击。\n信任：用案例和复盘建立专业感。\n转化：用问题清单和行动建议引导咨询。",
      },
    ],
    outputs: [
      { id: "topic-picker-output", title: "可直接进入创作的选题", body: "1. 保险买贵了，到底贵在哪\n2. 为什么很多人越买越不安心\n3. 你家保单里最容易漏掉的三个点" },
    ],
  },
  {
    slug: "ip-positioning-case",
    appSlug: "ip-positioning",
    title: "IP 定位方案案例",
    summary: "从人设、客群、差异化、表达风格四个角度给出定位建议。",
    intro: "先把你是谁、服务谁、怎么和别人不一样说清楚，再让后续内容都围绕这个主张展开。",
    highlight: "适合从账号状态反推更稳定的定位表达。",
    ctaLabel: "做同款",
    sections: [
      {
        id: "ip-positioning-structure",
        title: "定位主张",
        body: "1. 你是谁\n2. 你服务谁\n3. 你和别人差在哪\n4. 你该怎么说",
      },
    ],
    outputs: [
      { id: "ip-positioning-output", title: "IP 定位摘要", body: "定位不是换个头像，而是让客户一看就知道你擅长什么、适合谁、能解决什么问题。" },
    ],
  },
  {
    slug: "breakthrough-growth",
    appSlug: "breakthrough",
    title: "破局增长方案",
    summary: "围绕当前卡点，拆成诊断、动作和复盘指标。",
    intro: "先定位卡点，再给短期动作、内容策略和复盘指标，让增长不是喊口号，而是能执行。",
    highlight: "适合把增长问题拆成一组可执行动作。",
    ctaLabel: "做同款",
    sections: [
      {
        id: "breakthrough-plan",
        title: "破局路径",
        body: "先解决内容节奏，再解决私信承接，最后解决转化动作。",
      },
    ],
    outputs: [
      { id: "breakthrough-output", title: "增长动作清单", body: "1. 找出当前卡点\n2. 调整内容节奏\n3. 建立私信承接\n4. 每周复盘一次" },
    ],
  },
  {
    slug: "team-recruiting-case",
    appSlug: "team-recruit",
    title: "团队招募案例",
    summary: "从团队优势、适合人群和成长路径切入，写出可信的招募内容。",
    intro: "招募类内容不是喊人加入，而是把团队能给到的支持、机会和成长路径说清楚。",
    highlight: "适合用朋友圈、海报和私信三种方式同步输出。",
    ctaLabel: "做同款",
    sections: [
      {
        id: "team-recruit-outline",
        title: "招募结构",
        body: "团队亮点 -> 适合人群 -> 成长路径 -> 加入理由",
      },
    ],
    outputs: [
      { id: "team-recruit-output", title: "招募文案", body: "如果你正在找一个能带着你一起成长的团队，我们有训练、有陪跑、有真实案例，也有愿意一起打磨的氛围。" },
    ],
  },
  {
    slug: "live-script-plan",
    appSlug: "live-script",
    title: "直播流程稿案例",
    summary: "按主题、客群和目标拆出一版更完整的直播脚本。",
    intro: "直播类应用需要把主题、开场、承接和转化动作一起设计，保证节奏顺。",
    highlight: "适合先搭直播骨架，再填细节。",
    ctaLabel: "做同款",
    sections: [
      {
        id: "live-script-structure",
        title: "直播结构",
        body: "开场钩子 -> 问题拆解 -> 案例说明 -> 方案承接 -> 行动指令",
      },
    ],
    outputs: [
      { id: "live-script-output", title: "直播提纲", body: "今天先聊一个问题：为什么很多人买了保险，真正出事时还是会慌？\n\n接着拆三个常见误区，再给一套适合家庭落地的思路。" },
    ],
  },
  {
    slug: "general-content-case",
    appSlug: "general-content",
    title: "泛内容创作案例",
    summary: "把普通观点改写成更有共鸣、更适合破圈传播的文案。",
    intro: "更适合普通观点、分享型素材和不那么强销售的内容。",
    highlight: "重点是保留观点，同时让表达更顺。",
    ctaLabel: "做同款",
    sections: [
      {
        id: "general-content-angle",
        title: "表达气质",
        body: "更温柔、更锋利，或者更有故事感。",
      },
    ],
    outputs: [
      { id: "general-content-output", title: "改写后的内容", body: "内容不一定要很厉害，但要让人愿意停下来读完。\n\n最好的表达，是让别人觉得你说出了他心里那句话。" },
    ],
  },
  {
    slug: "wechat-images-case",
    appSlug: "wechat-images",
    title: "公众号配图案例",
    summary: "围绕公众号文稿生成一组适合阅读节奏的配图方案。",
    intro: "更强调公众号阅读场景，而不是单张海报感。",
    exampleType: "image",
    linkedExamples: ["wechat-images-case"],
    sections: [],
    outputs: [],
    imageResults: [
      {
        id: "wechat-images-result",
        title: "配图结果",
        imageUrl: "https://wenanpub.tos-cn-beijing.volces.com/nano_banana/1766201972_0_0.png",
        badge: "共 1 张",
        ratio: "3 / 4",
      },
    ],
  },
  {
    slug: "video-script-polish-case",
    appSlug: "video-script-polish",
    title: "口播文案精修案例",
    summary: "把已有底稿精修得更高级、更有节奏、更有流量。",
    intro: "适合已经有口播稿，只想做高级改稿和提效的场景。",
    highlight: "通过精修让开头更抓人、逻辑更顺、情绪更稳。",
    ctaLabel: "做同款",
    sections: [
      {
        id: "video-script-polish-view",
        title: "精修方向",
        body: "开头抓人、结构顺畅、情绪稳定、表达更像自己。",
      },
    ],
    outputs: [
      { id: "video-script-polish-output", title: "精修后的口播稿", body: "很多稿子不是不够专业，而是少了一个更容易开口的开头。\n\n把开头换成用户能听懂的话，整篇内容就会更顺。" },
    ],
  },
  {
    slug: "letter-case",
    appSlug: "letter",
    title: "走心一封信案例",
    summary: "围绕节日、周年、客户感谢和人生节点，写一封更有情绪价值的信。",
    intro: "这类内容的重点是情绪和温度，而不是堆信息。",
    highlight: "适合把祝福、提醒和感谢写得更像人话。",
    ctaLabel: "做同款",
    sections: [
      {
        id: "letter-scope",
        title: "适用场景",
        body: "节日祝福、周年感谢、客户回访、重要节点的温暖表达。",
      },
    ],
    outputs: [
      { id: "letter-output", title: "一封信", body: "谢谢你在这么多选择里，还是愿意认真听我把这件事讲完。\n\n我更希望这封信不是一次简单的问候，而是一次真正能让你安心的提醒。" },
    ],
  },
  {
    slug: "xiaohongshu-check-case",
    appSlug: "xiaohongshu-check",
    title: "小红书违规检测案例",
    summary: "检查小红书文案的潜在违规点，并给出更稳妥的改写建议。",
    intro: "这类应用更偏审核和修改建议，不是重新从零创作。",
    highlight: "适合在发布前做一次风险排查。",
    ctaLabel: "做同款",
    sections: [
      {
        id: "xiaohongshu-check-point",
        title: "检查重点",
        body: "夸大承诺、绝对化表达、敏感词、过度引导、违规营销。",
      },
    ],
    outputs: [
      { id: "xiaohongshu-check-output", title: "修改建议", body: "把绝对化表述改成更稳妥的表达，把风险提示和边界条件写清楚，会更安全。" },
    ],
  },
  {
    slug: "policy-diagnosis-case",
    appSlug: "policy-diagnosis",
    title: "保单架构诊断案例",
    summary: "根据保单信息输出结构诊断、风险提醒和优化建议。",
    intro: "先从结构上识别利益风险和配置缺口，再决定要不要动方案。",
    highlight: "适合先看结构，再看细节。",
    ctaLabel: "做同款",
    sections: [
      {
        id: "policy-diagnosis-structure",
        title: "诊断维度",
        body: "保障缺口、利益风险、结构重复、缴费压力、责任边界。",
      },
    ],
    outputs: [
      { id: "policy-diagnosis-output", title: "诊断摘要", body: "当前方案的核心不是有没有买，而是结构是否均衡、责任是否清晰、风险是否有重复或缺口。" },
    ],
  },
  {
    slug: "wechat-article-polish-case",
    appSlug: "wechat-article-polish",
    title: "公众号文章精修案例",
    summary: "把现有公众号文章精修得更有质感、更利于阅读和转发。",
    intro: "对于已有成稿的公众号内容，重点不是重写，而是让结构、语言和结尾更稳。",
    highlight: "适合把文章打磨到更适合发布的状态。",
    ctaLabel: "做同款",
    sections: [
      {
        id: "wechat-article-polish-goal",
        title: "优化目标",
        body: "标题更抓人、结构更顺、语言更有质感、结尾互动更自然。",
      },
    ],
    outputs: [
      { id: "wechat-article-polish-output", title: "精修后的文章", body: "好的公众号文章，不一定要每一段都用力，但每一段都要让人愿意继续读下去。" },
    ],
  },
  {
    slug: "lead-magnet-medical",
    appSlug: "lead-copy",
    title: "福利资料引流案例",
    summary: "围绕福利钩子与领取动作，生成评论和私信两种承接文案。",
    intro: "适合需要留资、私信或加微承接的内容场景，不只是写正文，也把下一步动作设计清楚。",
    linkedExamples: ["lead-copy-bridge", "lead-magnet-medical"],
    sections: [
      {
        title: "引流思路",
        body: "先把用户最关心的误区抛出来，再用福利包承接，把互动动作收束到评论或私信。",
      },
    ],
    outputs: [
      { title: "评论引导", body: "留言“清单”，我把高端医疗避坑表发你。" },
      { title: "私信引导", body: "私信“续保”，我给你看一版适合家庭预算的续保检查表。" },
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
  if (appSlug === "wechat-images") return "wechat-images";
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
