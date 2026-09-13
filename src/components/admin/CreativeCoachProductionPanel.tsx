"use client";

import { type FormEvent, useEffect, useState } from "react";
import { apiPath } from "@/lib/client/url";

type CoachVersion = { id:string;version:number;status:string;sampleCount:number;phase:string;qualityPassed:boolean;changeSummary:string;createdAt:string };
type Coach = { id:string; name:string; creator_name:string; coach_scope:"personal"|"platform"; status:"active"|"archived"; latest_version:number; identity_card:{title?:string;summary?:string;scenarios?:string[];styleTags?:string[];bestFor?:string;sourceCreator?:string}; versions:CoachVersion[]; sample_count:number; capabilities:string[]; source_count:number; change_summary:string; ip_positioning_prompt:string; content_creation_prompt:string; growth_prompt:string; content_skill_id:string|null; growth_skill_id:string|null };
type Attempt = { link?:string; title?:string; status?:string; stage?:string; message?:string };
type TrainingRun = { id:string; skill_name:string; training_purpose:"content"|"lead-coach"; status:"running"|"succeeded"|"failed"; phase:string; total_count:number; completed_count:number; successful_count:number; error_message:string; updated_at:string; queued_count:number; running_count:number; failed_count:number; attempts:Attempt[] };
type CoachTrainingJob = { id:string; coach_name:string; status:"waiting_source"|"queued"|"training"|"succeeded"|"failed"; phase:string; attempt_count:number; error_message:string; updated_at:string; source_run_id:string; source_status:string; source_total:number; source_completed:number; source_successful:number; details_json?:{lastEvent?:{phase?:string;batch?:number;attempt?:number;delayMs?:number;completed?:number;total?:number;skills?:number}}; training_manifest?:{phase?:string;lightTotal?:number;lightCompleted?:number;deepTotal?:number;deepCompleted?:number;partialMergeCount?:number;partialMergeTotal?:number} };
type WechatCandidate = { id:string; title:string; authorName:string; trainingToken:string };
const capabilityNames = ["IP定位","内容创作","获客增长"];

