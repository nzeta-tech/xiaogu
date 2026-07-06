export type ThinkingQuestion = {
  id: string;
  label: string;
  placeholder: string;
  helper: string;
};

export const thinkingQuestions: ThinkingQuestion[] = [
  {
    id: "persona",
    label: "你希望客户记住你是谁？",
    placeholder: "例如：专业克制、擅长讲清家庭保障和养老规划，不靠焦虑成交。",
    helper: "这会影响后续应用的人设定位、语气和内容判断。",
  },
  {
    id: "targetAudience",
    label: "你的目标客户是谁？",
    placeholder: "例如：30-45 岁中产家庭、宝妈家庭、企业主、医生群体。",
    helper: "尽量写清年龄、身份、生活状态、资产阶段和真实痛点。",
  },
  {
    id: "specialty",
    label: "你擅长解决什么问题？",
    placeholder: "例如：医疗险配置、重疾险取舍、养老现金流、企业主风险隔离。",
    helper: "这会影响选题、案例和专业表达的优先级。",
  },
  {
    id: "topicPreference",
    label: "你喜欢怎样表达？",
    placeholder: "例如：像朋友聊天、理性克制、案例驱动、有温度但不煽情。",
    helper: "系统会据此提纯你的写作风格，让文案更像你本人。",
  },
];

export function computeThinkingProfileSummary(input: {
  persona: string;
  targetAudience: string;
  specialty: string;
  topicPreference: string;
}) {
  const completedCount = [input.persona, input.targetAudience, input.specialty, input.topicPreference]
    .filter((value) => value.trim().length >= 6)
    .length;

  const completion = Math.round((completedCount / thinkingQuestions.length) * 100);
  const ready = completedCount >= 3;
  const styleSummary = [
    `人设：${input.persona || "未填写"}`,
    `客群：${input.targetAudience || "未填写"}`,
    `解决问题：${input.specialty || "未填写"}`,
    `表达风格：${input.topicPreference || "未填写"}`,
  ].join("\n");

  return {
    ready,
    completion,
    styleSummary,
    completedCount,
    totalCount: thinkingQuestions.length,
  };
}
