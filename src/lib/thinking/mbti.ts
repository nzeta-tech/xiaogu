export type MbtiDimension = "EI" | "SN" | "TF" | "JP";

export type MbtiQuestion = {
  id: string;
  dimension: MbtiDimension;
  prompt: string;
  leftLabel: string;
  rightLabel: string;
  direction?: 1 | -1;
};

export type MbtiDimensionResult = {
  left: string;
  right: string;
  leftPercent: number;
  rightPercent: number;
  strength: number;
};

export type MbtiResult = {
  type: string;
  confidence: number;
  completedQuestions: number;
  totalQuestions: number;
  instrument: "jungian-four-dimension-32";
  dimensions: Record<MbtiDimension, MbtiDimensionResult>;
  contentGuidance: string[];
};

export const mbtiScaleOptions = [
  { label: "非常偏左", value: "-2" },
  { label: "比较偏左", value: "-1" },
  { label: "难以判断", value: "0" },
  { label: "比较偏右", value: "1" },
  { label: "非常偏右", value: "2" },
];

// Original, non-diagnostic 32-item instrument based on Jungian four-dimension preferences.
// Half of each dimension is reverse-keyed to reduce agreement and position bias.
export const mbtiQuestions: MbtiQuestion[] = [
  { id: "mbti_ei_1", dimension: "EI", prompt: "结束一整天工作后，哪种方式更容易让你恢复精力？", leftLabel: "独处整理思绪", rightLabel: "和熟悉的人交流" },
  { id: "mbti_ei_2", dimension: "EI", prompt: "参加陌生活动时，你通常更接近哪种状态？", leftLabel: "主动认识他人", rightLabel: "先观察再加入", direction: -1 },
  { id: "mbti_ei_3", dimension: "EI", prompt: "形成观点时，你更习惯怎样推进？", leftLabel: "想清楚再表达", rightLabel: "边讨论边成形" },
  { id: "mbti_ei_4", dimension: "EI", prompt: "连续沟通很多人之后，你通常会怎样？", leftLabel: "仍想继续互动", rightLabel: "需要安静恢复", direction: -1 },
  { id: "mbti_ei_5", dimension: "EI", prompt: "需要解决复杂问题时，你更自然的起点是？", leftLabel: "先在心里独立推演", rightLabel: "先找人讨论碰撞" },
  { id: "mbti_ei_6", dimension: "EI", prompt: "在一群不熟悉的人中，你通常怎样参与？", leftLabel: "主动开启多个话题", rightLabel: "等熟悉后再深入交流", direction: -1 },
  { id: "mbti_ei_7", dimension: "EI", prompt: "你的注意力通常更容易放在哪里？", leftLabel: "内在想法与感受", rightLabel: "外部人和正在发生的事" },
  { id: "mbti_ei_8", dimension: "EI", prompt: "遇到值得分享的事情时，你更可能怎样？", leftLabel: "马上说给别人听", rightLabel: "先自己消化一段时间", direction: -1 },
  { id: "mbti_sn_1", dimension: "SN", prompt: "理解一个新概念时，哪类信息更有帮助？", leftLabel: "事实、步骤和案例", rightLabel: "原理、趋势和可能性" },
  { id: "mbti_sn_2", dimension: "SN", prompt: "复盘一次工作时，你更先关注什么？", leftLabel: "背后说明了什么", rightLabel: "具体发生了什么", direction: -1 },
  { id: "mbti_sn_3", dimension: "SN", prompt: "面对复杂材料时，你更擅长哪种处理？", leftLabel: "核对细节和证据", rightLabel: "提炼模式和框架" },
  { id: "mbti_sn_4", dimension: "SN", prompt: "描述一件事时，你更容易从哪里展开？", leftLabel: "意义、联系和想象", rightLabel: "时间、人物和具体经过", direction: -1 },
  { id: "mbti_sn_5", dimension: "SN", prompt: "学习一项新技能时，你更偏好什么？", leftLabel: "先跟着示范实际操作", rightLabel: "先理解整体模型" },
  { id: "mbti_sn_6", dimension: "SN", prompt: "面对成熟方法时，你更自然的反应是？", leftLabel: "设想还能怎样创新", rightLabel: "先按已验证步骤执行", direction: -1 },
  { id: "mbti_sn_7", dimension: "SN", prompt: "哪类信息更容易让你信服？", leftLabel: "可观察、可核验的事实", rightLabel: "多个事实呈现出的趋势" },
  { id: "mbti_sn_8", dimension: "SN", prompt: "思考未来时，你更常处于哪种状态？", leftLabel: "看到许多潜在可能", rightLabel: "关注最现实可行的路径", direction: -1 },
  { id: "mbti_tf_1", dimension: "TF", prompt: "需要做艰难决定时，你更先考虑什么？", leftLabel: "标准是否一致合理", rightLabel: "相关人的感受影响" },
  { id: "mbti_tf_2", dimension: "TF", prompt: "给别人反馈时，你更自然的方式是？", leftLabel: "先理解再给建议", rightLabel: "直接指出问题", direction: -1 },
  { id: "mbti_tf_3", dimension: "TF", prompt: "出现分歧时，什么更能说服你？", leftLabel: "证据与逻辑", rightLabel: "价值与具体处境" },
  { id: "mbti_tf_4", dimension: "TF", prompt: "评价一个方案时，你更先看什么？", leftLabel: "认同、关系和体验", rightLabel: "效率、规则和结果", direction: -1 },
  { id: "mbti_tf_5", dimension: "TF", prompt: "朋友遇到困境时，你更常提供什么？", leftLabel: "分析原因与解决方法", rightLabel: "理解情绪与陪伴支持" },
  { id: "mbti_tf_6", dimension: "TF", prompt: "规则与个体处境发生冲突时，你更倾向怎样？", leftLabel: "优先照顾具体处境", rightLabel: "优先保持标准一致", direction: -1 },
  { id: "mbti_tf_7", dimension: "TF", prompt: "判断一段论述时，你更敏感于什么？", leftLabel: "逻辑是否自洽", rightLabel: "是否尊重人的感受" },
  { id: "mbti_tf_8", dimension: "TF", prompt: "团队需要推进决定时，你更容易承担哪种角色？", leftLabel: "协调认同与关系", rightLabel: "澄清标准并做取舍", direction: -1 },
  { id: "mbti_jp_1", dimension: "JP", prompt: "开始一项任务前，你更喜欢怎样准备？", leftLabel: "先定计划和节点", rightLabel: "先行动再随时调整" },
  { id: "mbti_jp_2", dimension: "JP", prompt: "临时变化出现时，你通常更接近哪种反应？", leftLabel: "顺势探索新可能", rightLabel: "希望尽快恢复秩序", direction: -1 },
  { id: "mbti_jp_3", dimension: "JP", prompt: "管理待办事项时，什么状态让你更舒服？", leftLabel: "逐项完成并关闭", rightLabel: "保留多个开放选项" },
  { id: "mbti_jp_4", dimension: "JP", prompt: "旅行或休息日安排上，你更喜欢什么？", leftLabel: "保留空间临时决定", rightLabel: "提前确定主要安排", direction: -1 },
  { id: "mbti_jp_5", dimension: "JP", prompt: "临近截止时间时，你通常怎样？", leftLabel: "大部分工作已完成", rightLabel: "集中精力快速收尾" },
  { id: "mbti_jp_6", dimension: "JP", prompt: "面对几个都不错的选择时，你更自然的状态是？", leftLabel: "尽量晚些再做决定", rightLabel: "尽快选定并向前推进", direction: -1 },
  { id: "mbti_jp_7", dimension: "JP", prompt: "完成一件重要事情后，什么更让你放松？", leftLabel: "已经有明确结论和收尾", rightLabel: "仍可以继续调整优化" },
  { id: "mbti_jp_8", dimension: "JP", prompt: "日程突然空出半天时，你更可能怎样？", leftLabel: "根据当下兴趣决定", rightLabel: "很快安排具体事项", direction: -1 },
];

