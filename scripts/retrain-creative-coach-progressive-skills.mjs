#!/usr/bin/env node
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { Pool } from "pg";

const MO_SOURCE_SKILL_IDS = [
  "af92639a-b646-4ed9-bc07-e1133b68df1f", "46da00cf-6671-4848-90e1-441ad0968cd4",
  "dfe3cd92-3cdf-4ed4-abb1-08cd3c5555a5", "c899154c-9aa2-4e74-b657-ef006a40d3ab",
  "59f9b562-33a7-4ae4-9d19-f7de4e0ecfa7",
];
function readOption(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}
const requestedSourceIds = readOption("--source-skill-ids").split(",").map((item) => item.trim()).filter(Boolean);
const SOURCE_SKILL_IDS = requestedSourceIds.length ? requestedSourceIds : MO_SOURCE_SKILL_IDS;
const coachName = readOption("--coach-name") || process.argv.find((item, index) => index > 1 && !item.startsWith("--") && process.argv[index - 1] !== "--source-skill-ids") || "Mo姐教练";
const creatorName = readOption("--creator-name") || coachName.replace(/教练$/, "");
const autoActivate = process.argv.includes("--activate");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const base = (process.env.MODEL_API_BASE || "https://api.openai.com/v1").replace(/\/$/, "");
const apiKey = process.env.MODEL_API_KEY;
const models = [...new Set([process.env.TRAINING_MODEL_NAME || process.env.MODEL_NAME || "gpt-5.6-terra", process.env.TRAINING_FALLBACK_MODEL || "gpt-5.5"].filter(Boolean))];
const mergeModels = [...new Set([process.env.TRAINING_MERGE_MODEL || "gpt-5.4-mini", process.env.TRAINING_MERGE_FALLBACK_MODEL || "gpt-5.5"].filter(Boolean))];
const lightBatchSize = Math.max(4, Number(process.env.COACH_LIGHT_BATCH_SIZE || 8));
const deepBatchSize = Math.max(2, Number(process.env.COACH_DEEP_BATCH_SIZE || 4));
const configuredDeepSampleTarget = Math.max(8, Number(process.env.COACH_DEEP_SAMPLE_TARGET || 80));
const concurrency = Math.max(1, Math.min(4, Number(process.env.COACH_TRAINING_CONCURRENCY || 2)));
const runningAsScript=Boolean(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href);
if (runningAsScript&&(!process.env.DATABASE_URL || !apiKey)) throw new Error("DATABASE_URL and MODEL_API_KEY are required");

const compact = (value, limit = 1000) => String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
const parseJson = (value, fallback = {}) => { try { return JSON.parse(String(value).match(/\{[\s\S]*\}/)?.[0] || ""); } catch { return fallback; } };
const fingerprint = (row) => createHash("sha256").update(`${compact(row.title, 200)}\n${compact(row.transcript, 6000)}`.replace(/\s+/g, "").toLowerCase()).digest("hex");
const stableRank = (key) => createHash("sha256").update(`coach-v7:${key}`).digest("hex");
export function reconcileEvidenceBackedSkills(mergedSkills,partialSkills,levels=["general","strategy","functional","atomic"]){
  const clean=(value,limit=120)=>String(value||"").replace(/\s+/g," ").trim().slice(0,limit);
  const identity=(skill)=>clean(skill?.id||skill?.name).toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g,"");
  const evidenceBacked=(skill)=>Number(skill?.supportCount)>=2&&Array.isArray(skill?.sourceWorkFingerprints)&&skill.sourceWorkFingerprints.length>=2;
  const reconciled=(Array.isArray(mergedSkills)?mergedSkills:[]).map((skill)=>{
    const key=identity(skill);
    const matches=(Array.isArray(partialSkills)?partialSkills:[]).filter((candidate)=>key&&identity(candidate)===key||(clean(candidate?.name)&&clean(candidate?.name)===clean(skill?.name)));
    if(!matches.length)return skill;
    const sourceWorkFingerprints=[...new Set(matches.flatMap((candidate)=>candidate.sourceWorkFingerprints||[]))];
    return {...skill,sourceWorkFingerprints,supportCount:Math.max(sourceWorkFingerprints.length,...matches.map((candidate)=>Number(candidate.supportCount)||0))};
  }).filter(evidenceBacked);
  const signatures=new Set(reconciled.map((skill)=>`${skill.level}:${skill.id||skill.name}`));
  for(const level of levels){
    if(reconciled.some((skill)=>skill.level===level))continue;
    const supplement=(Array.isArray(partialSkills)?partialSkills:[]).filter((skill)=>skill.level===level&&evidenceBacked(skill)&&!signatures.has(`${skill.level}:${skill.id||skill.name}`)).sort((left,right)=>(Number(right.supportCount)||0)-(Number(left.supportCount)||0))[0];
    if(supplement){reconciled.push(supplement);signatures.add(`${supplement.level}:${supplement.id||supplement.name}`);}
  }
  return reconciled;
}
const evidenceSlices = (transcript, span = 150) => {
  const text = compact(transcript, 10000);
  if (text.length <= span * 3) return text;
  const middle = Math.max(0, Math.floor(text.length / 2) - Math.floor(span / 2));
  return `${text.slice(0, span)}\n[…中段…]\n${text.slice(middle, middle + span)}\n[…结尾…]\n${text.slice(-span)}`;
};
const restrictiveSkillText = /(不得|禁止|严禁|不能|不允许|不可|不承诺|不保证|不补造|不编造|不夸大|避免绝对|事实.*边界|推断.*条件|风险边界|合规边界|适用条件|待核验|需核验|核验要求|证据不足|信息不足|可靠材料|专业复核|高风险专业|不假装全知|删除测试|停止规则|停止条件|完成既定停止点|只按|仅依据|只执行)/u;
const restrictiveSkillKeys = new Set(["avoid","riskAttitude","notFor","requires","conflictsWith","stoppingRule","stoppingRules","counterExamples","doNotAdd","omittedMethods","negativeEvidence","contentGaps","forbiddenMoves","mustKeepEvidence","mustKeepEvidenceIds","uncertainClaims","doNotClaim","riskBoundary","factBoundary","complianceBoundary"]);
function relaxTrainedSkill(value) {
  if (typeof value === "string") return value.split(/(?<=[。！？!?；;])|\n+/u).map((item)=>item.trim()).filter((item)=>item&&!restrictiveSkillText.test(item)).join("\n");
  if (Array.isArray(value)) return value.map(relaxTrainedSkill).filter((item)=>item!==""&&item!=null);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).filter(([key])=>!restrictiveSkillKeys.has(key)).map(([key,item])=>[key,relaxTrainedSkill(item)]));
}

