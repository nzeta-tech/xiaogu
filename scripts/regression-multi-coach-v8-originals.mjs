#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { Pool } from "pg";
import {
  authorityForTrafficTask,
  applyTrafficDeterministicAuditChecks,
  buildTrafficCopyAuditPrompt,
  buildTrafficCopyCreativeBriefPrompt,
  buildTrafficCopyRevisionPrompt,
  buildTrafficCopyWritingPrompt,
  buildTrafficSourceBlueprintPrompt,
  estimateTrafficSpeakingRate,
  fallbackTrafficCopyCreativeBrief,
  fallbackTrafficSourceBlueprint,
  measureTrafficExpressionSimilarity,
  normalizeTrafficBriefForSource,
  parseTrafficCopyAudit,
  parseTrafficCopyCreativeBrief,
  parseTrafficSourceBlueprint,
  sanitizeTrafficNarrativeIdentity,
} from "../src/lib/creation/traffic-copy-architecture.ts";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const root = new URL(`../artifacts/${process.env.MULTI_COACH_ARTIFACT_DIR || "multi-coach-v8-originals"}/`, import.meta.url);
const checkpointPath = new URL("runs.json", root);
const baselineRunsPath = process.env.MULTI_COACH_BASELINE_RUNS;
const seed = process.env.MULTI_COACH_SEED || "multi-coach-v8-2026-08-26";
const base = (process.env.MODEL_API_BASE || "https://api.openai.com/v1").replace(/\/$/, "");
const key = process.env.MODEL_API_KEY;
const models = [...new Set([process.env.TRAINING_MODEL_NAME || process.env.MODEL_NAME || "gpt-5.6-terra", process.env.TRAINING_FALLBACK_MODEL || "gpt-5.5"])];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const rank = (value) => createHash("sha256").update(`${seed}:${value}`).digest("hex");
const clean = (value, limit = 12000) => String(value || "").trim().slice(0, limit);

const defaultGroups = [
  { id: "mo-wealth-view", label: "Mo姐-财富观", coachLabel: "Mo姐教练 V5", versionId: "2c3ad4f9-f45c-4620-bccf-778c81044d2c", runId: "1fd86806-26f3-4134-a875-67bdc551f7dd", count: 5, selection: "seeded-random", minChars: 600, maxChars: 2400 },
  { id: "mo-wealth-talk", label: "Mo姐-财富说", coachLabel: "Mo姐教练 V5", versionId: "2c3ad4f9-f45c-4620-bccf-778c81044d2c", runId: "440b63e2-2abc-46c0-a041-b390aa083458", count: 5, selection: "seeded-random", minChars: 600, maxChars: 2400 },
  { id: "victoria-harbour", label: "维港保典", coachLabel: "维港保典教练 V1", versionId: "937823a7-ebf6-482a-bb48-964ca664b81d", runId: "fd9216f5-6fb7-4063-8568-bd83945c3efc", count: 5, selection: "seeded-random", minChars: 600, maxChars: 2400 },
  { id: "teacher-yang", label: "杨老师", coachLabel: "杨老师教练 V1", versionId: "51f01a0d-2c46-4bad-8402-736aec34199e", runId: "7a587e18-047b-4d0d-ae5d-86b58d62bca2", count: 5, selection: "longest", minChars: 1, maxChars: 3000, lowConfidence: true },
  { id: "miss-wang-hk", label: "人间清醒王小姐HK", coachLabel: "人间清醒王小姐HK教练 V1", versionId: "87bf98c3-0df2-49ff-ba0f-819742369388", runId: "c628b00d-65c1-4112-b0e8-19e03d003bc7", count: 5, selection: "seeded-random", minChars: 80, maxChars: 2400 },
];

const groups = process.env.MULTI_COACH_GROUPS_FILE
  ? JSON.parse(await readFile(process.env.MULTI_COACH_GROUPS_FILE, "utf8"))
  : process.env.MULTI_COACH_GROUPS_JSON
    ? JSON.parse(process.env.MULTI_COACH_GROUPS_JSON)
    : defaultGroups;

