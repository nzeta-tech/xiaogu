import { mbtiQuestions, mbtiScaleOptions } from "./mbti";

export type QuestionnaireItem = {
  content: string;
  input_type: "text";
};

export type QuestionnaireAnswerNode = {
  items: QuestionnaireItem[];
};

export type QuestionnaireAnswers = Record<string, Record<string, QuestionnaireAnswerNode>>;

export type QuestionnaireQuestionType = "textarea" | "text_or_voice" | "voice" | "choice";

export type QuestionnaireQuestion = {
  question_id: string;
  question_text: string;
  helper_text: string;
  placeholder: string;
  input_type: QuestionnaireQuestionType;
  is_required: boolean;
  min_items?: number;
  max_total_duration?: number | null;
  options?: Array<{ label: string; value: string }>;
  choice_labels?: { left: string; right: string };
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
  structure: { sections: QuestionnaireSection[] };
};

const textQuestion = (
  question_id: string,
  question_text: string,
  helper_text: string,
  placeholder: string,
  is_required = true,
): QuestionnaireQuestion => ({
  question_id,
  question_text,
  helper_text,
  placeholder,
  input_type: "textarea",
  is_required,
  max_total_duration: null,
});

export const localQuestionnaireTemplate: QuestionnaireTemplate = {
  title: "数字分身人设问卷",
  description: "用真实经历、受众洞察、表达习惯和 MBTI 偏好建立可持续更新的人设画像。",
  structure: {
    sections: [
      {
        section_id: "identity",
        section_title: "身份与经历",
        section_description: "先说明你是谁，以及哪些经历构成了你的专业可信度。",
        questions: [
          textQuestion("display_name", "希望数字分身如何称呼你？", "可以是真名、昵称或稳定使用的 IP 名称。", "例如：林姐说保障"),
          textQuestion("role_context", "你目前主要以什么身份工作和生活？", "写出职业角色，也可以补充家庭角色、城市或人生阶段。", "例如：独立保险经纪人、两个孩子的妈妈、长期服务新中产家庭"),
          textQuestion("career_path", "哪些关键经历把你带到今天？", "不必写完整简历，重点说明转折、选择及其影响。", "按时间或转折点描述你的职业路径"),
          textQuestion("credentials", "哪些事实能够证明你的专业与可靠？", "可填写资质、年限、项目成果、客户反馈或可核验经历。", "列出 1-5 项具体事实", false),
          textQuestion("identity_tags", "别人通常会用哪些词描述你？", "优先填写带有行为证据的标签，而不是宽泛形容词。", "例如：解释复杂问题很耐心、做方案会反复核对细节"),
          textQuestion("turning_points", "分享一段最能解释你价值观的真实经历。", "说明发生了什么、你做了什么，以及这件事如何改变了你。", "一段具体故事即可", false),
        ],
      },
      {
        section_id: "audience",
        section_title: "受众与专业",
        section_description: "明确你真正服务的人、他们的问题，以及他们信任你的原因。",
        questions: [
          textQuestion("primary_audience", "你目前最常服务的是哪类人？", "描述真实客户，而不是想象中的理想客群。", "可写年龄、职业、家庭阶段、所在城市及关注事项"),
          textQuestion("common_questions", "他们最常向你提出哪些问题？", "尽量保留客户的原话，每行一个问题。", "列出 3-5 个高频问题"),
          textQuestion("client_pains", "这些问题背后真正的顾虑是什么？", "区分表面问题与决策障碍，例如信息不对称、预算压力或家庭意见。", "描述最常见的顾虑和卡点"),
          textQuestion("specialty", "你最擅长解决哪些具体问题？", "写出你的方法、判断标准或服务优势。", "例如：把复杂保单翻译成家庭能共同讨论的方案"),
          textQuestion("trust_evidence", "客户为什么愿意相信并选择你？", "可填写评价原话、复购转介绍原因或代表性服务片段。", "列出具体证据，避免只写“专业、负责”"),
          textQuestion("case_stories", "分享 1-2 个可以脱敏使用的客户故事。", "说明起因、你的处理方式和结果，不写无法核验的数据。", "每个故事用一段话描述", false),
        ],
      },
      {
        section_id: "voice",
        section_title: "表达与边界",
        section_description: "让数字分身知道你会怎样说，也知道哪些话不该替你说。",
        questions: [
          textQuestion("content_status", "你目前在哪些平台创作，处于什么阶段？", "没有开始也可以如实填写。", "例如：朋友圈稳定更新，公众号刚起步，暂未做短视频"),
          textQuestion("content_sample", "粘贴一段最像你的内容样本。", "可以是朋友圈、口播、文章或与客户沟通的文字，建议 100-800 字。", "粘贴一段你认可的原始表达", false),
          textQuestion("tone_preference", "你希望内容给人怎样的感受？", "同时说明你喜欢和不喜欢的表达方式。", "例如：冷静但不疏离；有判断，不说教"),
          textQuestion("core_beliefs", "在专业服务和长期经营上，你坚持什么？", "填写你会长期捍卫的判断或原则。", "列出 2-4 条核心信念"),
          textQuestion("boundaries", "有哪些观点、承诺或表达方式绝不能代表你？", "这部分会直接作为 AI 创作边界。", "例如：不制造焦虑、不承诺收益、不虚构案例"),
          textQuestion("time_budget", "你每周能投入多少时间做内容？", "填写现实可执行的节奏。", "例如：每周 3 次，每次 40 分钟"),
        ],
      },
      {
        section_id: "mbti",
        section_title: "MBTI 偏好测试",
        section_description: "请选择更接近你日常状态的一侧。结果用于调整数字分身的表达方式，不作为心理诊断。",
        questions: mbtiQuestions.map((question) => ({
          question_id: question.id,
          question_text: question.prompt,
          helper_text: "",
          placeholder: "",
          input_type: "choice" as const,
          is_required: true,
          options: mbtiScaleOptions,
          choice_labels: { left: question.leftLabel, right: question.rightLabel },
        })),
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