const dimensionPoles: Record<MbtiDimension, [string, string]> = {
  EI: ["I", "E"],
  SN: ["S", "N"],
  TF: ["T", "F"],
  JP: ["J", "P"],
};

export function calculateMbtiResult(values: Map<string, string>): MbtiResult {
  const scores = new Map<MbtiDimension, number>();
  const counts = new Map<MbtiDimension, number>();

  mbtiQuestions.forEach((question) => {
    const raw = Number(values.get(question.id));
    if (!Number.isFinite(raw)) return;
    scores.set(question.dimension, (scores.get(question.dimension) ?? 0) + Math.max(-2, Math.min(2, raw)) * (question.direction ?? 1));
    counts.set(question.dimension, (counts.get(question.dimension) ?? 0) + 1);
  });

  const dimensions = {} as Record<MbtiDimension, MbtiDimensionResult>;
  const letters: string[] = [];
  const strengths: number[] = [];

  (["EI", "SN", "TF", "JP"] as MbtiDimension[]).forEach((dimension) => {
    const [left, right] = dimensionPoles[dimension];
    const score = scores.get(dimension) ?? 0;
    const maxScore = Math.max(1, (counts.get(dimension) ?? 0) * 2);
    const normalized = score / maxScore;
    const rightPercent = Math.round(((normalized + 1) / 2) * 100);
    const strength = Math.round(Math.abs(normalized) * 100);
    dimensions[dimension] = { left, right, leftPercent: 100 - rightPercent, rightPercent, strength };
    letters.push(score === 0 ? "X" : score > 0 ? right : left);
    strengths.push(strength);
  });

  const completedQuestions = Array.from(counts.values()).reduce((sum, value) => sum + value, 0);
  const type = completedQuestions === 0 ? "未测" : letters.join("");
  return {
    type,
    confidence: Math.round((strengths.reduce((sum, value) => sum + value, 0) / strengths.length) * Math.min(1, completedQuestions / mbtiQuestions.length)),
    completedQuestions,
    totalQuestions: mbtiQuestions.length,
    instrument: "jungian-four-dimension-32",
    dimensions,
    contentGuidance: completedQuestions === 0 ? [] : buildMbtiContentGuidance(type),
  };
}

export function buildMbtiContentGuidance(type: string) {
  return [
    type.includes("I")
      ? "给用户留出先思考后表达的空间，适合深度稿、复盘和独立观点。"
      : type.includes("E") ? "适合对话感、问答、直播和具有现场互动感的表达。" : "内外向偏好接近，可在深度独白与互动表达之间灵活切换。",
    type.includes("S")
      ? "优先使用事实、步骤、真实场景和可核验细节。"
      : type.includes("N") ? "可以先提出框架、趋势与可能性，再补充具体证据。" : "事实细节与抽象框架的偏好接近，建议两种信息配合呈现。",
    type.includes("T")
      ? "论证应突出判断标准、因果关系和决策逻辑。"
      : type.includes("F") ? "表达应兼顾人的处境、感受与关系影响。" : "逻辑与感受权重接近，建议同时说明判断标准和人的处境。",
    type.includes("J")
      ? "内容结构宜清晰闭环，给出明确结论、步骤和行动节点。"
      : type.includes("P") ? "允许保留探索空间，可用多个视角和开放问题推动思考。" : "计划与开放偏好接近，可先给出主线，再保留调整空间。",
  ];
}