async function complete(prompt, maxTokens = 6500) {
  let lastError;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const model = models[attempt % models.length];
    try {
      const response = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({ model, temperature: 0.15, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] }),
        signal: AbortSignal.timeout(250_000),
      });
      if (response.ok) return clean((await response.json()).choices?.[0]?.message?.content, 50000);
      lastError = new Error(`HTTP ${response.status}: ${clean(await response.text(), 500)}`);
    } catch (error) { lastError = error; }
    await sleep(Math.min(120_000, 5_000 * 2 ** attempt));
  }
  throw lastError;
}

async function loadState() { try { return JSON.parse(await readFile(checkpointPath, "utf8")); } catch { return null; } }
let saveQueue = Promise.resolve();
async function saveState(state) {
  const payload = `${JSON.stringify(state, null, 2)}\n`;
  saveQueue = saveQueue.then(async () => {
    await mkdir(root, { recursive: true });
    await writeFile(checkpointPath, payload);
  });
  return saveQueue;
}

function parseModules(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function coachRuntime(row) {
  const modules = parseModules(row.skill_modules);
  const methods = Array.isArray(modules.discoveredMethods) ? modules.discoveredMethods.slice(0, 12) : [];
  const taskPatterns = Array.isArray(modules.taskPatterns) ? modules.taskPatterns.slice(0, 16) : [];
  const stoppingRules = Array.isArray(modules.stoppingRules) ? modules.stoppingRules.slice(0, 16) : [];
  const hierarchy = Array.isArray(modules.skillHierarchy) ? modules.skillHierarchy.slice(0, 120) : [];
  const persona = modules.persona && typeof modules.persona === "object" ? modules.persona : null;
  return {
    identity: modules.persona?.identity || String(row.name || "").replace(/教练.*$/u, ""),
    brief: [modules.brief, row.content_creation_prompt, row.ip_positioning_prompt, row.growth_prompt].filter(Boolean).join("\n\n"),
    writing: [modules.writing || row.content_creation_prompt, modules.voice ? `【表达声纹】\n${modules.voice}` : "", persona ? `【Persona】\n${JSON.stringify(persona)}` : ""].filter(Boolean).join("\n\n"),
    methods,hierarchy,taskPatterns,stoppingRules,
  };
}

async function progressivelyLoadCandidateMethods(runtime, taskProfile) {
  if (!runtime.hierarchy?.length) return { text:runtime.methods.map((item) => JSON.stringify({ key:item.key,name:item.name,summary:item.summary,notFor:item.notFor })).join("\n"),ids:new Set(runtime.methods.flatMap((item)=>[item.key,item.name].filter(Boolean))) };
  const index = runtime.hierarchy.map((item) => JSON.stringify({ id:item.id,name:item.name,level:item.level,parentSkillId:item.parentSkillId,description:item.description,solves:item.solves,when:item.when,notFor:item.notFor,childSkillIds:item.childSkillIds })).join("\n");
  const raw = await complete(["你是Skill渐进加载路由器，不写正文。根据任务画像选择最多1个strategy和最多6个候选方法；允许不选。优先匹配solves/when/notFor。严格JSON {strategySkillIds:string[],candidateMethodIds:string[],rationale:string}。",`【任务画像】${JSON.stringify(taskProfile)}`,`【轻量目录】\n${index}`].join("\n\n"),1800);
  const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || "{}");
  const ids = new Set([...(Array.isArray(parsed.strategySkillIds)?parsed.strategySkillIds.slice(0,1):[]),...(Array.isArray(parsed.candidateMethodIds)?parsed.candidateMethodIds.slice(0,6):[])]);
  const selected=runtime.methods.filter((item) => ids.has(item.key));
  return { text:selected.map((item) => JSON.stringify(item)).join("\n"),ids:new Set(selected.flatMap((item)=>[item.key,item.name].filter(Boolean))) };
}

function selectedMethodCards(runtime, brief) {
  const selected = new Set(brief.selectedMethods.map((item) => item.methodId));
  return runtime.methods.filter((item) => selected.has(item.key) || selected.has(item.name)).map((item) => JSON.stringify(item)).join("\n");
}

