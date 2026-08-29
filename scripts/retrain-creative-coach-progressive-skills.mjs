#!/usr/bin/env node
import { createHash } from "node:crypto";
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
const lightBatchSize = Math.max(8, Number(process.env.COACH_LIGHT_BATCH_SIZE || 24));
const deepBatchSize = Math.max(2, Number(process.env.COACH_DEEP_BATCH_SIZE || 4));
const configuredDeepSampleTarget = Math.max(8, Number(process.env.COACH_DEEP_SAMPLE_TARGET || 80));
const concurrency = Math.max(1, Math.min(4, Number(process.env.COACH_TRAINING_CONCURRENCY || 2)));
if (!process.env.DATABASE_URL || !apiKey) throw new Error("DATABASE_URL and MODEL_API_KEY are required");

const compact = (value, limit = 1000) => String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
const parseJson = (value, fallback = {}) => { try { return JSON.parse(String(value).match(/\{[\s\S]*\}/)?.[0] || ""); } catch { return fallback; } };
const fingerprint = (row) => createHash("sha256").update(`${compact(row.title, 200)}\n${compact(row.transcript, 6000)}`.replace(/\s+/g, "").toLowerCase()).digest("hex");
const stableRank = (key) => createHash("sha256").update(`coach-v7:${key}`).digest("hex");
const evidenceSlices = (transcript, span = 150) => {
  const text = compact(transcript, 10000);
  if (text.length <= span * 3) return text;
  const middle = Math.max(0, Math.floor(text.length / 2) - Math.floor(span / 2));
  return `${text.slice(0, span)}\n[…中段…]\n${text.slice(middle, middle + span)}\n[…结尾…]\n${text.slice(-span)}`;
};

async function complete(prompt, maxTokens = 3000) {
  let lastError;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const model = models[attempt % models.length];
    try {
      const response = await fetch(`${base}/chat/completions`, {
        method:"POST", headers:{ authorization:`Bearer ${apiKey}`,"content-type":"application/json" },
        body:JSON.stringify({ model,temperature:0.1,max_tokens:maxTokens,messages:[{role:"user",content:prompt}] }),
        signal:AbortSignal.timeout(250_000),
      });
      if (response.ok) return { text:compact((await response.json()).choices?.[0]?.message?.content, 100000), model };
      lastError = new Error(`HTTP ${response.status}: ${compact(await response.text(), 500)}`);
    } catch (error) { lastError = error; }
    await new Promise((resolve) => setTimeout(resolve, Math.min(120_000, 5_000 * 2 ** attempt)));
  }
  throw lastError || new Error("model request failed");
}

