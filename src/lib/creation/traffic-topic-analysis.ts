import { runInsuranceContentAgent } from "@/lib/agent/insurance-agent";
import { buildLinkRemixResearchContext } from "@/lib/creation/link-remix-research";
import { buildRemixStudioSource } from "@/lib/creation/remix-studio-source";
import { runFastResearch } from "@/lib/workbuddy/fast-research";
import { buildTrafficEvidencePackFromFastResearch, buildTrafficTopicSearchQueries, formatTrafficEvidencePack } from "@/lib/creation/traffic-copy-evidence";
import { applyLocalTrafficTopicCoachRecommendations, applyTrafficTopicCoachRecommendations, buildTrafficTopicCoachRecommendationPrompt, buildTrafficTopicFastDecisionPrompt, parseTrafficTopicArena, parseTrafficTopicNewsroomInsight, type TrafficTopicCoachCard } from "@/lib/creation/traffic-topic-arena";
import { fallbackFastTopics } from "@/lib/creation/traffic-topic-fallback";
import { query } from "@/lib/db/client";

type TopicProgress = { phase:string;status:"active"|"completed";label:string;detail:string };

export async function runTrafficTopicAnalysis(input:{ slug:string;userId:string;values:Record<string,string|string[]>;onProgress?:(event:TopicProgress)=>void|Promise<void> }) {
  const source=input.slug==="link-remix"?buildRemixStudioSource(input.values):typeof input.values.source==="string"?input.values.source.trim():"";
  if(!source) throw new Error("请先填写热点素材或创作想法");

  await input.onProgress?.({phase:"topic_research",status:"active",label:"正在补充素材",detail:"搜索事件背景、人物、争议和已发生的结果。"});
  let research=input.slug==="link-remix"?await buildLinkRemixResearchContext(input.values).catch(()=>""):"";
  let evidencePack:Awaited<ReturnType<typeof buildTrafficEvidencePackFromFastResearch>>|null=null;
  try{const initialQueries=buildTrafficTopicSearchQueries(source);const fast=await runFastResearch({objective:`为流量获客选题寻找事实、争议和当前讨论：${source.slice(0,240)}`,context:`${source}\n\n检索角度按素材相关性覆盖：当前事件、历史背景、具体安排、人物说法或动机、争议观点、结果影响；不要为了凑数重复搜索。`,initialQueries,userId:input.userId,maxQueries:3,searchTimeoutMs:10_000});evidencePack=await buildTrafficEvidencePackFromFastResearch(source,fast);research=[research,formatTrafficEvidencePack(evidencePack)].filter(Boolean).join("\n\n");}catch{}
  await input.onProgress?.({phase:"topic_research",status:"completed",label:"素材补充完成",detail:"已形成本轮选题可共用的素材池。"});

  const insight=parseTrafficTopicNewsroomInsight("",source);
  await input.onProgress?.({phase:"topic_generation",status:"active",label:"正在生成5+1个选题",detail:"根据素材生成5个内容方向，并结合创作者分身生成1个IP定位题。"});
  let topics=[] as ReturnType<typeof parseTrafficTopicArena>;
  try{
    topics=parseTrafficTopicArena(await runInsuranceContentAgent([{role:"user",content:buildTrafficTopicFastDecisionPrompt({source,research})}],input.userId,"traffic",{creatorContextMode:"positioning",timeoutSeconds:180}),6);
  }catch{
    // Do not trigger three full background retries after the extended model
    // window is exhausted; return editable deterministic candidates instead.
    topics=fallbackFastTopics(source);
  }
  if(topics.length!==6)topics=fallbackFastTopics(source);
  if(topics.length!==6)throw new Error("本轮没有形成5个竞技场选题和1个定位保送题，请补充更具体的事件或完善个人定位后重试");
  await input.onProgress?.({phase:"topic_generation",status:"completed",label:"5+1个选题已完成",detail:"已生成5个素材型选题和1个IP定位题，可选择最多3个进入正文创作。"});
  await input.onProgress?.({phase:"coach_recommendation",status:"active",label:"正在匹配创作教练",detail:"根据每题的内容任务匹配教练，不重新干预选题。"});
  const coaches=await loadTrafficTopicCoachCards(input.userId);
  let usedLocalCoachFallback=false;
  try{
    const rawRecommendations=await runInsuranceContentAgent(
      [{role:"user",content:buildTrafficTopicCoachRecommendationPrompt({topics,coaches})}],
      input.userId,
      "traffic",
      {creatorContextMode:"none",timeoutSeconds:120},
    );
    topics=applyTrafficTopicCoachRecommendations(topics,rawRecommendations,coaches);
  }catch{
    topics=applyLocalTrafficTopicCoachRecommendations(topics,coaches);
    usedLocalCoachFallback=true;
  }
  await input.onProgress?.({phase:"coach_recommendation",status:"completed",label:usedLocalCoachFallback?"已使用快速教练匹配":"创作教练匹配完成",detail:usedLocalCoachFallback?"智能推荐暂未返回，已根据教练能力卡完成本地匹配，仍可手动更换。":"已为每个选题推荐正文创作教练，仍可手动更换。"});
  return{topics,insight,topicProcess:{version:6,mode:"topic_first_then_coach_match",insight,proposals:[],challenges:[],finalists:topics},coaches:coaches.map(({id,label,title,summary,scenarios,styleTags,bestFor})=>({id,label,title,summary,scenarios,styleTags,bestFor})),research,evidencePack};
}

async function loadTrafficTopicCoachCards(userId:string):Promise<TrafficTopicCoachCard[]> {
  type Row={id:string;name:string;identity_card:{title?:string;summary?:string;scenarios?:string[];styleTags?:string[];bestFor?:string}|null};
  const result=await query<Row>(
    `select versions.id,coaches.name,coaches.identity_card
       from creative_coach_versions versions
       join creative_coaches coaches on coaches.id=versions.coach_id
      where coaches.status='active' and versions.status in ('active','restored')
        and (coaches.is_system=true or coaches.coach_scope='platform' or (coaches.coach_scope='personal' and coaches.user_id=$1))
      order by case when coaches.is_system then 0 when coaches.coach_scope='personal' then 1 else 2 end,coaches.updated_at desc,versions.version desc
      limit 8`,
    [userId],
  ).catch(()=>({rows:[] as Row[]}));
  const cards=result.rows.map((row)=>({
    id:row.id,
    label:row.name,
    title:row.identity_card?.title||"创作教练",
    summary:row.identity_card?.summary||"",
    scenarios:Array.isArray(row.identity_card?.scenarios)?row.identity_card.scenarios.slice(0,6):[],
    styleTags:Array.isArray(row.identity_card?.styleTags)?row.identity_card.styleTags.slice(0,6):[],
    bestFor:row.identity_card?.bestFor||"",
  }));
  const system=cards.find((card)=>card.label.includes("小谷"));
  return [{id:"default",label:"小谷教练",title:system?.title||"专业内容基础教练",summary:system?.summary||"通用判断、内容结构和自然表达",scenarios:system?.scenarios||[],styleTags:system?.styleTags||[],bestFor:system?.bestFor||"通用内容创作"},...cards.filter((card)=>card!==system&&card.id!=="default")].slice(0,8);
}