async function complete(prompt, maxTokens = 3000, options = {}) {
  const maxAttempts = Math.max(1, Number(options.maxAttempts || 6));
  const timeoutMs = Math.max(30_000, Number(options.timeoutMs || 250_000));
  const candidateModels = Array.isArray(options.models) && options.models.length ? options.models : models;
  let lastError;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const model = candidateModels[attempt % candidateModels.length];
    try {
      const response = await fetch(`${base}/chat/completions`, {
        method:"POST", headers:{ authorization:`Bearer ${apiKey}`,"content-type":"application/json" },
        body:JSON.stringify({ model,temperature:0.1,max_tokens:maxTokens,...(options.reasoningEffort?{reasoning_effort:options.reasoningEffort}:{}),messages:[{role:"user",content:prompt}] }),
        signal:AbortSignal.timeout(timeoutMs),
      });
      if (response.ok) return { text:compact((await response.json()).choices?.[0]?.message?.content, 100000), model };
      lastError = new Error(`HTTP ${response.status}: ${compact(await response.text(), 500)}`);
    } catch (error) { lastError = error; }
    if (attempt + 1 < maxAttempts) {
      console.log(JSON.stringify({ phase:"model-retry",attempt:attempt + 1,maxAttempts,error:compact(lastError?.message || lastError,300) }));
      await new Promise((resolve) => setTimeout(resolve, Math.min(120_000, 5_000 * 2 ** attempt)));
    }
  }
  throw lastError || new Error("model request failed");
}

async function mapConcurrent(items, worker) {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      for (let outage = 0; outage < 5; outage += 1) {
        try { await worker(items[index], index); break; }
        catch (error) {
          if (outage === 4) throw error;
          const delayMs = Math.min(300_000, 15_000 * 2 ** Math.min(outage, 4));
          console.log(JSON.stringify({ phase:"batch-retry",batch:index + 1,attempt:outage + 1,delayMs,error:compact(error?.message || error,500) }));
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }
  });
  await Promise.all(runners);
}

async function updateManifest(versionId, phase, patch = {}) {
  await pool.query(`update creative_coach_versions set training_manifest=coalesce(training_manifest,'{}'::jsonb)||$2::jsonb,change_summary=$3 where id=$1`, [versionId,JSON.stringify({ ...patch,phase,updatedAt:new Date().toISOString() }),`渐进Skill训练：${phase}`]);
}

async function saveMergeCheckpoint(versionId, bucket, key, value) {
  await pool.query(
    `update creative_coach_versions
        set training_manifest=coalesce(training_manifest,'{}'::jsonb)||jsonb_build_object(
          $2::text,coalesce(training_manifest->($2::text),'{}'::jsonb)||jsonb_build_object($3::text,$4::jsonb)
        )
      where id=$1`,
    [versionId,bucket,key,JSON.stringify(value)],
  );
}

async function withFinalMergeLock(worker) {
  const client=await pool.connect();
  try {
    await client.query(`select pg_advisory_lock(hashtext('creative-coach-final-skill-merge'))`);
    return await worker();
  } finally {
    await client.query(`select pg_advisory_unlock(hashtext('creative-coach-final-skill-merge'))`).catch(()=>undefined);
    client.release();
  }
}

