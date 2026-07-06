import type { HotTopic } from "./types";

export const seedTopics: HotTopic[] = [
  {
    id: "delay-retirement",
    title: "延迟退休讨论升温",
    summary: "普通家庭对养老现金流、退休年龄和长期规划的讨论增加。",
    source: "本地保险选题库",
    heat: "高",
    category: "养老",
    insuranceRelevance: "高",
    recommendedAngle: "从普通家庭如何提前准备养老现金流切入，讲清社保养老与商业养老的互补关系。",
    riskNote: "避免制造政策恐慌，不承诺年金或增额寿收益。",
  },
  {
    id: "young-health-check",
    title: "年轻人体检异常增多",
    summary: "结节、脂肪肝、尿酸高等体检异常频繁出现在年轻人讨论中。",
    source: "本地保险选题库",
    heat: "高",
    category: "健康",
    insuranceRelevance: "高",
    recommendedAngle: "从体检异常如何影响投保与核保切入，强调趁健康时做风险规划。",
    riskNote: "不要暗示有异常就一定买不了保险，具体以核保结论为准。",
  },
  {
    id: "medical-insurance-reform",
    title: "医保改革讨论升温",
    summary: "医保支付、目录调整、用药报销等讨论带动商业医疗保障认知。",
    source: "本地保险选题库",
    heat: "中",
    category: "医疗",
    insuranceRelevance: "高",
    recommendedAngle: "讲清医保和商保各自解决什么，不把医保说得一无是处。",
    riskNote: "涉及政策解读，表达需客观，避免绝对化结论。",
  },
];