async function buildInitialState() {
  if (baselineRunsPath) {
    const baseline = JSON.parse(await readFile(baselineRunsPath, "utf8"));
    const groupIds = new Set(String(process.env.MULTI_COACH_BASELINE_GROUP_IDS || "mo-wealth-view,mo-wealth-talk").split(",").map((item) => item.trim()).filter(Boolean));
    const version = process.env.MULTI_COACH_CANDIDATE_VERSION_ID
      ? await pool.query(`select v.id,v.version,v.skill_modules,v.ip_positioning_prompt,v.content_creation_prompt,v.growth_prompt,c.name from creative_coach_versions v join creative_coaches c on c.id=v.coach_id where v.id=$1`,[process.env.MULTI_COACH_CANDIDATE_VERSION_ID])
      : await pool.query(
        `select v.id,v.version,v.skill_modules,v.ip_positioning_prompt,v.content_creation_prompt,v.growth_prompt,c.name
           from creative_coach_versions v join creative_coaches c on c.id=v.coach_id
          where lower(c.name)=lower($1) and v.status in ('active','restored') order by v.version desc limit 1`,
        [process.env.MULTI_COACH_BASELINE_COACH || "Mo姐教练"],
      );
    if (!version.rows[0]) throw new Error("基准对照没有找到当前活动教练版本");
    const row = version.rows[0];
    const items = baseline.items.filter((item) => groupIds.has(item.groupId)).map((item) => ({
      ...item,
      coachLabel: process.env.MULTI_COACH_CANDIDATE_LABEL || `Mo姐教练 V${row.version}（V6.1）`,
      coachVersionId: row.id,
      v6: item.coach,
      coach: undefined,
      blueprint: undefined,
      authority: undefined,
    }));
    if (!items.length) throw new Error("基准对照没有匹配样本");
    return { schemaVersion: 2, architectureVersion: 8.1, seed, generatedAt: new Date().toISOString(), design: { comparison:"same-sample default-vs-v6-vs-v6.1", baselineRunsPath, groupIds:[...groupIds] }, runtimes:{ [row.id]:coachRuntime(row) }, items };
  }
  const runtimeById = new Map();
  for (const group of groups) {
    if (group.legacySkillVersionId) {
      const legacy = await pool.query(
        `select v.id,v.skill_prompt,s.name
           from avatar_creator_skill_versions v join avatar_creator_skills s on s.id=v.skill_id
          where v.id=$1`,
        [group.legacySkillVersionId],
      );
      if (!legacy.rows[0]) throw new Error(`${group.label}旧版教练不存在：${group.legacySkillVersionId}`);
      group.versionId = `legacy:${legacy.rows[0].id}`;
      runtimeById.set(group.versionId, { brief: legacy.rows[0].skill_prompt || "", writing: legacy.rows[0].skill_prompt || "", methods: [] });
      continue;
    }
    let version;
    if (group.versionId) {
      version = await pool.query(
        `select v.id,v.skill_modules,v.ip_positioning_prompt,v.content_creation_prompt,v.growth_prompt,c.name
           from creative_coach_versions v join creative_coaches c on c.id=v.coach_id where v.id=$1`,
        [group.versionId],
      );
    } else {
      version = await pool.query(
        `select v.id,v.skill_modules,v.ip_positioning_prompt,v.content_creation_prompt,v.growth_prompt,c.name
           from creative_coach_versions v join creative_coaches c on c.id=v.coach_id
          where lower(c.name)=lower($1) and v.status in ('active','restored')
          order by v.version desc limit 1`,
        [group.coachName],
      );
    }
    if (!version.rows[0]) throw new Error(`${group.label}没有可用教练版本`);
    group.versionId = version.rows[0].id;
    runtimeById.set(group.versionId, coachRuntime(version.rows[0]));
  }
  const items = [];
  for (const group of groups) {
    const runIds=Array.isArray(group.runIds)?group.runIds:[group.runId];
    const { rows } = await pool.query(
      `select id,title,transcript,source_url,length(trim(transcript)) chars
         from avatar_training_tasks
        where training_run_id=any($1::uuid[]) and status='succeeded' and length(trim(transcript)) between $2 and $3`,
      [runIds, group.minChars, group.maxChars],
    );
    const ordered = group.selection === "longest"
      ? rows.sort((a, b) => Number(b.chars) - Number(a.chars))
      : rows.sort((a, b) => rank(`${group.id}:${a.id}`).localeCompare(rank(`${group.id}:${b.id}`)));
    const selected = ordered.slice(0, group.count);
    if (selected.length < group.count) throw new Error(`${group.label}可用样本不足：${selected.length}/${group.count}`);
    items.push(...selected.map((row, index) => ({ sampleId:`${group.id}-${index + 1}`,groupId:group.id,groupLabel:group.label,coachLabel:group.coachLabel,coachVersionId:group.versionId,sourceRunId:runIds,selection:group.selection,lowConfidence:Boolean(group.lowConfidence),...row })));
  }
  return { schemaVersion: 1, architectureVersion: 8, seed, generatedAt: new Date().toISOString(), design: { comparison:"within-coach paired default-vs-own-coach with original as gold reference",groups }, runtimes:Object.fromEntries([...runtimeById.entries()]),items };
}