async function mapConcurrent(items, worker) {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      for (let outage = 0; ; outage += 1) {
        try { await worker(items[index], index); break; }
        catch (error) {
          const delayMs = Math.min(300_000, 15_000 * 2 ** Math.min(outage, 4));
          console.warn(JSON.stringify({ phase:"batch-retry",batch:index + 1,delayMs,error:compact(error?.message || error,500) }));
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
      "对每条创作者作品做低成本任务画像，不提炼最终Skill、不模仿句子。必须逐条返回，index与输入一致。",
      "任务类型由沟通目标、材料形态、受众状态、必要深度、证据负荷和决策复杂度决定，禁止使用账号或栏目名作为类型。",
      "严格JSON：{items:[{index:number,taskProfile:{communicationGoal,materialShape:string[],requiredDepth:'light'|'medium'|'deep',evidenceLoad:'low'|'medium'|'high',audienceState,decisionComplexity:'low'|'medium'|'high'},topicTags:string[],observedMoveLabels:string[],naturalStop:string}]}。",
      material,
    ].join("\n\n"), 3500);
    const parsed = parseJson(text,{items:[]});
    const items = Array.isArray(parsed.items) ? parsed.items : [];
    const indexes = new Set(items.map((item) => Number(item.index)).filter((index) => Number.isInteger(index) && index >= 0 && index < batch.length));
    if (indexes.size !== batch.length) throw new Error(`incomplete light batch: expected ${batch.length}, received ${indexes.size}`);
    for (const item of items) {
      const work = batch[Number(item.index)]; if (!work) continue;
      await upsertAnalysis(versionId,work,"light",{ taskProfile:item.taskProfile,localSkills:[],personaSignals:[],stoppingEvidence:item.naturalStop?[item.naturalStop]:[],negativeEvidence:[] },model);
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
      "独立分析每条作品的可观察行为，不看已有方法名，不寻找预设钩子，不评价主题知识。提取它如何让受众代入、推进判断、解释证据、处理顾虑，以及为何在该处停止。",
      "localSkills只是轨迹局部候选，不得直接上升为通用规则。negativeEvidence记录没有继续使用哪些常见动作及为什么已经足够。personaSignals只记录跨任务可能稳定的价值判断或声纹证据。",
      "严格JSON：{items:[{index,taskProfile,localSkills:[{provisionalName,level:'general'|'strategy'|'functional'|'atomic',solves:string[],when:string[],notFor:string[],observedSteps:string[],evidenceExcerpt}],personaSignals:[{kind:'identity'|'position'|'voice'|'avoid',signal,evidenceExcerpt}],stoppingEvidence:[{stopAfter,reason,evidenceExcerpt}],negativeEvidence:[{omittedMove,reason,evidenceExcerpt}]}]}。",
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
  const mergeGroups = Array.from({length:Math.ceil(deep.rows.length/20)},(_,i)=>deep.rows.slice(i*20,(i+1)*20));
  const partials=[];
  await mapConcurrent(mergeGroups,async(group,index)=>{
    const {text}=await complete([
      "把以下轨迹局部候选在组内聚类，合并同义行为，但保留适用条件差异。至少两个独立作品支持才能成为候选；单例保留为rareCandidates。",
      "输出层级必须区分general、strategy、functional、atomic。三个钩子若存在只能作为atomic，不得自动成为完整模板。",
      "严格JSON：{skills:[{id,name,level,parentHint,description,solves,when,notFor,requires,conflictsWith,steps,stoppingRule,supportCount,sourceWorkFingerprints}],rareCandidates:[]}。",
      compact(JSON.stringify(group),45000),
    ].join("\n\n"),5000);
    partials[index]=parseJson(text,{skills:[],rareCandidates:[]});
  });
  await updateManifest(versionId,"hierarchical-merge",{partialMergeCount:partials.length});
  const {text:mergedRaw}=await complete([
    "合并以下分组Skill，输出无冲突的四层教练Skill体系，最多保留14张证据最强、差异最清楚的Skill。不得因高频就提升为通用原则；任务专用能力保留在strategy或functional。合并重复项，拆分同名异义项，并为每项保留来源指纹。",
    "同时产生Skill Patch，相对当前版本只描述add/strengthen/split/merge/deprecate/unchanged，不直接覆盖正式版本。",
    "严格JSON：{skills:[{id,name,level:'general'|'strategy'|'functional'|'atomic',parentSkillId,description,solves:string[],when:string[],notFor:string[],requires:string[],conflictsWith:string[],steps:string[],stoppingRule,positiveExamples:[],counterExamples:[],supportCount,sourceWorkFingerprints:string[]}],hierarchy:[{id,name,level,parentSkillId,description,solves,when,notFor,childSkillIds}],stoppingRules:[],patches:[{operation,targetSkillId,reason,evidenceCount,sourceWorkFingerprints,affectedTaskProfiles,before,after}]}。",
    compact(JSON.stringify(partials),45000),
  ].join("\n\n"),6000);
  const merged=parseJson(mergedRaw,{skills:[],hierarchy:[],patches:[],stoppingRules:[]});
  if(!Array.isArray(merged.skills)||merged.skills.length<4)throw new Error("hierarchical merge produced insufficient skills");

  const personaMaterial=deep.rows.flatMap((row)=>Array.isArray(row.persona_signals)?row.persona_signals.map((signal)=>({...signal,workFingerprint:row.work_fingerprint})):[]);
  const {text:personaRaw}=await complete([
    "从证据中提炼创作者Persona，只保存身份、服务对象、稳定立场、风险态度、声纹和不会采用的表达。不得写方法、固定结构、具体事实或课程。只有跨多个作品稳定出现才能进入。",
    `创作者名称统一使用“${creatorName}”。自动转写中与名称近音的称呼属于噪声，不得据此发明其他自称或人格名称。`,
    "严格JSON：{identity,audience:string[],stablePositions:string[],riskAttitude:string[],voiceTraits:string[],adaptiveVoice:[{taskProfile,guidance}],avoid:string[],evidence:[{workFingerprint,signal}]}。",
    compact(JSON.stringify(personaMaterial),50000),
  ].join("\n\n"),4500);
  const persona=parseJson(personaRaw,{});

  const deepByFingerprint = new Map(deep.rows.map((row) => [row.work_fingerprint,row]));
  const materializeSkill = (item) => {
    const sourceFingerprints = Array.isArray(item.sourceWorkFingerprints) ? item.sourceWorkFingerprints : [];
    const positiveExamples = sourceFingerprints.flatMap((fp) => {
      const row = deepByFingerprint.get(fp);
      const candidates = Array.isArray(row?.local_skills) ? row.local_skills : [];
      const excerpt = candidates.map((candidate) => compact(candidate.evidenceExcerpt,180)).find(Boolean);
      return excerpt ? [{ workFingerprint:fp,excerpt }] : [];
    }).slice(0,3);
    const counterExamples = sourceFingerprints.flatMap((fp) => {
      const row = deepByFingerprint.get(fp);
      const candidates = Array.isArray(row?.negative_evidence) ? row.negative_evidence : [];
      return candidates.flatMap((candidate) => candidate?.reason ? [{ workFingerprint:fp,omittedMove:compact(candidate.omittedMove,120),reason:compact(candidate.reason,240),excerpt:compact(candidate.evidenceExcerpt,180) }] : []);
    }).slice(0,3);
    return { ...item,positiveExamples:positiveExamples.length?positiveExamples:item.positiveExamples||[],counterExamples:counterExamples.length?counterExamples:item.counterExamples||[] };
  };
  merged.skills = merged.skills.map(materializeSkill);

  const skillSummary=merged.skills.map((item)=>JSON.stringify({key:item.id,name:item.name,level:item.level,parentSkillId:item.parentSkillId,summary:item.description,solves:item.solves,when:item.when,notFor:item.notFor,requires:item.requires,conflictsWith:item.conflictsWith,steps:item.steps,stoppingRule:item.stoppingRule,supportCount:item.supportCount,evidence:(item.sourceWorkFingerprints||[]).slice(0,6).map((fp)=>({title:fp,excerpt:"轨迹证据已结构化落库"}))}));
  const {text:modulesRaw}=await complete([
    "为获客教练生成运行时模块，严格JSON {research,brief,writing,voice}，每项是非空字符串且不超过700字。",
    "research只判断题值、受众、任务画像和研究缺口；brief只在渐进加载的候选卡中做0到3个必要方法选择并执行删除测试；writing只执行成稿契约和Persona，不重新决策；voice只控制稳定声纹及按任务适配。不要写课程。",
    `Persona：${compact(JSON.stringify(persona),10000)}`,
    `Skill体系摘要：${compact(skillSummary.join("\n"),30000)}`,
  ].join("\n\n"),4000);
  const modules=parseJson(modulesRaw,{});
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
    const skillModules={schemaVersion:2,...modules,persona,discoveredMethods:merged.skills.map((item)=>({key:item.id,name:item.name,level:item.level,parentSkillId:item.parentSkillId,summary:item.description,solves:item.solves,when:item.when,notFor:item.notFor,requires:item.requires,conflictsWith:item.conflictsWith,steps:item.steps,stoppingRule:item.stoppingRule,positiveExamples:item.positiveExamples,counterExamples:item.counterExamples,supportCount:item.supportCount,evidence:(item.sourceWorkFingerprints||[]).slice(0,8).map((fp)=>({title:fp,excerpt:"证据见creative_coach_work_analyses"}))})),skillHierarchy:merged.hierarchy,stoppingRules:merged.stoppingRules,skillPatches:merged.patches,trainingCheckpoint:{phase:"candidate-ready",completedAt:new Date().toISOString()}};
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
      await client.query(`update creative_coaches set status='active',latest_version=$2,identity_card=$3::jsonb,updated_at=now() where id=$1`, [coachId,version.rows[0].version,JSON.stringify({title:persona.identity||`${creatorName}创作教练`,summary:(persona.stablePositions||[]).slice(0,2).join("；"),styleTags:(persona.voiceTraits||[]).slice(0,3),bestFor:(persona.audience||[]).slice(0,3).join("、")})]);
      await client.query("commit");
    } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
  }
  console.log(JSON.stringify({phase:autoActivate?"active":"candidate-ready",coachId,versionId,version:version.rows[0].version,fullCorpus:works.length,deepSamples:deepWorks.length,skills:merged.skills.length,previousVersion:previous.rows[0]?.version}));
}

try { await main(); } catch (error) { console.error(error); process.exitCode=1; } finally { await pool.end(); }
