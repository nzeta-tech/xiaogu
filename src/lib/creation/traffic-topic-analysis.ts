import { runInsuranceContentAgent } from "@/lib/agent/insurance-agent";
import { resolveCreativeCoachRuntime, renderCreativeCoachSkill } from "@/lib/avatar/creative-coach-runtime";
import { buildLinkRemixResearchContext } from "@/lib/creation/link-remix-research";
import { buildRemixStudioSource } from "@/lib/creation/remix-studio-source";
import { runFastResearch } from "@/lib/workbuddy/fast-research";
import { buildTrafficEvidencePackFromFastResearch, formatTrafficEvidencePack } from "@/lib/creation/traffic-copy-evidence";
import { buildTrafficTopicDecisionPrompt, buildTrafficTopicNewsroomInsightPrompt, buildTrafficTopicProposalPrompt, buildTrafficTopicReviewPrompt, parseTrafficTopicArena, parseTrafficTopicChallenges, parseTrafficTopicNewsroomInsight } from "@/lib/creation/traffic-topic-arena";

type TopicProgress = { phase:string;status:"active"|"completed";label:string;detail:string };

export async function runTrafficTopicAnalysis(input:{ slug:string;userId:string;values:Record<string,string|string[]>;onProgress?:(event:TopicProgress)=>void|Promise<void> }) {
  const source=input.slug==="link-remix"?buildRemixStudioSource(input.values):typeof input.values.source==="string"?input.values.source.trim():"";
  if(!source) throw new Error("请先填写热点素材或创作想法");
  const ids=[...new Set((Array.isArray(input.values.traffic_arena_coach_version_ids)?input.values.traffic_arena_coach_version_ids:["default"]).filter(Boolean))].slice(0,8);
  const runtimes=await Promise.all(ids.filter((id)=>id!=="default").map((id)=>resolveCreativeCoachRuntime(input.userId,id)));
  const coaches=ids.flatMap((id)=>{if(id==="default")return[{id,label:"小谷教练",skill:""}];const runtime=runtimes.find((item)=>item?.id===id);return runtime?[{id,label:runtime.label,skill:renderCreativeCoachSkill(runtime,"research")}]:[];});
  if(!coaches.length)coaches.push({id:"default",label:"小谷教练",skill:""});

  await input.onProgress?.({phase:"topic_research",status:"active",label:"正在补充素材",detail:"搜索事件背景、人物、争议和已发生的结果。"});
  let research=input.slug==="link-remix"?await buildLinkRemixResearchContext(input.values).catch(()=>""):"";
  let evidencePack:Awaited<ReturnType<typeof buildTrafficEvidencePackFromFastResearch>>|null=null;
  try{const fast=await runFastResearch({objective:`为流量获客选题寻找事实、争议和当前讨论：${source.slice(0,240)}`,context:`${source}\n\n检索角度按素材相关性覆盖：当前事件、历史背景、具体安排、人物说法或动机、争议观点、结果影响；不要为了凑数重复搜索。`,userId:input.userId,maxQueries:6});evidencePack=await buildTrafficEvidencePackFromFastResearch(source,fast);research=[research,formatTrafficEvidencePack(evidencePack)].filter(Boolean).join("\n\n");}catch{}
  await input.onProgress?.({phase:"topic_research",status:"completed",label:"素材补充完成",detail:"已形成本轮选题可共用的素材池。"});

  await input.onProgress?.({phase:"topic_understanding",status:"active",label:"正在理解素材",detail:"独立编辑正在寻找表面答案之外仍值得追问的问题。"});
  let insight=parseTrafficTopicNewsroomInsight("",source);
  try{insight=parseTrafficTopicNewsroomInsight(await runInsuranceContentAgent([{role:"user",content:buildTrafficTopicNewsroomInsightPrompt({source,research})}],input.userId,"traffic",{creatorContextMode:"none"}),source);}catch{}
  await input.onProgress?.({phase:"topic_understanding",status:"completed",label:"素材理解完成",detail:"编辑备忘已经形成。"});

  await input.onProgress?.({phase:"topic_proposals",status:"active",label:"正在提出候选方向",detail:"提案编辑独立生成12个不同的内容命题。"});
  const proposals=parseTrafficTopicArena(await runInsuranceContentAgent([{role:"user",content:buildTrafficTopicProposalPrompt({source,research,insight})}],input.userId,"traffic",{creatorContextMode:"none"}),12);
  if(proposals.length<8)throw new Error("本轮没有形成足够多的原始方向，请补充更具体的事件、人物或观点后重试");
  await input.onProgress?.({phase:"topic_proposals",status:"completed",label:"12个方向已形成",detail:"候选将交给独立反方编辑，不沿用提案者自评。"});

  await input.onProgress?.({phase:"topic_challenge",status:"active",label:"正在独立盲审",detail:"反方编辑正在淘汰可猜、空泛或无法兑现的方向。"});
  const challenges=parseTrafficTopicChallenges(await runInsuranceContentAgent([{role:"user",content:buildTrafficTopicReviewPrompt({source,proposals})}],input.userId,"traffic",{creatorContextMode:"none"}));
  const reviewedIds=new Set(challenges.map((item)=>item.candidateId));
  if(proposals.some((item)=>!reviewedIds.has(item.id)))throw new Error("独立反方评审没有完成，请重新分析选题");
  await input.onProgress?.({phase:"topic_challenge",status:"completed",label:"独立盲审完成",detail:"每个候选均已获得保留、重构或淘汰判断。"});

  await input.onProgress?.({phase:"topic_decision",status:"active",label:"正在决选5+1个选题",detail:"最终主编正在决出5个竞技场选题，并根据数字分身个人定位生成第6个保送题。"});
  const topics=parseTrafficTopicArena(await runInsuranceContentAgent([{role:"user",content:buildTrafficTopicDecisionPrompt({source,insight,proposals,challenges,coaches})}],input.userId,"traffic",{creatorContextMode:"positioning"}),6);
  if(topics.length!==6)throw new Error("本轮没有形成5个竞技场选题和1个定位保送题，请补充更具体的事件或完善个人定位后重试");
  await input.onProgress?.({phase:"topic_decision",status:"completed",label:"6个推荐选题已完成",detail:"已形成5个竞技场胜出题和1个个人定位保送题，可选择最多3个进入正文创作。"});
  return{topics,insight,topicProcess:{version:3,insight,proposals,challenges,finalists:topics},coaches:coaches.map(({id,label})=>({id,label})),research,evidencePack};
}
