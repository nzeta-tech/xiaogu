export type QuestionnaireItem = {
  content: string;
  input_type: "text";
};

export type QuestionnaireAnswerNode = {
  items: QuestionnaireItem[];
};

export type QuestionnaireAnswers = Record<string, Record<string, QuestionnaireAnswerNode>>;

export type QuestionnaireQuestionType = "textarea" | "text_or_voice" | "voice";

export type QuestionnaireQuestion = {
  question_id: string;
  question_text: string;
  helper_text: string;
  placeholder: string;
  input_type: QuestionnaireQuestionType;
  is_required: boolean;
  min_items?: number;
  max_total_duration?: number | null;
};

export type QuestionnaireSection = {
  section_id: string;
  section_title: string;
  section_description?: string;
  questions: QuestionnaireQuestion[];
};

export type QuestionnaireTemplate = {
  title: string;
  description: string;
  structure: {
    sections: QuestionnaireSection[];
  };
};

export const localQuestionnaireTemplate: QuestionnaireTemplate = {
  title: "我的思维画像问卷",
  description: "",
  structure: {
    sections: [
      {
        section_id: "1764945012678_usl9qr2k8",
        section_title: "个人信息",
        section_description: "认真完成问卷，小谷会帮你做一次系统的个人IP梳理",
        questions: [
          {
            question_id: "1764945046689_v4lusyj09",
            question_text: "姓名或IP称呼",
            helper_text: "",
            placeholder: "",
            input_type: "textarea",
            is_required: true,
            max_total_duration: 180,
          },
          {
            question_id: "1765020425848_qf4i4bjyl",
            question_text: "性别",
            helper_text: "",
            placeholder: "",
            input_type: "textarea",
            is_required: true,
            max_total_duration: 180,
          },
          {
            question_id: "1764945079553_zwzadou5l",
            question_text: "（选填）你的MBTI（16型人格）",
            helper_text: "",
            placeholder: "",
            input_type: "textarea",
            is_required: false,
            max_total_duration: 180,
          },
          {
            question_id: "1764945141627_nw9e6dhgh",
            question_text: "（选填）获得的荣誉、资质认证或重要活动参与经历（按重要性列1-5项）",
            helper_text: "如：MDRT，保费冠军，认证xxx规划师，财经节目特邀嘉宾",
            placeholder: "",
            input_type: "textarea",
            is_required: false,
            max_total_duration: 180,
          },
          {
            question_id: "1764945408081_9bqvdwrt4",
            question_text: "3-5个你身上的标签（自评/他评都行，越具体越好）",
            helper_text: "如：三娃宝妈、旅游达人、社牛、工作狂、话唠、暖男、细心",
            placeholder: "",
            input_type: "textarea",
            is_required: true,
            max_total_duration: 180,
          },
          {
            question_id: "1765020702852_ezm4w38oc",
            question_text: "简单介绍下职业路径",
            helper_text: "（例：xx大学xx专业→气象局xx职位→xx地产xx职位→xx保险）",
            placeholder: "",
            input_type: "textarea",
            is_required: false,
            max_total_duration: 600,
          },
        ],
      },
      {
        section_id: "Ky7Wx3",
        section_title: "第一部分：自媒体和内容现状",
        section_description: "请提供您的内容样本，帮助系统了解您的表达风格",
        questions: [
          {
            question_id: "1778811660899_z50qzcnww",
            question_text: "你做过哪些自媒体平台？目前是什么状态？",
            helper_text: "比如：「没做过」「刚起步几条没数据」「做过半年放弃了」「有变现了，但效率不高」",
            placeholder: "",
            input_type: "textarea",
            is_required: true,
            max_total_duration: 180,
          },
          {
            question_id: "Bm9Pq2",
            question_text: "（选填）最近3条朋友圈文案（每条之间用空行分隔）",
            helper_text: "只粘贴文字，不要粘图片！请提供至少 3条您最近发布的朋友圈文案，每条之间用空行分隔。",
            placeholder: "请输入朋友圈文案内容，每条之间用空行分隔...",
            input_type: "textarea",
            is_required: false,
            max_total_duration: null,
          },
          {
            question_id: "Xn4Rt7",
            question_text: "（选填）自己有代表性的口播文案",
            helper_text: "",
            placeholder: "可以输入文字或录音...",
            input_type: "textarea",
            is_required: false,
            max_total_duration: 180,
          },
          {
            question_id: "Lp2Yq9",
            question_text: "（选填）写过的一篇公众号文章",
            helper_text: "如果没有公众号文章，其他长文也可以",
            placeholder: "请粘贴文章全文，多篇文章用空行分隔...",
            input_type: "textarea",
            is_required: false,
            max_total_duration: null,
          },
          {
            question_id: "1778811775490_akg445pk1",
            question_text: "接下来你愿意每天拿出多少时间做内容？",
            helper_text: "如「30分钟」「1小时」",
            placeholder: "",
            input_type: "textarea",
            is_required: true,
            max_total_duration: 180,
          },
        ],
      },
      {
        section_id: "Uw6Dh8",
        section_title: "第二部分：客户洞察",
        section_description: "小谷更了解你和客户的关系",
        questions: [
          {
            question_id: "1778820351193_jya9d0yor",
            question_text: "你目前的赚钱方式？在这方面你有哪些优势？（可以语音详细说下）",
            helper_text: "比如：卖保险，同业知识付费，做团队等",
            placeholder: "",
            input_type: "text_or_voice",
            is_required: true,
            max_total_duration: 300,
          },
          {
            question_id: "Vn1Kg3",
            question_text: "你当前的客户大致是什么样的人？",
            helper_text: "提示：年龄段、职业类型、家庭状态、关心什么、为什么找你买单        ——讲你真实的客群，不用讲「理想客户」",
            placeholder: "请描述您的目标客户...",
            input_type: "textarea",
            is_required: true,
            max_total_duration: null,
          },
          {
            question_id: "Sx8Lm6",
            question_text: "客户或同事对你的评价原话（选填，2-3条，越具体越好）",
            helper_text: "",
            placeholder: "请分享客户或同事对您的评价...",
            input_type: "textarea",
            is_required: true,
            max_total_duration: null,
          },
          {
            question_id: "1778811879021_q2094ow72",
            question_text: "客户最常问你的1-3个问题？（原话最好）",
            helper_text: "",
            placeholder: "",
            input_type: "textarea",
            is_required: true,
            max_total_duration: 180,
          },
        ],
      },
      {
        section_id: "Qw8Vb4",
        section_title: "第三部分：思维模式深挖",
        section_description: "马上就要填完了~",
        questions: [
          {
            question_id: "Hg3Nx6",
            question_text: "这些年，你越来越相信的一件事是什么？",
            helper_text: "例如：关于保险、服务客户、专业态度、人生态度等方面",
            placeholder: "请描述您的核心信念...",
            input_type: "textarea",
            is_required: true,
            max_total_duration: null,
          },
          {
            question_id: "Jk7Pm2",
            question_text: "这些年，你越来越不信的一件事是什么？",
            helper_text: "",
            placeholder: "请描述您反对的做法...",
            input_type: "textarea",
            is_required: true,
            max_total_duration: null,
          },
        ],
      },
      {
        section_id: "Hn5Tp6",
        section_title: "第四部分：深度思维与表达",
        section_description: "以下问题请使用语音回答，录音时请放松自然地表达",
        questions: [
          {
            question_id: "Kq9Wm4",
            question_text: "说说你人生中最重要的1-3个转折点，它们怎么塑造了今天的你？",
            helper_text: "不要超过5分钟哦。",
            placeholder: "",
            input_type: "voice",
            is_required: true,
            max_total_duration: 300,
          },
          {
            question_id: "Vl3Bx7",
            question_text: "你最害怕什么？为了什么，你愿意克服这种恐惧？",
            helper_text: "放松自然地表达您的想法。",
            placeholder: "",
            input_type: "voice",
            is_required: true,
            max_total_duration: 300,
          },
          {
            question_id: "Rz8Pn2",
            question_text: "如果明天你有 1000 万，你会怎么花？如果只剩 1000 块，你会怎么活？",
            helper_text: "这个问题能反映您的价值观和生活态度。",
            placeholder: "",
            input_type: "voice",
            is_required: true,
            max_total_duration: 300,
          },
          {
            question_id: "Fs6Dq1",
            question_text: "讲一次你最惨的失败经历，你从中得到了什么？现在回看有什么不同的理解？",
            helper_text: "",
            placeholder: "",
            input_type: "voice",
            is_required: true,
            max_total_duration: 300,
          },
          {
            question_id: "Tc2Yh9",
            question_text: "面对重大选择时，你是跟着心走还是跟着脑走？举一个具体例子。",
            helper_text: "",
            placeholder: "",
            input_type: "voice",
            is_required: true,
            max_total_duration: 300,
          },
          {
            question_id: "Gm4Lx5",
            question_text: "身边最了解你的人，会怎么吐槽你？最近一次是谁吐槽了你什么？",
            helper_text: "",
            placeholder: "",
            input_type: "voice",
            is_required: true,
            max_total_duration: 300,
          },
          {
            question_id: "Nv7Kt3",
            question_text: "最近一两周，工作里有没有哪个瞬间到现在还记得？",
            helper_text:
              "可能是：跟一个客户的对话、路上的某个想法、一次泄气或兴奋的时刻、深夜还在跟进的某件事、跟家人聊到工作的一次对话……挑最容易想起来的那个讲。当时是什么场景、谁在场、说了什么做了什么、心里在想什么，讲细节，像跟朋友复述。",
            placeholder: "",
            input_type: "voice",
            is_required: true,
            max_total_duration: 300,
          },
          {
            question_id: "Jx5Rm6",
            question_text: "挑1-2个让你印象最深的客户故事讲讲。",
            helper_text: "不用包装，怎么发生的就怎么讲。他当初找你时遇到什么问题、你怎么处理的、后来怎么样了。可以脱敏不用真名。",
            placeholder: "",
            input_type: "voice",
            is_required: true,
            max_total_duration: 180,
          },
        ],
      },
    ],
  },
};

export function createEmptyQuestionnaireAnswers(template: QuestionnaireTemplate): QuestionnaireAnswers {
  const output: QuestionnaireAnswers = {};
  template.structure.sections.forEach((section) => {
    output[section.section_id] = {};
    section.questions.forEach((question) => {
      output[section.section_id][question.question_id] = { items: [{ content: "", input_type: "text" }] };
    });
  });
  return output;
}