export function CreativeCoachProductionPanel() {
  const [tab,setTab]=useState<"library"|"submit"|"runs">("library");
  const [coaches,setCoaches]=useState<Coach[]>([]); const [runs,setRuns]=useState<TrainingRun[]>([]); const [jobs,setJobs]=useState<CoachTrainingJob[]>([]);
  const [loading,setLoading]=useState(true); const [error,setError]=useState("");
  const [detailId,setDetailId]=useState(""); const [runDetailId,setRunDetailId]=useState("");
  const [submitting,setSubmitting]=useState(false); const [submitMessage,setSubmitMessage]=useState("");
  const [draft,setDraft]=useState({coachId:"",name:"",creatorName:"",links:"",authorized:false});
  const [channelId,setChannelId]=useState(""); const [previousChannelId,setPreviousChannelId]=useState("");
  const [candidates,setCandidates]=useState<WechatCandidate[]>([]); const [discovering,setDiscovering]=useState(false);
  useEffect(()=>{ const controller=new AbortController(); const load=()=>fetch(apiPath("/api/admin/creative-coaches"),{cache:"no-store",signal:controller.signal}).then(async response=>{const payload=await response.json();if(!response.ok)throw new Error(payload.error||"读取教练失败");return payload as {coaches?:Coach[];runs?:TrainingRun[];jobs?:CoachTrainingJob[]};}).then(payload=>{setCoaches(payload.coaches??[]);setRuns(payload.runs??[]);setJobs(payload.jobs??[]);setError("");}).catch(cause=>{if(!(cause instanceof DOMException&&cause.name==="AbortError"))setError(cause instanceof Error?cause.message:"读取教练失败");}).finally(()=>setLoading(false)); void load(); const timer=window.setInterval(()=>void load(),15000); return()=>{window.clearInterval(timer);controller.abort();};},[]);
  async function discoverAccount(){const source=channelId.trim();const isChannelId=/^sph[A-Za-z0-9_-]+$/.test(source);const isShareUrl=/^https?:\/\/weixin\.qq\.com\/sph\/[A-Za-z0-9]+\/?$/.test(source);if(!isChannelId&&!isShareUrl){setSubmitMessage("请输入有效的视频号 ID 或视频号作品链接");return;}setDiscovering(true);setSubmitMessage("");try{const response=await fetch(apiPath("/api/avatar/wechat-channel/discover"),{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...(isChannelId?{channelId:source,previousChannelId:previousChannelId.trim()||undefined}:{shareUrl:source}),limit:"all"})});const payload=await response.json();if(!response.ok)throw new Error(payload.error||"获取视频号作品失败");setCandidates(payload.candidates??[]);if(!draft.coachId&&!draft.creatorName.trim()&&payload.authorName)setDraft(current=>({...current,creatorName:payload.authorName}));setSubmitMessage(`已识别作者「${payload.authorName||"未知"}」并获取 ${payload.candidates?.length??0} 条可训练作品，默认全部纳入训练。`);}catch(cause){setSubmitMessage(cause instanceof Error?cause.message:"获取视频号作品失败");}finally{setDiscovering(false);}}
  async function submitTraining(event:FormEvent){event.preventDefault();setSubmitMessage("");const links=[...new Set(draft.links.split(/[\s,，]+/).map(item=>item.trim()).filter(item=>/^https?:\/\//.test(item)))];const selected=coaches.find(coach=>coach.id===draft.coachId);const name=(selected?.name||draft.name).trim();const tokens=candidates.map(item=>item.trainingToken);if(!name||links.length+tokens.length<12||!draft.authorized){setSubmitMessage("请选择或填写教练、准备至少 12 条作品并确认授权。");return;}setSubmitting(true);try{const response=await fetch(apiPath("/api/admin/creative-coaches"),{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({coachId:selected?.id||undefined,name,creatorName:selected?.creator_name||draft.creatorName.trim(),links,wechatWorkTokens:tokens,authorized:true})});const payload=await response.json();if(!response.ok)throw new Error(payload.error||"训练任务提交失败");setSubmitMessage("最新版渐进训练已提交：素材解析完成后会自动训练三项能力、执行质量门并创建新版本。");setDraft(current=>({...current,links:"",authorized:false}));setCandidates([]);setTab("runs");}catch(cause){setSubmitMessage(cause instanceof Error?cause.message:"训练任务提交失败");}finally{setSubmitting(false);}}
  async function restoreVersion(coach:Coach,version:CoachVersion){if(version.version===coach.latest_version)return;setSubmitMessage("");try{const response=await fetch(apiPath("/api/admin/creative-coaches"),{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({action:"restore-version",coachId:coach.id,versionId:version.id})});const payload=await response.json();if(!response.ok)throw new Error(payload.error||"恢复版本失败");setCoaches(current=>current.map(item=>item.id===coach.id?{...item,latest_version:version.version,versions:item.versions.map(entry=>({...entry,status:entry.id===version.id?"restored":(["active","restored"].includes(entry.status)?"superseded":entry.status)}))}:item));}catch(cause){setError(cause instanceof Error?cause.message:"恢复版本失败");}}
  const legacyRuns=runs.filter(run=>!jobs.some(job=>job.source_run_id===run.id));
  const runningCount=jobs.filter(job=>!["succeeded","failed"].includes(job.status)).length+legacyRuns.filter(run=>run.status==="running").length;
  return <section className="adminAvatarProduction creativeCoachProduction">
    <div className="adminSectionTitle"><div><span>教练生产</span><h2>教练训练与版本管理</h2><p>一位教练统一承载 IP定位、内容创作和获客增长，训练结果与任务进度分别管理。</p></div></div>
    <nav className="creativeCoachTabs"><button className={tab==="library"?"active":""} onClick={()=>setTab("library")} type="button">教练库</button><button className={tab==="submit"?"active":""} onClick={()=>setTab("submit")} type="button">训练任务提交</button><button className={tab==="runs"?"active":""} onClick={()=>setTab("runs")} type="button">训练中的任务{runningCount?<em>{runningCount}</em>:null}</button></nav>
    {loading?<p className="adminEmptyHint">正在读取...</p>:error?<p className="adminEmptyHint">{error}</p>:null}
    {!loading&&!error&&tab==="library"?<div className="creativeCoachLibrary"><div className="creativeCoachLibraryHead"><div><span>教练库</span><strong>{coaches.length} 位教练</strong></div><small>查看介绍卡、质量门、能力结果和历史版本。</small></div><div className="creativeCoachGrid">{coaches.map(coach=>{const card=coach.identity_card??{};return <article className={`creativeCoachAdminCard ${coach.status}`} key={coach.id}><header><div><span>{coach.coach_scope==="platform"?"平台教练":"个人教练"}</span><h3>{coach.name}</h3></div><em>{coach.status==="active"?"已上架":"未上架"}</em></header><strong>{card.title||"教练"}</strong><p>{card.summary||"由存量训练成果整合生成。"}</p>{card.scenarios?.length?<div className="creativeCoachCapabilityList">{card.scenarios.map(item=><span className="ready" key={item}>{item}</span>)}</div>:null}{card.styleTags?.length?<p>{card.styleTags.map(item=>`#${item}`).join("　")}</p>:null}{card.bestFor?<small>适合：{card.bestFor}</small>:null}<div className="creativeCoachCapabilityList">{capabilityNames.map(name=><span className={coach.capabilities.includes(name)?"ready":"missing"} key={name}>{coach.capabilities.includes(name)?"✓":"+"} {name}</span>)}</div><footer><span>V{coach.latest_version||1}</span><span>{coach.sample_count} 条样本</span><span>{coach.source_count} 个素材库</span></footer><button className="secondaryButton" onClick={()=>setDetailId(detailId===coach.id?"":coach.id)} type="button">{detailId===coach.id?"收起管理详情":"查看管理详情"}</button>{detailId===coach.id?<div className="creativeCoachResultDetail"><section><strong>版本历史与质量门</strong>{(coach.versions??[]).map(version=><div className="creativeCoachVersionRow" key={version.id}><span>V{version.version} · {version.status} · {version.phase||"历史版本"}</span><small>{version.sampleCount} 个深训样本 · {version.qualityPassed?"质量门通过":"无质量门记录"}</small>{version.version!==coach.latest_version&&["superseded","active","restored"].includes(version.status)?<button className="secondaryButton" type="button" onClick={()=>void restoreVersion(coach,version)}>恢复此版本</button>:null}</div>)}</section>{[["IP定位",coach.ip_positioning_prompt],["内容创作",coach.content_creation_prompt],["获客增长",coach.growth_prompt]].map(([name,prompt])=><section key={name}><strong>{name}</strong><pre>{prompt||"尚未训练该项能力"}</pre></section>)}</div>:null}</article>;})}</div></div>:null}
    {tab==="submit"?<form className="creativeCoachSubmit" onSubmit={submitTraining}><div><span>新建 / 继续训练</span><h3>提交教练训练素材</h3><p>统一使用最新版渐进训练：全量轻分析、覆盖性深训、分层 Skill、停止条件、质量门，再生成 IP定位、内容创作和获客增长三项能力。</p></div><label>训练对象<select value={draft.coachId} onChange={event=>setDraft(current=>({...current,coachId:event.target.value}))}><option value="">新建教练</option>{coaches.map(coach=><option key={coach.id} value={coach.id}>继续加训：{coach.name} · V{coach.latest_version}</option>)}</select></label>{!draft.coachId?<><label>教练名称<input value={draft.name} onChange={event=>setDraft(current=>({...current,name:event.target.value}))} placeholder="例如：林老师教练" /></label><label>创作者名称（可选）<input value={draft.creatorName} onChange={event=>setDraft(current=>({...current,creatorName:event.target.value}))} /></label></>:<p>新素材会按证据补丁更新该教练，不会直接覆盖旧版本。</p>}<fieldset className="wechatChannelPicker"><legend>通过视频号 ID 或一条作品链接获取作者全部作品</legend><div className="wechatChannelDiscovery"><input value={channelId} onChange={event=>{setChannelId(event.target.value);setCandidates([]);}} placeholder="视频号 ID，或 https://weixin.qq.com/sph/..." /><button className="secondaryButton" disabled={discovering} onClick={()=>void discoverAccount()} type="button">{discovering?"正在识别并获取...":"获取作者全部作品"}</button></div><input value={previousChannelId} onChange={event=>setPreviousChannelId(event.target.value)} placeholder="使用视频号 ID 时，可填旧 ID 复用历史作品缓存" />{candidates.length?<small>已获取 {candidates.length} 条作品，默认全部纳入本次训练。</small>:<small>粘贴任意一条视频号作品链接即可识别作者；系统会读取账号可训练作品并自动去重，最新版训练至少需要 12 条有效作品。</small>}</fieldset><label>授权作品链接<textarea value={draft.links} onChange={event=>setDraft(current=>({...current,links:event.target.value}))} placeholder="也可粘贴单条抖音、视频号或公众号链接，每行一条" /></label><p>本次共准备 {draft.links.split(/[\s,，]+/).filter(item=>/^https?:\/\//.test(item)).length+candidates.length} 条作品。</p><label className="avatarConsent"><input checked={draft.authorized} onChange={event=>setDraft(current=>({...current,authorized:event.target.checked}))} type="checkbox" />我确认拥有这些作品，或已获得用于 AI 训练的授权</label><button className="primaryButton" disabled={submitting} type="submit">{submitting?"正在提交...":draft.coachId?"继续加训并创建新版本":"开始完整训练"}</button>{submitMessage?<p>{submitMessage}</p>:null}</form>:null}
    {tab==="runs"?<div className="creativeCoachRuns"><div className="creativeCoachLibraryHead"><div><span>最新版训练任务</span><strong>{runningCount} 项进行中</strong></div><small>素材解析和渐进 Skill 训练每 15 秒自动续跑</small></div><div className="creativeCoachRunList">{jobs.map(job=>{const progress=coachTrainingProgress(job);const steps=coachTrainingSteps(job);const finished=job.status==="succeeded";return <article key={job.id}><header><div><strong>{job.coach_name}</strong><span>{progress.stage}</span></div><em className={job.status}>{finished?"已完成":job.status==="failed"?"失败":"训练中"}</em></header><div className="creativeCoachRunProgress"><i style={{width:`${progress.percent}%`}} /></div><p className="creativeCoachCurrentActivity"><strong>当前：</strong>{progress.activity}</p><div className="creativeCoachTrainingSteps">{steps.map(step=><div className={`creativeCoachTrainingStep ${step.status}`} key={step.name}><div><strong>{step.name}</strong><span>{step.label}</span></div><div className="creativeCoachTrainingStepBar"><i style={{width:`${step.percent}%`}} /></div></div>)}</div><footer><span>素材 {job.source_completed}/{job.source_total}</span><span>有效 {job.source_successful}</span><span>整体 {progress.percent}%</span><span>{progress.detail}</span><span>尝试 {job.attempt_count}</span><span>{new Date(job.updated_at).toLocaleString("zh-CN",{hour12:false})}</span></footer>{job.error_message?<p>{job.error_message}</p>:null}<button className="secondaryButton" onClick={()=>setRunDetailId(runDetailId===job.source_run_id?"":job.source_run_id)} type="button">{runDetailId===job.source_run_id?"收起素材明细":"查看素材明细"}</button>{runDetailId===job.source_run_id?<div className="creativeCoachAttemptList">{(runs.find(run=>run.id===job.source_run_id)?.attempts??[]).map((attempt,index)=><div key={`${attempt.link}-${index}`}><em className={attempt.status}>{attempt.status==="succeeded"?"成功":attempt.status==="failed"?"失败":attempt.status==="running"?"处理中":"排队"}</em><span>{attempt.title||attempt.link||`素材 ${index+1}`}</span><small>{attempt.message||attempt.stage}</small></div>)}</div>:null}</article>;})}{legacyRuns.map(run=>{const progress=run.total_count?Math.round(run.completed_count/run.total_count*100):0;return <article key={run.id}><header><div><strong>{run.skill_name}</strong><span>旧流程任务（仅保留进度）</span></div><em className={run.status}>{run.status==="running"?"处理中":run.status==="succeeded"?"已完成":"失败"}</em></header><div className="creativeCoachRunProgress"><i style={{width:`${progress}%`}} /></div><footer><span>{run.completed_count}/{run.total_count} · {progress}%</span><span>成功 {run.successful_count}</span><span>失败 {run.failed_count}</span><span>{new Date(run.updated_at).toLocaleString("zh-CN",{hour12:false})}</span></footer>{run.error_message?<p>{run.error_message}</p>:null}</article>;})}{!jobs.length&&!legacyRuns.length?<p className="adminEmptyHint">暂无教练训练任务。</p>:null}</div></div>:null}
  </section>;
}

function formatCoachTrainingPhase(phase:string){const labels:Record<string,string>={"waiting-source":"素材解析","source-failed":"素材失败","starting-progressive-training":"启动渐进训练","light-analysis":"全量轻分析","deep-analysis":"覆盖性深训","partial-merge":"局部 Skill 合并","merge-round":"分段 Skill 归并","hierarchical-merge":"分层 Skill 合并","candidate-ready":"候选版本","quality-gate-passed":"质量门通过","quality-gate-failed":"质量门未通过",active:"已激活","waiting-retry":"等待续训",failed:"失败"};return labels[phase]||phase||"准备中";}

function coachTrainingSteps(job:CoachTrainingJob){
  const manifest=job.training_manifest??{};
  const ratio=(completed:number,total:number)=>total>0?Math.min(100,Math.round(completed/total*100)):0;
  const sourcePercent=job.source_status==="succeeded"?100:ratio(job.source_completed,job.source_total);
  const lightTotal=manifest.lightTotal??0;const lightCompleted=manifest.lightCompleted??0;
  const deepTotal=manifest.deepTotal??0;const deepCompleted=manifest.deepCompleted??0;
  const laterThanLight=deepTotal>0||["hierarchical-merge","candidate-ready","quality-gate-passed","quality-gate-failed","active"].includes(job.phase);
  const laterThanDeep=(manifest.partialMergeCount??0)>0||["hierarchical-merge","candidate-ready","quality-gate-passed","quality-gate-failed","active"].includes(job.phase);
  const lightPercent=lightTotal?ratio(lightCompleted,lightTotal):laterThanLight?100:0;
  const deepPercent=deepTotal?ratio(deepCompleted,deepTotal):laterThanDeep?100:0;
  const mergeGroupsTotal=manifest.partialMergeTotal??(deepTotal?Math.ceil(deepTotal/10):0);const mergeGroupsDone=manifest.partialMergeCount??0;
  const mergeFinished=["candidate-ready","quality-gate-passed","quality-gate-failed","active"].includes(job.phase)||job.status==="succeeded";
  const mergePercent=mergeFinished?100:laterThanDeep?Math.min(70,mergeGroupsTotal?Math.round(mergeGroupsDone/mergeGroupsTotal*70):10):0;
  const qualityPercent=job.status==="succeeded"||job.phase==="active"?100:job.phase.startsWith("quality-gate")?80:job.phase==="candidate-ready"?20:0;
  const raw=[
    {name:"素材解析",percent:sourcePercent,label:`${job.source_completed}/${job.source_total}，有效 ${job.source_successful}`},
    {name:"全量轻分析",percent:lightPercent,label:lightTotal?`${lightCompleted}/${lightTotal}`:"等待开始"},
    {name:"覆盖性深训",percent:deepPercent,label:deepTotal?`${deepCompleted}/${deepTotal}`:"等待开始"},
    {name:"Skill 合并与能力生成",percent:mergePercent,label:mergeFinished?"已生成候选能力":mergeGroupsDone?`${mergeGroupsDone}/${mergeGroupsTotal||"-"} 组，正在最终合并`:"等待开始"},
    {name:"质量门与激活",percent:qualityPercent,label:qualityPercent===100?"已通过并激活":qualityPercent?"检查中":"等待开始"},
  ];
  const currentIndex=raw.findIndex(step=>step.percent<100);
  return raw.map((step,index)=>({...step,status:step.percent===100?"done":index===(currentIndex<0?raw.length-1:currentIndex)?job.status==="failed"?"error":"current":"pending"}));
}

function coachTrainingProgress(job:CoachTrainingJob){
  const manifest=job.training_manifest??{};
  const event=job.details_json?.lastEvent??{};
  const ratio=(completed:number|undefined,total:number|undefined)=>total&&total>0?Math.min(1,Math.max(0,(completed??0)/total)):0;
  if(job.status==="succeeded"||job.phase==="active")return{percent:100,stage:"训练完成",activity:"新版教练能力已通过质量门并激活。",detail:"全部阶段完成"};
  if(job.source_status!=="succeeded"){
    const sourceRatio=ratio(job.source_completed,job.source_total);
    return{percent:Math.min(30,Math.round(sourceRatio*30)),stage:"素材解析",activity:`正在解析、转写和整理素材（${job.source_completed}/${job.source_total}）`,detail:`有效素材 ${job.source_successful}`};
  }
  let effectivePhase=job.phase;
  if(["partial-merge","merge-round"].includes(effectivePhase))effectivePhase="hierarchical-merge";
  if(effectivePhase==="batch-retry"){
    const deepFinished=(manifest.deepTotal??0)>0&&(manifest.deepCompleted??0)>=(manifest.deepTotal??0);
    effectivePhase=deepFinished&&manifest.partialMergeCount?"hierarchical-merge":manifest.phase||event.phase||"progressive-training";
  }
  let percent=32;
  let activity="正在初始化渐进训练环境。";
  let detail="素材解析已完成";
  if(["loaded","initialized","progressive-training"].includes(effectivePhase)){percent=34;activity="正在加载全部有效素材并建立训练版本。";}
  if(effectivePhase==="light-analysis"){
    const completed=manifest.lightCompleted??event.completed??0;const total=manifest.lightTotal??event.total??0;
    percent=Math.round(35+ratio(completed,total)*30);activity=`正在进行全量轻分析（${completed}/${total||"-"}）`;detail="识别任务画像、主题与表达动作";
  }
  if(effectivePhase==="deep-analysis"){
    const completed=manifest.deepCompleted??event.completed??0;const total=manifest.deepTotal??event.total??0;
    percent=Math.round(65+ratio(completed,total)*20);activity=`正在进行覆盖性深训（${completed}/${total||"-"}）`;detail="提取局部 Skill、Persona 与停止条件";
  }
  if(effectivePhase==="hierarchical-merge"){
    const groups=manifest.partialMergeCount??0;percent=groups>0?90:86;activity=groups>0?`已完成 ${groups} 组局部合并，正在生成最终分层 Skill 体系。`:"正在聚类并合并分层 Skill。";detail="合并同义能力并保留适用条件";
  }
  if(effectivePhase==="candidate-ready"){percent=94;activity="候选教练版本已生成，正在准备质量检查。";detail="能力与版本材料已生成";}
  if(["quality-gate-passed","quality-gate-failed"].includes(effectivePhase)){percent=97;activity="正在执行质量门与版本激活检查。";detail="核对覆盖率、证据和三项能力";}
  if(job.phase==="waiting-retry"){activity="本轮训练暂时失败，系统正在等待自动续训。";}
  if(job.phase==="batch-retry"){
    const waitSeconds=Math.max(1,Math.round((event.delayMs??0)/1000));
    activity=`模型请求超时，正在自动重试第 ${event.attempt??1} 次${event.delayMs?`（约 ${waitSeconds} 秒后）`:""}。`;
  }
  return{percent:Math.min(job.status==="failed"?99:98,percent),stage:formatCoachTrainingPhase(effectivePhase),activity,detail};
}
