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
    "为每题确定独家任务、不可替代的信息价值、建议内容形式与自然时长。视频号口播需要把观点、机制和对用户的启发讲完整：热点纠偏、单一观点和行动清单通常120-210秒，定位或专业机制内容150-240秒。时长不是硬凑字数，完成独家任务和必要推理后再停止。",
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
      const min=Math.max(topic.selectionRole==="positioning_wildcard"?150:120,Math.min(210,Number.isFinite(range[0])?Math.round(range[0]):topic.selectionRole==="positioning_wildcard"?150:120));
      const proposedMax=Number.isFinite(range[1])?Math.round(range[1]):min+60;
      const max=Math.min(240,Math.max(min+45,proposedMax));
      const role=clean(item?.contentRole,30);
      return{topicId:topic.id,contentRole:(["traffic","trust","conversion","positioning"].includes(role)?role:topic.selectionRole==="positioning_wildcard"?"positioning":index===0?"traffic":"trust") as TrafficPortfolioUnit["contentRole"],uniqueValue:clean(item?.uniqueValue)||topic.answerPayoff,exclusiveFocus:clean(item?.exclusiveFocus)||topic.coreQuestion,avoidRepeating:strings(item?.avoidRepeating),recommendedFormat:clean(item?.recommendedFormat,100)||"视频号口播",targetSeconds:[min,max] as [number,number]};
    });
    return{strategy:clean(value.strategy,800),overlapWarnings:strings(value.overlapWarnings,12),units};
  }catch{return{strategy:"每篇只完成自己的核心问题，避免重复铺陈热点背景。",overlapWarnings:[],units:topics.map((topic,index)=>({topicId:topic.id,contentRole:topic.selectionRole==="positioning_wildcard"?"positioning":index===0?"traffic":"trust",uniqueValue:topic.answerPayoff,exclusiveFocus:topic.coreQuestion,avoidRepeating:[],recommendedFormat:"视频号口播",targetSeconds:topic.selectionRole==="positioning_wildcard"?[150,240]:[120,210]}))};}
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

export function requestedTrafficDurationSeconds(text: string): number | null {
  const minutes = text.match(/(\d+(?:\.\d+)?)\s*(?:分钟|分(?:钟)?)(?:左右|上下|的)?(?:口播|文案|正文|稿)?/);
  if (minutes) return Math.min(600, Math.max(60, Math.round(Number(minutes[1]) * 60)));
  const seconds = text.match(/(\d{2,4})\s*秒(?:钟)?(?:左右|上下|的)?(?:口播|文案|正文|稿)?/);
  return seconds ? Math.min(600, Math.max(60, Math.round(Number(seconds[1])))) : null;
}

export function applyRequestedTrafficDuration(brief: TrafficCopyCreativeBrief, text: string): TrafficCopyCreativeBrief {
  const requested = requestedTrafficDurationSeconds(text);
  if (!requested) return brief;
  const preferredSeconds: [number, number] = [Math.max(60, requested - 15), Math.min(600, requested + 15)];
  const rate = brief.durationBasis.reasoningSteps >= 4 || brief.durationBasis.evidenceUnits >= 4 ? 225 : 250;
  const preferredCharacters: [number, number] = preferredSeconds.map(seconds => Math.round(seconds * rate / 60)) as [number, number];
  return { ...brief, durationRange: { preferredSeconds, preferredCharacters }, targetSeconds: requested, targetCharacters: Math.round(requested * rate / 60), durationRationale: `用户明确要求每篇约 ${requested} 秒，正文应完整展开至 ${preferredSeconds[0]}-${preferredSeconds[1]} 秒，不得沿用默认短稿时长。` };
}