async function upsertAnalysis(versionId, work, level, payload, model) {
  await pool.query(
    `insert into creative_coach_work_analyses(coach_version_id,source_skill_id,training_task_id,work_fingerprint,analysis_level,task_profile,local_skills,persona_signals,stopping_evidence,negative_evidence,model_name,updated_at)
     values($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb,$11,now())
     on conflict(coach_version_id,work_fingerprint,analysis_level) do update set task_profile=excluded.task_profile,local_skills=excluded.local_skills,persona_signals=excluded.persona_signals,stopping_evidence=excluded.stopping_evidence,negative_evidence=excluded.negative_evidence,model_name=excluded.model_name,updated_at=now()`,
    [versionId,work.skill_id,work.task_id,work.fingerprint,level,JSON.stringify(payload.taskProfile || {}),JSON.stringify(payload.localSkills || []),JSON.stringify(payload.personaSignals || []),JSON.stringify(payload.stoppingEvidence || []),JSON.stringify(payload.negativeEvidence || []),model],
  );
}

function chooseCoverageSample(works, analyses, target) {
  const analysisByFingerprint = new Map(analyses.map((item) => [item.work_fingerprint,item.task_profile]));
  const strata = new Map();
  for (const work of works) {
    const p = analysisByFingerprint.get(work.fingerprint) || {};
    const signature = [compact(p.communicationGoal, 50) || "unknown",p.requiredDepth || "medium",p.evidenceLoad || "medium",p.decisionComplexity || "medium",work.source_name].join("|");
    if (!strata.has(signature)) strata.set(signature, []);
    strata.get(signature).push(work);
  }
  const selected = [];
  const queues = [...strata.values()].map((group) => group.sort((a,b) => stableRank(a.fingerprint).localeCompare(stableRank(b.fingerprint))));
  while (selected.length < Math.min(target, works.length) && queues.some((group) => group.length)) {
    queues.sort((a,b) => b.length-a.length);
    for (const group of queues) if (group.length && selected.length < target) selected.push(group.shift());
  }
  return selected;
}

