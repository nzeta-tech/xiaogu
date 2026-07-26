import type { CreationApp } from "@/lib/apps/catalog";

export function getEntryAdjustedApp(app: CreationApp, entry: string): CreationApp {
  if (app.slug === "write-copy" && entry === "voice-note-copy") {
    return {
      ...app,
      emoji: "🎙️",
      name: "录音转文字素材",
      description: "把完整录音逐字稿整理成清晰观点、可引用金句和适合不同平台发布的内容。",
      promptHint: "先忠实整理录音原意，再拆出可独立核验的观点片段、原话亮点和后续创作素材。",
      fields: [
        {
          id: "tone",
          label: "整理后想保留什么感觉",
          type: "radio",
          required: true,
          options: [
            { label: "观点鲜明", value: "traffic" },
            { label: "温和共情", value: "trust" },
            { label: "自然口语", value: "self" },
            { label: "尽量保留原话", value: "raw" },
          ],
        },
        {
          id: "source",
          label: "粘贴完整录音稿",
          type: "text_or_file",
          required: true,
          placeholder: "请粘贴完整录音稿、学习分享逐字稿或聊天复盘内容",
          helper: "可上传 TXT、DOCX、PDF 或 Markdown 文件，单个文件不超过 10MB。",
        },
        {
          id: "targets",
          label: "选择要整理成什么内容",
          type: "multiselect",
          required: true,
          options: [
            { label: "口播稿（3篇）", value: "video_script" },
            { label: "小红书（2篇）", value: "xiaohongshu" },
            { label: "公众号（2篇）", value: "wechat_article" },
          ],
        },
      ],
    };
  }

  if (app.slug === "team-recruit" && entry === "recruit-script") {
    return {
      ...app,
      emoji: "📋",
      name: "增员面谈逐字稿",
      description: "根据候选人简历和团队优势，准备人物画像、面谈流程、关键问题与后续跟进话术。",
      promptHint: "按增员面谈逐字稿的页面语义执行：基于候选人简历，输出候选人画像、完整面谈流程、欢迎话术、应急话术、注意事项和后续跟进建议。",
      fields: [
        {
          id: "resume",
          label: "候选人简历",
          type: "text_or_file",
          required: true,
          placeholder: "请粘贴候选人简历、背景经历、转型动机，或直接上传简历文件",
          helper: "请先删除身份证号、住址等非必要敏感信息。工作经历、转型动机和顾虑越完整，面谈准备越具体。",
        },
        {
          id: "team_offer",
          label: "团队能为候选人提供什么",
          type: "textarea",
          required: true,
          placeholder: "例如培训体系、陪跑支持、客户资源、主打赛道、团队氛围",
        },
        {
          id: "focus",
          label: "这次最想确认什么（可选）",
          type: "textarea",
          placeholder: "例如重点判断稳定性、沟通转化能力、是否适合长期培养",
        },
      ],
    };
  }

  if (app.slug === "team-recruit" && entry === "recruit-followup") {
    return {
      ...app,
      emoji: "🌱",
      name: "增员跟踪",
      description: "分析候选人的面谈记录，梳理意向、顾虑和下一步动作，并生成持续跟进所需内容。",
      promptHint: "按增员跟踪页面执行：围绕候选人的沟通录音稿，提炼顾虑点、意向信号和下一步承接动作，再按所选类型输出一封信、候选人信息跟踪表、跟踪计划表和招募向公众号内容。",
      fields: [
        {
          id: "followup_notes",
          label: "粘贴候选人面谈记录",
          type: "text_or_file",
          required: true,
          placeholder: "请粘贴和候选人的面谈录音稿、会议纪要或沟通复盘",
          helper: "请先删除电话、身份证号等非必要敏感信息；保留候选人的原话和上下文。",
        },
        {
          id: "targets",
          label: "选择需要的跟进内容",
          type: "multiselect",
          required: true,
          options: [
            { label: "一封信", value: "letter" },
            { label: "跟踪表", value: "tracker" },
            { label: "公众号", value: "wechat_article" },
          ],
        },
      ],
    };
  }

  if (app.slug === "ip-positioning" && entry === "personality-card") {
    return {
      ...app,
      name: "个性名片",
      description: "把个人介绍、服务对象和形象照整理成一张清晰、易传播的个人名片。",
      requiresThinking: false,
      resultType: "image",
      promptHint: "围绕个人介绍、服务方向和目标人群，输出更适合传播和展示的个性名片内容。",
      fields: [
        {
          id: "current_state",
          label: "个人介绍",
          type: "textarea",
          required: true,
          placeholder: "请介绍你是谁、服务谁、擅长什么、最希望别人记住你的哪一点",
        },
        {
          id: "target_client",
          label: "想吸引的人群",
          type: "text",
          required: true,
          placeholder: "例如宝妈家庭、高净值客户、企业主、自由职业者",
        },
        {
          id: "style",
          label: "名片风格",
          type: "radio",
          required: true,
          options: [
            { label: "专业简洁", value: "professional" },
            { label: "温暖亲和", value: "warm" },
            { label: "现代杂志", value: "editorial" },
          ],
        },
        {
          id: "reference_image",
          label: "临时上传形象照（可选）",
          type: "file",
          accept: "image/jpeg,image/png,image/webp",
          helper: "优先使用数字分身形象库；也可以只为本次任务临时上传。",
        },
        {
          id: "ratio",
          label: "名片比例",
          type: "radio",
          required: true,
          options: [
            { label: "3:4 竖版", value: "3:4" },
            { label: "1:1 方形", value: "1:1" },
            { label: "16:9 横版", value: "16:9" },
          ],
        },
      ],
    };
  }

  return app;
}