async function ensureBlueprint(state, item) {
  if (item.blueprint) return item.blueprint;
  const source = `素材库：${item.groupLabel}\n原作品标题：${item.title}\n以下为创作者本人原始口播的自动转写，错字和断句只按语义理解。\n\n${item.transcript}`;
  let blueprint = fallbackTrafficSourceBlueprint(source);
  try { blueprint = parseTrafficSourceBlueprint(await complete(buildTrafficSourceBlueprintPrompt(source)), source); } catch { /* checkpoint deterministic fallback */ }
  item.source = source;
  item.blueprint = blueprint;
  item.authority = authorityForTrafficTask(blueprint.taskMode);
  await saveState(state);
  return blueprint;
}

async function runAudit(source, draft, blueprint, authority, brief, creatorName) {
  let audit = parseTrafficCopyAudit("");
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      audit = applyTrafficDeterministicAuditChecks(parseTrafficCopyAudit(await complete(buildTrafficCopyAuditPrompt({ source, draft, blueprint, authority, brief, context:[] }), 3500)), draft, { brief,blueprint,creatorName });
      if (!audit.issues.some((item) => item.type === "audit_parse")) return audit;
    } catch { /* retry malformed audit */ }
  }
  return audit;
}

async function runVariant(state, item, kind) {
  if (item[kind]?.text) return;
  const blueprint = await ensureBlueprint(state, item);
  const authority = item.authority;
  const runtime = kind === "coach" ? state.runtimes[item.coachVersionId] : { brief:"",writing:"",methods:[],hierarchy:[] };
  const candidateRoute = kind === "coach" ? await progressivelyLoadCandidateMethods(runtime, blueprint.taskProfile) : { text:"",ids:new Set() };
  let brief = fallbackTrafficCopyCreativeBrief(item.source);
  try { brief = parseTrafficCopyCreativeBrief(await complete(buildTrafficCopyCreativeBriefPrompt({ source:item.source,creatorSkill:[runtime.brief,candidateRoute.text?`【渐进加载候选Skill】\n${candidateRoute.text}`:"【渐进加载结果】零方法"].filter(Boolean).join("\n\n"),blueprint,authority,promptHint:"在保持思想资产的前提下，创作一篇独立表达、可直接录制的口播。" }), 5000)); } catch { /* fallback remains auditable */ }
  brief=normalizeTrafficBriefForSource(brief,item.source,candidateRoute.ids);
  const methodCards = selectedMethodCards(runtime, brief);
  const writingPrompt = buildTrafficCopyWritingPrompt({ source:item.source,creatorSkill:[runtime.writing?`【内部 Persona 与声纹约束｜严禁在正文复述、介绍或暗示身份画像】\n${runtime.writing}`:"",methodCards,runtime.identity?`【唯一创作者称谓】${runtime.identity}。仅在自然需要自称时使用；原始转写里的近音人名、错别字或其他自称不得覆盖它。不得描述创作者身份、服务对象或内容定位。`:""].filter(Boolean).join("\n\n"),blueprint,authority,brief,context:[] });
  const draftV1 = sanitizeTrafficNarrativeIdentity(clean(await complete(writingPrompt, 6500), 30000));
  const firstAudit = await runAudit(item.source, draftV1, blueprint, authority, brief, runtime.identity);
  let text = draftV1, finalAudit = firstAudit;
  const revisionDrafts=[];
  for(let revisionAttempt=0;revisionAttempt<2&&finalAudit.status==="revise";revisionAttempt+=1){
    const repaired=sanitizeTrafficNarrativeIdentity(clean(await complete(buildTrafficCopyRevisionPrompt({ source:item.source,draft:text,blueprint,authority,brief,audit:finalAudit,context:[],creatorSkill:runtime.writing?`以下只控制声纹，严禁把身份、受众、定位或Persona说明写入正文：\n${runtime.writing}`:"" }), 6500), 30000));
    if(repaired)text=repaired;
    revisionDrafts.push(text);
    finalAudit=await runAudit(item.source,text,blueprint,authority,brief,runtime.identity);
  }
  if(finalAudit.status!=="pass")finalAudit=finalAudit.hardBlocking?{...finalAudit,status:"human_review"}:{...finalAudit,status:"pass"};
  const draftV2=revisionDrafts.at(-1)||null;
  const characters = text.replace(/\s/g, "").length;
  const speakingRate = estimateTrafficSpeakingRate({ characters, reasoningSteps:brief.durationBasis.reasoningSteps,evidenceUnits:brief.durationBasis.evidenceUnits,tension:brief.voicePlan.tension });
  item[kind] = { text,brief,draftV1,draftV2,revisionDrafts,firstAudit,finalAudit,characters,speakingRate,estimatedSeconds:Math.round(characters/speakingRate*60),expressionOverlap:measureTrafficExpressionSimilarity(item.source,text),completedAt:new Date().toISOString() };
  await saveState(state);
  console.log(JSON.stringify({ phase:"generate",completed:state.items.reduce((sum,current)=>sum+(current.default?.text?1:0)+(current.coach?.text?1:0),0),total:state.items.length*2,sampleId:item.sampleId,kind,finalStatus:finalAudit.status }));
}