async function main() {
  const source = await pool.query(
    `select s.id skill_id,s.name source_name,v.training_run_id,t.id task_id,t.source_url,t.title,t.transcript,t.platform,t.created_at
       from avatar_creator_skills s join avatar_creator_skill_versions v on v.skill_id=s.id
       join avatar_training_tasks t on t.training_run_id=v.training_run_id
      where s.id=any($1::uuid[]) and t.status='succeeded' and length(t.transcript)>=80 order by s.name,t.created_at`, [SOURCE_SKILL_IDS],
  );
  const unique = new Map();
  for (const row of source.rows) { const fp = fingerprint(row); if (!unique.has(fp)) unique.set(fp,{ ...row,fingerprint:fp }); }
  const works = [...unique.values()];
  if (works.length < 12) throw new Error(`insufficient deduplicated works: ${works.length}; at least 12 are required`);
  const deepSampleTarget = Math.min(works.length, Math.max(12, Math.min(configuredDeepSampleTarget, Math.ceil(works.length * 0.45))));
  const owner = await pool.query(`select user_id from avatar_creator_skills where id=$1`, [SOURCE_SKILL_IDS[0]]);
  const userId = owner.rows[0]?.user_id;
  const coach = await pool.query(
    `insert into creative_coaches(user_id,name,creator_name,coach_scope,status)
     values($1,$2,$3,'platform','archived')
     on conflict(user_id,coach_scope,lower(name)) do update set creator_name=excluded.creator_name,updated_at=now()
     returning id`, [userId,coachName,creatorName],
  );
  const coachId = coach.rows[0].id;
  let version = await pool.query(`select * from creative_coach_versions where coach_id=$1 and status='training' and training_manifest->>'trainer'='progressive-skills-v1' order by version desc limit 1`, [coachId]);
  if (!version.rows[0]) version = await pool.query(
    `insert into creative_coach_versions(coach_id,user_id,version,status,source_skill_ids,sample_count,change_summary,training_manifest)
     select $1,$2,coalesce(max(version),0)+1,'training',$3::uuid[],$4,'渐进Skill候选训练初始化',$5::jsonb from creative_coach_versions where coach_id=$1 returning *`,
    [coachId,userId,SOURCE_SKILL_IDS,works.length,JSON.stringify({ trainer:"progressive-skills-v1",phase:"initialized",rawCount:source.rowCount,deduplicatedCount:works.length,deepSampleTarget,lightBatchSize,deepBatchSize,concurrency,models })],
  );
  const versionId = version.rows[0].id;
  console.log(JSON.stringify({ phase:"loaded",version:version.rows[0].version,versionId,raw:source.rowCount,deduplicated:works.length }));

  const existingLight = await pool.query(`select work_fingerprint from creative_coach_work_analyses where coach_version_id=$1 and analysis_level='light'`, [versionId]);
  const doneLight = new Set(existingLight.rows.map((row) => row.work_fingerprint));
  const pendingLight = works.filter((work) => !doneLight.has(work.fingerprint));
  const lightBatches = Array.from({ length:Math.ceil(pendingLight.length/lightBatchSize) }, (_,i) => pendingLight.slice(i*lightBatchSize,(i+1)*lightBatchSize));
  await updateManifest(versionId,"light-analysis",{ lightTotal:works.length,lightCompleted:doneLight.size });
  await mapConcurrent(lightBatches, async (batch,index) => {
    const material = batch.map((work,i) => `【${i}｜${work.fingerprint}】标题：${compact(work.title,90)}；来源：${work.source_name}；片段：${evidenceSlices(work.transcript,80)}`).join("\n\n");
    const { text,model } = await complete([
      "逐条观察创作者作品，识别它真正想讲什么、为谁而讲、使用了什么切口、情绪、人性判断、叙事动作和语言动作。index与输入一致。",
      "任务画像服务于发现创作者的表达可能性，不生成风险、证据负荷、适用限制或停止条件。",
      "严格JSON：{items:[{index:number,taskProfile:{communicationGoal,materialShape:string[],audienceState},topicTags:string[],observedMoveLabels:string[]}]}。",
      material,
    ].join("\n\n"), 5000);
    const parsed = parseJson(text,{items:[]});
    const items = Array.isArray(parsed.items) ? parsed.items : [];
    const indexes = new Set(items.map((item) => Number(item.index)).filter((index) => Number.isInteger(index) && index >= 0 && index < batch.length));
    if (indexes.size !== batch.length) throw new Error(`incomplete light batch: expected ${batch.length}, received ${indexes.size}`);
    for (const item of items) {
      const work = batch[Number(item.index)]; if (!work) continue;
      await upsertAnalysis(versionId,work,"light",{ taskProfile:item.taskProfile,localSkills:[],personaSignals:[],stoppingEvidence:[],negativeEvidence:[] },model);
    }
    const count = await pool.query(`select count(*)::int count from creative_coach_work_analyses where coach_version_id=$1 and analysis_level='light'`,[versionId]);
    await updateManifest(versionId,"light-analysis",{ lightCompleted:count.rows[0].count,lightBatchesCompleted:index+1 });
    console.log(JSON.stringify({phase:"light",completed:count.rows[0].count,total:works.length}));
  });

  const light = await pool.query(`select work_fingerprint,task_profile from creative_coach_work_analyses where coach_version_id=$1 and analysis_level='light'`,[versionId]);
  const deepWorks = chooseCoverageSample(works,light.rows,Math.min(deepSampleTarget,works.length));
  await updateManifest(versionId,"deep-analysis",{ deepSelected:deepWorks.map((work)=>work.fingerprint),deepTotal:deepWorks.length,selection:"stratified-task-profile-source" });
  const existingDeep = await pool.query(`select work_fingerprint from creative_coach_work_analyses where coach_version_id=$1 and analysis_level='deep'`,[versionId]);
  const doneDeep = new Set(existingDeep.rows.map((row)=>row.work_fingerprint));
  const pendingDeep = deepWorks.filter((work)=>!doneDeep.has(work.fingerprint));
  const deepBatches = Array.from({ length:Math.ceil(pendingDeep.length/deepBatchSize) },(_,i)=>pendingDeep.slice(i*deepBatchSize,(i+1)*deepBatchSize));
  await mapConcurrent(deepBatches, async (batch,index) => {
    const material = batch.map((work,i)=>`【${i}｜${work.fingerprint}】标题：${compact(work.title,100)}\n转写：${evidenceSlices(work.transcript,180)}`).join("\n\n");
    const {text,model}=await complete([
      "独立分析每条作品的可观察创作行为。提取它如何选题、洞察人性、制造冲突、让受众代入、组织故事、推进判断、使用情绪和形成个人语言。",
      "localSkills记录所有有辨识度、可启发新创作的能力，包括只在少量作品中出现但很有爆发力的动作。personaSignals记录稳定立场、判断方式和声纹。",
      "严格JSON：{items:[{index,taskProfile,localSkills:[{provisionalName,level:'general'|'strategy'|'functional'|'atomic',solves:string[],when:string[],observedSteps:string[],evidenceExcerpt}],personaSignals:[{kind:'identity'|'position'|'voice',signal,evidenceExcerpt}]}]}。",
      material,
    ].join("\n\n"),4200);
    const parsed=parseJson(text,{items:[]});
    const items=Array.isArray(parsed.items)?parsed.items:[];
    const indexes=new Set(items.map((item)=>Number(item.index)).filter((index)=>Number.isInteger(index)&&index>=0&&index<batch.length));
    if(indexes.size!==batch.length)throw new Error(`incomplete deep batch: expected ${batch.length}, received ${indexes.size}`);
    for(const item of items){const work=batch[Number(item.index)];if(work)await upsertAnalysis(versionId,work,"deep",item,model);}
    const count=await pool.query(`select count(*)::int count from creative_coach_work_analyses where coach_version_id=$1 and analysis_level='deep'`,[versionId]);
    await updateManifest(versionId,"deep-analysis",{deepCompleted:count.rows[0].count,deepBatchesCompleted:index+1});
    console.log(JSON.stringify({phase:"deep",completed:count.rows[0].count,total:deepWorks.length}));
  });

  const deep = await pool.query(`select work_fingerprint,task_profile,local_skills,persona_signals,stopping_evidence,negative_evidence from creative_coach_work_analyses where coach_version_id=$1 and analysis_level='deep' order by work_fingerprint`,[versionId]);
  const mergeGroupSize=5;
  const mergeGroups = Array.from({length:Math.ceil(deep.rows.length/mergeGroupSize)},(_,i)=>deep.rows.slice(i*mergeGroupSize,(i+1)*mergeGroupSize));
  const storedManifest=version.rows[0]?.training_manifest&&typeof version.rows[0].training_manifest==="object"?version.rows[0].training_manifest:{};
  const partialCheckpoints=storedManifest.partialMergeCheckpoints&&typeof storedManifest.partialMergeCheckpoints==="object"?storedManifest.partialMergeCheckpoints:{};
  const partials=Array.from({length:mergeGroups.length},(_,index)=>partialCheckpoints[String(index)]||null);
  const pendingMergeGroups=mergeGroups.map((group,index)=>({group,index})).filter(({index})=>!partials[index]);
  await mapConcurrent(pendingMergeGroups,async({group,index})=>{
    const {text}=await withFinalMergeLock(()=>complete([
      "把以下创作能力在组内聚类，合并同义行为，同时保留少见但有辨识度、有传播潜力的单例能力。",
      "输出层级必须区分general、strategy、functional、atomic。三个钩子若存在只能作为atomic，不得自动成为完整模板。",
      "严格JSON：{skills:[{id,name,level,parentHint,description,solves,when,steps,supportCount,sourceWorkFingerprints}],rareCandidates:[]}。",
      compact(JSON.stringify(group),7000),
    ].join("\n\n"),2400,{timeoutMs:90_000,maxAttempts:2,models:mergeModels,reasoningEffort:"low"}));
    partials[index]=parseJson(text,{skills:[],rareCandidates:[]});
    await saveMergeCheckpoint(versionId,"partialMergeCheckpoints",String(index),partials[index]);
    const completed=partials.filter(Boolean).length;
    await updateManifest(versionId,"hierarchical-merge",{partialMergeCount:completed,partialMergeTotal:mergeGroups.length});
    console.log(JSON.stringify({phase:"partial-merge",completed,total:mergeGroups.length}));
  });
  await updateManifest(versionId,"hierarchical-merge",{partialMergeCount:partials.length,partialMergeTotal:mergeGroups.length});
  const mergeRoundCheckpoints=storedManifest.mergeRoundCheckpoints&&typeof storedManifest.mergeRoundCheckpoints==="object"?storedManifest.mergeRoundCheckpoints:{};
  const compactMergeCandidate=(candidate)=>({
    skills:(Array.isArray(candidate?.skills)?candidate.skills:[]).map((item)=>({
      id:compact(item.id,80),name:compact(item.name,80),level:item.level,parentSkillId:compact(item.parentSkillId||item.parentHint,80),
      description:compact(item.description,220),solves:(item.solves||[]).slice(0,3).map((value)=>compact(value,100)),
      when:(item.when||[]).slice(0,3).map((value)=>compact(value,100)),
      steps:(item.steps||[]).slice(0,4).map((value)=>compact(value,120)),
      supportCount:Number(item.supportCount)||0,sourceWorkFingerprints:(item.sourceWorkFingerprints||[]).slice(0,8),
    })),
  });
  const mergeLevels=["general","strategy","functional","atomic"];
  const buildMergePayload=(batch,budget=7000)=>{
    const candidates=batch.flatMap((candidate,candidateIndex)=>compactMergeCandidate(candidate).skills.map((skill)=>({skill,candidateIndex})));
    const score=({skill})=>(Number(skill.supportCount)||0)*100+(skill.sourceWorkFingerprints?.length||0)*10+(skill.when?.length||0)+(skill.steps?.length||0);
    const queues=new Map();
    for(const item of candidates){
      const level=mergeLevels.includes(item.skill.level)?item.skill.level:"functional";
      item.skill.level=level;
      const key=`${item.candidateIndex}:${level}`;
      if(!queues.has(key))queues.set(key,[]);
      queues.get(key).push(item);
    }
    for(const queue of queues.values())queue.sort((left,right)=>score(right)-score(left)||stableRank(left.skill.id||left.skill.name).localeCompare(stableRank(right.skill.id||right.skill.name)));
    const selected=[];const signatures=new Set();
    const tryAdd=({skill})=>{
      const signature=`${skill.level}:${skill.id||skill.name}`;
      if(signatures.has(signature))return false;
      const next=[...selected,skill];
      if(JSON.stringify({skills:next}).length>budget)return false;
      selected.push(skill);signatures.add(signature);return true;
    };
    let progressed=true;
    while(progressed){
      progressed=false;
      for(let candidateIndex=0;candidateIndex<batch.length;candidateIndex+=1){
        for(const level of mergeLevels){
          const queue=queues.get(`${candidateIndex}:${level}`)||[];
          if(queue.length&&tryAdd(queue.shift()))progressed=true;
        }
      }
    }
    const remainder=[...queues.values()].flat().sort((left,right)=>score(right)-score(left)||stableRank(left.skill.id||left.skill.name).localeCompare(stableRank(right.skill.id||right.skill.name)));
    for(const item of remainder)tryAdd(item);
    return {payload:{skills:selected},audit:{inputCount:candidates.length,selectedCount:selected.length,omittedCount:candidates.length-selected.length,byLevel:Object.fromEntries(mergeLevels.map((level)=>[level,selected.filter((skill)=>skill.level===level).length])),budget,serializedChars:JSON.stringify({skills:selected}).length}};
  };
  const mergeCandidateBatch=async(batch,round,index)=>{
    const key=`${round}-${index}`;
    if(mergeRoundCheckpoints[key])return mergeRoundCheckpoints[key];
    const {payload,audit}=buildMergePayload(batch);
    const {text}=await complete([
      "只合并下面这一小批 Skill 候选。合并同义项，保留条件不同的同名项；必须尽量保留 general、strategy、functional、atomic 四层覆盖，不解释过程。最多保留10项。",
      "严格JSON：{skills:[{id,name,level:'general'|'strategy'|'functional'|'atomic',parentSkillId,description,when:string[],steps:string[],supportCount,sourceWorkFingerprints:string[]}]}。",
      JSON.stringify(payload),
    ].join("\n\n"),1500,{timeoutMs:90_000,maxAttempts:2,models:mergeModels,reasoningEffort:"low"});
    const parsed=parseJson(text,{skills:[]});
    const skills=Array.isArray(parsed.skills)?parsed.skills:[];
    const result={
      skills,
      hierarchy:skills.map((item)=>({id:item.id,name:item.name,level:item.level,parentSkillId:item.parentSkillId||null,description:item.description||"",solves:item.solves||[],when:item.when||[],childSkillIds:skills.filter((child)=>child.parentSkillId===item.id).map((child)=>child.id)})),
      stoppingRules:[],
      patches:[],
      mergeAudit:audit,
    };
    await saveMergeCheckpoint(versionId,"mergeRoundCheckpoints",key,result);
    mergeRoundCheckpoints[key]=result;
    console.log(JSON.stringify({phase:"merge-round",round,batch:index+1,inputCount:batch.length}));
    return result;
  };
  const merged=await withFinalMergeLock(async()=>{
    let candidates=partials;let round=1;
    while(candidates.length>1){
      const batches=Array.from({length:Math.ceil(candidates.length/2)},(_,index)=>candidates.slice(index*2,(index+1)*2));
      const next=[];
      for(const [index,batch] of batches.entries())next.push(await mergeCandidateBatch(batch,round,index));
      candidates=next;round+=1;
    }
    return candidates[0]||{skills:[],hierarchy:[],patches:[],stoppingRules:[]};
  });
  if(!Array.isArray(merged.skills)||merged.skills.length<4)throw new Error("hierarchical merge produced insufficient skills");
  const allPartialSkills=partials.flatMap((candidate)=>compactMergeCandidate(candidate).skills);
  merged.skills=reconcileEvidenceBackedSkills(merged.skills,allPartialSkills,mergeLevels);
  merged.hierarchy=merged.skills.map((item)=>({id:item.id,name:item.name,level:item.level,parentSkillId:item.parentSkillId||null,description:item.description||"",solves:item.solves||[],when:item.when||[],childSkillIds:merged.skills.filter((child)=>child.parentSkillId===item.id).map((child)=>child.id)}));
  merged.stoppingRules=[];
  const allEvidence=new Set(allPartialSkills.flatMap((skill)=>skill.sourceWorkFingerprints||[]));
  const retainedEvidence=new Set(merged.skills.flatMap((skill)=>skill.sourceWorkFingerprints||[]));
  const mergeEvidenceAudit={inputSkillCount:allPartialSkills.length,finalSkillCount:merged.skills.length,inputEvidenceCount:allEvidence.size,retainedEvidenceCount:retainedEvidence.size,evidenceCoverage:allEvidence.size?Number((retainedEvidence.size/allEvidence.size).toFixed(4)):1,byLevel:Object.fromEntries(mergeLevels.map((level)=>[level,merged.skills.filter((skill)=>skill.level===level).length])),allSkillsEvidenceBacked:merged.skills.every((skill)=>Number(skill.supportCount)>=2&&Array.isArray(skill.sourceWorkFingerprints)&&skill.sourceWorkFingerprints.length>=2)};
  await updateManifest(versionId,"merge-evidence-audit",{mergeEvidenceAudit});

  const personaMaterial=deep.rows.flatMap((row)=>Array.isArray(row.persona_signals)?row.persona_signals.map((signal)=>({...signal,workFingerprint:row.work_fingerprint})):[]);
  const {text:personaRaw}=await complete([
    "从作品中提炼创作者Persona：身份、服务对象、稳定立场、人性洞察、判断锋芒、情绪幅度、声纹和最有辨识度的表达偏好。另提炼2到3个signatureTags，概括这位教练真正擅长解决的问题、服务对象或判断领域。",
    `创作者名称统一使用“${creatorName}”。自动转写中与名称近音的称呼属于噪声，不得据此发明其他自称或人格名称。`,
    "严格JSON：{identity,audience:string[],stablePositions:string[],humanInsights:string[],voiceTraits:string[],signatureTags:string[],adaptiveVoice:[{taskProfile,guidance}],evidence:[{workFingerprint,signal}]}。",
    compact(JSON.stringify(personaMaterial),50000),
  ].join("\n\n"),4500);
  const persona=relaxTrainedSkill(parseJson(personaRaw,{}));

  const deepByFingerprint = new Map(deep.rows.map((row) => [row.work_fingerprint,row]));
  const materializeSkill = (item) => {
    const sourceFingerprints = Array.isArray(item.sourceWorkFingerprints) ? item.sourceWorkFingerprints : [];
    const positiveExamples = sourceFingerprints.flatMap((fp) => {
      const row = deepByFingerprint.get(fp);
      const candidates = Array.isArray(row?.local_skills) ? row.local_skills : [];
      const excerpt = candidates.map((candidate) => compact(candidate.evidenceExcerpt,180)).find(Boolean);
      return excerpt ? [{ workFingerprint:fp,excerpt }] : [];
    }).slice(0,3);
    return { ...item,positiveExamples:positiveExamples.length?positiveExamples:item.positiveExamples||[] };
  };
  merged.skills = merged.skills.map(materializeSkill).map(relaxTrainedSkill);
  merged.hierarchy = merged.skills.map((item)=>({id:item.id,name:item.name,level:item.level,parentSkillId:item.parentSkillId||null,description:item.description||"",solves:item.solves||[],when:item.when||[],childSkillIds:merged.skills.filter((child)=>child.parentSkillId===item.id).map((child)=>child.id)}));

  const skillSummary=merged.skills.map((item)=>JSON.stringify({key:item.id,name:item.name,level:item.level,parentSkillId:item.parentSkillId,summary:item.description,solves:item.solves,when:item.when,steps:item.steps,supportCount:item.supportCount,evidence:(item.sourceWorkFingerprints||[]).slice(0,6).map((fp)=>({title:fp,excerpt:"轨迹证据已结构化落库"}))}));
  const {text:modulesRaw}=await complete([
    "为获客教练生成运行时模块，严格JSON {research,brief,writing,voice}，每项是非空字符串且不超过700字。",
    "research发现题值、人性冲突、受众欲望和可能爆发的角度；brief让教练自由选择、组合或改造方法并形成鲜明创作方向；writing允许继续判断和即兴组织，完整释放Persona的锋芒、情绪、节奏和语言；voice提炼稳定声纹及不同题材下的自然变化。不要生成风险边界、禁写项、核验要求、停止规则、删除测试或免责声明。",
    `Persona：${compact(JSON.stringify(persona),10000)}`,
    `Skill体系摘要：${compact(skillSummary.join("\n"),30000)}`,
  ].join("\n\n"),4000);
  const modules=relaxTrainedSkill(parseJson(modulesRaw,{}));
  if(!["research","brief","writing","voice"].every((key)=>typeof modules[key]==="string"&&modules[key].trim()))throw new Error("runtime modules incomplete");

  const previous=await pool.query(`select id,version,skill_modules from creative_coach_versions where coach_id=$1 and status in ('active','restored') order by version desc limit 1`,[coachId]);
  const runIds=[...new Set(source.rows.map((item)=>item.training_run_id).filter(Boolean))];
  const client=await pool.connect();
  try{
    await client.query("begin");
    for(const patch of Array.isArray(merged.patches)?merged.patches:[])await client.query(
      `insert into creative_coach_skill_patches(coach_version_id,operation,target_skill_id,reason,evidence_count,source_work_fingerprints,affected_task_profiles,before_value,after_value) values($1,$2,$3,$4,$5,$6::text[],$7::jsonb,$8::jsonb,$9::jsonb)`,
      [versionId,["add","strengthen","split","merge","deprecate","unchanged"].includes(patch.operation)?patch.operation:"add",compact(patch.targetSkillId,200),compact(patch.reason,2000),Number(patch.evidenceCount)||0,patch.sourceWorkFingerprints||[],JSON.stringify(patch.affectedTaskProfiles||[]),JSON.stringify(patch.before||{}),JSON.stringify(patch.after||{})],
    );
    const skillModules={schemaVersion:3,...modules,persona,discoveredMethods:merged.skills.map((item)=>({key:item.id,name:item.name,level:item.level,parentSkillId:item.parentSkillId,summary:item.description,solves:item.solves,when:item.when,steps:item.steps,positiveExamples:item.positiveExamples,supportCount:item.supportCount,evidence:(item.sourceWorkFingerprints||[]).slice(0,8).map((fp)=>({title:fp,excerpt:"证据见creative_coach_work_analyses"}))})),skillHierarchy:merged.hierarchy,skillPatches:merged.patches,trainingCheckpoint:{phase:"candidate-ready",completedAt:new Date().toISOString(),creativeFreedom:true}};
    await client.query(`update creative_coach_versions set status='candidate',persona_profile=$2::jsonb,skill_hierarchy=$3::jsonb,skill_modules=$4::jsonb,ip_positioning_prompt=$5,content_creation_prompt=$6,growth_prompt=$7,source_run_ids=$8::uuid[],sample_count=$9,training_manifest=training_manifest||$10::jsonb,change_summary=$11 where id=$1`,[versionId,JSON.stringify(persona),JSON.stringify(merged.hierarchy||[]),JSON.stringify(skillModules),modules.research,modules.writing,modules.brief,runIds,deepWorks.length,JSON.stringify({phase:"candidate-ready",completedAt:new Date().toISOString(),previousVersionId:previous.rows[0]?.id,fullCorpusCount:works.length,deepSampleCount:deepWorks.length,skillCount:merged.skills.length}),`渐进Skill候选：全量轻分析 ${works.length} 条，覆盖性深训 ${deepWorks.length} 条，形成 ${merged.skills.length} 张分层Skill`]);
    await client.query("commit");
  }catch(error){await client.query("rollback");throw error;}finally{client.release();}
  if (autoActivate) {
    const checks = {
      minimumCorpus: works.length >= 12,
      coverage: deepWorks.length >= Math.min(12, works.length),
      persona: Boolean(persona.identity && Array.isArray(persona.evidence) && persona.evidence.length),
      hierarchy: Array.isArray(merged.hierarchy) && merged.hierarchy.length >= 4,
      runtimeModules: [modules.research, modules.brief, modules.writing, modules.voice].every((item) => typeof item === "string" && item.trim().length >= 80),
      evidenceBackedSkills: merged.skills.every((item) => Number(item.supportCount) >= 2 && Array.isArray(item.sourceWorkFingerprints) && item.sourceWorkFingerprints.length >= 2),
    };
    const passed = Object.values(checks).every(Boolean);
    await pool.query(`update creative_coach_versions set training_manifest=training_manifest||$2::jsonb where id=$1`, [versionId, JSON.stringify({ phase:passed?"quality-gate-passed":"quality-gate-failed",qualityGate:{checks,passed,checkedAt:new Date().toISOString()} })]);
    if (!passed) throw new Error(`quality gate failed: ${JSON.stringify(checks)}`);
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(`update creative_coach_versions set status='superseded' where coach_id=$1 and id<>$2 and status in ('active','restored')`, [coachId,versionId]);
      await client.query(`update creative_coach_versions set status='active',training_manifest=training_manifest||$2::jsonb,change_summary=change_summary||'；标准质量门通过并自动上架' where id=$1`, [versionId,JSON.stringify({phase:"active",activatedAt:new Date().toISOString()})]);
      const signatureTags = (Array.isArray(persona.signatureTags) ? persona.signatureTags : [])
        .map((item) => String(item).trim())
        .filter(Boolean)
        .slice(0,3);
      await client.query(`update creative_coaches set status='active',latest_version=$2,identity_card=$3::jsonb,updated_at=now() where id=$1`, [coachId,version.rows[0].version,JSON.stringify({title:persona.identity||`${creatorName}创作教练`,summary:(persona.stablePositions||[]).slice(0,2).join("；"),scenarios:signatureTags,styleTags:signatureTags,bestFor:(persona.audience||[]).slice(0,3).join("、")})]);
      await client.query("commit");
    } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
  }
  console.log(JSON.stringify({phase:autoActivate?"active":"candidate-ready",coachId,versionId,version:version.rows[0].version,fullCorpus:works.length,deepSamples:deepWorks.length,skills:merged.skills.length,previousVersion:previous.rows[0]?.version}));
}

if(runningAsScript){
  try { await main(); } catch (error) { console.error(error); process.exitCode=1; } finally { await pool.end(); }
}
