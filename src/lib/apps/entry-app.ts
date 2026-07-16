import type { CreationApp } from "@/lib/apps/catalog";

export function getEntryAdjustedApp(app: CreationApp, entry: string): CreationApp {
  if (app.slug === "write-copy" && entry === "voice-note-copy") {
    return {
      ...app,
      emoji: "🎙️",
      name: "录音稿拆解整理",
      description: "把学习、分享的录音稿拆成多个独立内容+金句，直接复制，即可创作内容",
      promptHint: "先忠实整理录音原意，再拆出可独立核验的观点片段、原话亮点和后续创作素材。",
      exampleTitle: undefined,
      fields: [
        {
          id: "tone",
          label: "表达倾向",
          type: "radio",
          required: true,
          options: [
            { label: "犀利洞察", value: "traffic" },
            { label: "温和共鸣", value: "trust" },
            { label: "类比思维", value: "self" },
            { label: "原汁原味（还原整理）", value: "raw" },
          ],
        },
        {
          id: "source",
          label: "创作素材",
          type: "text_or_file",
          required: true,
          placeholder: "请粘贴完整录音稿、学习分享逐字稿或聊天复盘内容",
          helper: "上传资料（文件暂只支持.txt, .docx, .pdf, .md，大小不超过10MB）",
        },
        {
          id: "targets",
          label: "生成类型",
          type: "multiselect",
          required: true,
          options: [
            { label: "口播稿x3", value: "video_script" },
            { label: "小红书x2", value: "xiaohongshu" },
            { label: "公众号x2", value: "wechat_article" },
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
      description: "只需上传候选人简历，就能生成一套完整的面试内容，包括：1、候选人画像，2、完整面试流程和话题，3、个性化欢迎、4、应急话术、5、注意事项、6、跟进内容",
      promptHint: "按增员面谈逐字稿的页面语义执行：基于候选人简历，输出候选人画像、完整面谈流程、欢迎话术、应急话术、注意事项和后续跟进建议。",
      exampleTitle: undefined,
      fields: [
        {
          id: "resume",
          label: "候选人简历",
          type: "text_or_file",
          required: true,
          placeholder: "请粘贴候选人简历、背景经历、转型动机，或直接上传简历文件",
          helper: "尽量补充工作经历、优势、顾虑和你最想重点聊的方向",
        },
        {
          id: "team_offer",
          label: "团队亮点",
          type: "textarea",
          required: true,
          placeholder: "例如培训体系、陪跑支持、客户资源、主打赛道、团队氛围",
        },
        {
          id: "focus",
          label: "本次面谈重点",
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
      description: "招募利器！上传和候选人的面谈录音文稿，得到《给ta的一封信》、《候选人信息跟踪表》、《跟踪计划表》、《一篇招募向公众号文章》",
      promptHint: "按增员跟踪页面执行：围绕候选人的沟通录音稿，提炼顾虑点、意向信号和下一步承接动作，再按所选类型输出一封信、候选人信息跟踪表、跟踪计划表和招募向公众号内容。",
      exampleTitle: undefined,
      fields: [
        {
          id: "followup_notes",
          label: "候选人沟通录音稿",
          type: "text_or_file",
          required: true,
          placeholder: "请粘贴和候选人的面谈录音稿、会议纪要或沟通复盘",
          helper: "越完整越好，方便系统提取顾虑点、兴趣点和下一步承接动作",
        },
        {
          id: "targets",
          label: "生成类型",
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
      description: "个性名片生成，人群之中记住你！只需上传个人介绍+照片，选风格即可~",
      requiresThinking: false,
      resultType: "image",
      promptHint: "围绕个人介绍、服务方向和目标人群，输出更适合传播和展示的个性名片内容。",
      exampleTitle: undefined,
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
          label: "上传形象照",
          type: "file",
          required: true,
          accept: "image/jpeg,image/png,image/webp",
          helper: "支持 JPG、PNG、WebP，建议使用清晰正面照。",
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

export function shouldShowRealExample(appSlug: string, entry: string) {
  if (entry === "voice-note-copy") return false;
  if (entry === "recruit-script" || entry === "recruit-followup") return false;
  if (entry === "personality-card") return false;
  if (appSlug === "lead-copy") return false;
  if (appSlug === "live-script") return false;
  if (appSlug === "xiaohongshu-check") return false;
  if (appSlug === "policy-diagnosis") return false;
  if (appSlug === "ip-positioning") return false;
  if (appSlug === "breakthrough") return false;
  if (appSlug === "team-recruit") return false;
  return true;
}
