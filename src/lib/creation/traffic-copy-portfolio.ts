import type { TrafficCopyCreativeBrief } from "@/lib/creation/traffic-copy-architecture";
import type { TrafficTopicCandidate } from "@/lib/creation/traffic-topic-arena";

export type TrafficPortfolioUnit = {
  topicId: string;
  contentRole: "traffic" | "trust" | "conversion" | "positioning";
  uniqueValue: string;
  exclusiveFocus: string;
  avoidRepeating: string[];
  recommendedFormat: string;
  targetSeconds: [number, number];
};

export type TrafficPortfolioPlan = { strategy: string; overlapWarnings: string[]; units: TrafficPortfolioUnit[] };

const clean = (value: unknown, limit = 500) => typeof value === "string" ? value.trim().slice(0, limit) : "";
const strings = (value: unknown, limit = 8) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").map((item)=>item.trim()).filter(Boolean).slice(0,limit) : [];

export function buildTrafficPortfolioPlanPrompt(topics: TrafficTopicCandidate[]) {
  return [
    "你是短视频内容组合主编。用户同时选择了多道题，在写作前先规划它们作为一组内容如何分工，避免每篇都从头复述同一套热点背景。不要写正文。",
    "为每题确定独家任务、不可替代的信息价值、建议内容形式与自然时长。热点纠偏和单一观点通常45-90秒，行动清单60-120秒，定位或专业机制内容90-180秒；只有确有多步因果需要时才可到240秒。时长不是硬凑字数，讲完独家任务就停止。",
    "同组题共享的背景只选一篇展开；其他篇最多一句交代。指出各篇不应重复的事实、解释或清单。如果两题实质相同，要明确提出合并或重构警告。",
    `【用户已选选题】\n${JSON.stringify(topics)}`,
    "严格JSON：{strategy,overlapWarnings:string[],units:[{topicId,contentRole:'traffic'|'trust'|'conversion'|'positioning',uniqueValue,exclusiveFocus,avoidRepeating:string[],recommendedFormat,targetSeconds:[min,max]}]}。每个选题恰好一项。",
  ].join("\n\n");
}

export function parseTrafficPortfolioPlan(raw: string, topics: TrafficTopicCandidate[]): TrafficPortfolioPlan {
  try {
    const value=JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0]??"{}") as Record<string,unknown>;
    const sourceUnits=Array.isArray(value.units)?value.units:[];
    const units=topics.map((topic,index)=>{
      const item=sourceUnits.find((candidate)=>candidate&&typeof candidate==="object"&&!Array.isArray(candidate)&&(candidate as Record<string,unknown>).topicId===topic.id) as Record<string,unknown>|undefined;
      const range=Array.isArray(item?.targetSeconds)?item.targetSeconds.map(Number):[];
      const min=Math.max(45,Math.min(180,Number.isFinite(range[0])?Math.round(range[0]):index===0?60:75));
      const max=Math.max(min,Math.min(240,Number.isFinite(range[1])?Math.round(range[1]):Math.min(180,min+60)));
      const role=clean(item?.contentRole,30);
      return{topicId:topic.id,contentRole:(["traffic","trust","conversion","positioning"].includes(role)?role:topic.selectionRole==="positioning_wildcard"?"positioning":index===0?"traffic":"trust") as TrafficPortfolioUnit["contentRole"],uniqueValue:clean(item?.uniqueValue)||topic.answerPayoff,exclusiveFocus:clean(item?.exclusiveFocus)||topic.coreQuestion,avoidRepeating:strings(item?.avoidRepeating),recommendedFormat:clean(item?.recommendedFormat,100)||"视频号口播",targetSeconds:[min,max] as [number,number]};
    });
    return{strategy:clean(value.strategy,800),overlapWarnings:strings(value.overlapWarnings,12),units};
  }catch{return{strategy:"每篇只完成自己的核心问题，避免重复铺陈热点背景。",overlapWarnings:[],units:topics.map((topic,index)=>({topicId:topic.id,contentRole:topic.selectionRole==="positioning_wildcard"?"positioning":index===0?"traffic":"trust",uniqueValue:topic.answerPayoff,exclusiveFocus:topic.coreQuestion,avoidRepeating:[],recommendedFormat:"视频号口播",targetSeconds:topic.selectionRole==="positioning_wildcard"?[90,180]:[60,120]}))};}
}

export function portfolioUnitContext(plan: TrafficPortfolioPlan | null, topicId: string) {
  const unit=plan?.units.find((item)=>item.topicId===topicId);
  if(!unit)return"";
  return [`【本批次内容分工】`, `本篇角色：${unit.contentRole}`, `独家价值：${unit.uniqueValue}`, `只聚焦：${unit.exclusiveFocus}`, unit.avoidRepeating.length?`避免与同批次其他篇重复：${unit.avoidRepeating.join("；")}`:"", `建议形式：${unit.recommendedFormat}`, `自然时长：${unit.targetSeconds[0]}-${unit.targetSeconds[1]}秒，讲完即停`].filter(Boolean).join("\n");
}

export function applyPortfolioDuration(brief: TrafficCopyCreativeBrief, unit: TrafficPortfolioUnit | undefined): TrafficCopyCreativeBrief {
  if(!unit)return brief;
  const rate=brief.durationBasis.reasoningSteps>=4||brief.durationBasis.evidenceUnits>=4?225:250;
  const preferredCharacters:[number,number]=[Math.round(unit.targetSeconds[0]*rate/60),Math.round(unit.targetSeconds[1]*rate/60)];
  return{...brief,durationRange:{preferredSeconds:unit.targetSeconds,preferredCharacters},targetSeconds:Math.round((unit.targetSeconds[0]+unit.targetSeconds[1])/2),targetCharacters:Math.round((preferredCharacters[0]+preferredCharacters[1])/2),durationRationale:`按本批次分工在 ${unit.targetSeconds[0]}-${unit.targetSeconds[1]} 秒内完成“${unit.exclusiveFocus}”，不重复其他篇背景。`};
}