async function main() {
  if (!key) throw new Error("MODEL_API_KEY is required");
  let state = await loadState();
  if (!state && process.env.MULTI_COACH_SOURCE_RUNS) {
    state=JSON.parse(await readFile(process.env.MULTI_COACH_SOURCE_RUNS,"utf8"));
    state={...state,architectureVersion:8.3,generatedAt:new Date().toISOString(),design:{...state.design,comparison:"same-fixed-samples default-vs-mo-v8-minimum-publish-guards",sourceRuns:process.env.MULTI_COACH_SOURCE_RUNS}};
    for(const item of state.items)item.coach=undefined;
    await saveState(state);
  }
  if (!state) { state = await buildInitialState(); await saveState(state); }
  for(const item of state.items){
    if(item.coach?.finalAudit?.status==="human_review"&&!item.coach.finalAudit.hardBlocking)item.coach.finalAudit.status="pass";
  }
  await saveState(state);
  if (process.env.MULTI_COACH_REGENERATE_COACH === "true") {
    for (const item of state.items) item.coach = undefined;
    await saveState(state);
  }
  const concurrency = Math.max(1, Math.min(2, Number(process.env.MULTI_COACH_CONCURRENCY || 1)));
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < state.items.length) {
      const item = state.items[nextIndex];
      nextIndex += 1;
      await runVariant(state, item, "default");
      await runVariant(state, item, "coach");
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  await saveQueue;
  console.log(JSON.stringify({ phase:"completed",output:checkpointPath.pathname }));
}

try { await main(); } finally { await pool.end(); }
