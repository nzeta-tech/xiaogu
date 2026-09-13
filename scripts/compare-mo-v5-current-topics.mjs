#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const base = (process.env.MODEL_API_BASE || "https://api.openai.com/v1").replace(/\/$/, "");
const key = process.env.MODEL_API_KEY;
const models = [...new Set([process.env.TRAINING_MODEL_NAME || process.env.MODEL_NAME || "gpt-5.6-terra", process.env.TRAINING_FALLBACK_MODEL || "gpt-5.5"])];
const root = new URL("../artifacts/mo-v51-current-topics/", import.meta.url);
const checkpointPath = new URL("comparison.json", root);
const reportPath = new URL("report.md", root);
const clean = (v, n = 2000) => String(v || "").replace(/\s+/g, " ").trim().slice(0, n);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseJson(text) {
  const match = String(text).match(/\{[\s\S]*\}/);
  if (!match) throw new Error("missing JSON object");
  return JSON.parse(match[0]);
}

async function complete(messages, maxTokens, temperature = 0.3) {
  let error;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const model = models[attempt % models.length];
    try {
      const response = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({ model, temperature, max_tokens: maxTokens, messages }),
        signal: AbortSignal.timeout(250_000),
      });
      if (response.ok) return { text: clean((await response.json()).choices?.[0]?.message?.content, 12000), model };
      error = new Error(`HTTP ${response.status}: ${clean(await response.text(), 240)}`);
      if (response.status < 500 && response.status !== 429) throw error;
    } catch (e) { error = e; }
    await sleep(Math.min(30_000, 2_000 * 2 ** attempt));
  }
  throw error;
}

function pickEvenly(rows, count) {
  if (rows.length <= count) return rows;
  return Array.from({ length: count }, (_, i) => rows[Math.floor(i * (rows.length - 1) / (count - 1))]);
}

async function loadState() {
  try { return JSON.parse(await readFile(checkpointPath, "utf8")); } catch { return null; }
}

async function save(state) {
  await mkdir(root, { recursive: true });
  await writeFile(checkpointPath, `${JSON.stringify(state, null, 2)}\n`);
}

function coachPrompt(row) {
  return [`【IP定位】\n${row.ip_positioning_prompt}`, `【获客增长】\n${row.growth_prompt}`, `【内容创作】\n${row.content_creation_prompt}`,
    "执行顺序：先判断本题强化的长期定位与受众，再确定本题的关系目标，最后选择切口、结构与收束。不得虚构输入之外的事实、经历、案例或数字。"].join("\n\n");
}

async function generate(coach, topic) {
  const user = [
    "基于以下当前热点，写一篇可直接录制的60—90秒中文口播文案，约320—500字。",
    "只输出口播正文，不输出标题、分析、标签或创作说明。保持热点事实，不新增时效性事实；输入证据不足时收窄结论。不要机械地把所有热点转成卖保险。",
    `Tab：${topic.tab}\n标题：${topic.title}\n来源：${topic.source}\n已知事实：${topic.summary}\n系统建议角度（仅供参考，可拒绝）：${topic.angle}\n风险提示：${topic.risk}`,
  ].join("\n\n");
  return complete([{ role: "system", content: coach.prompt }, { role: "user", content: user }], 1100, 0.55);
}

async function decideMo(coach, topic) {
  const methods = coach.methods.map((method) => ({ key:method.key,name:method.name,summary:method.summary,appliesTo:method.appliesTo,notFor:method.notFor,evidence:method.evidence?.slice(0,2) }));
  const prompt = [
    "你是Mo姐教练，当前只做本题决策，不写正文。选择与放弃都是教练能力。",
    "worthCreating只判断能否基于现有事实形成有价值的内容，不判断是否适合财富迁移。能在原议题形成判断就应为true；只有事实严重不足、存在不可控风险或完全无法形成判断才为false。",
    "一篇只允许一个核心判断、一个主方法，最多一个辅助方法。社会生活题与财富没有自然因果链时，wealthMigration必须为false，但仍须围绕原议题创作，不得误判成放弃选题；也不得为了显示专业而自动加入保险、现金流、应急金、养老教育或CTA。",
    "根据题材选择本题声纹，不套固定口头禅。严格只返回JSON：{worthCreating,topicRelation:'strong'|'weak'|'none',wealthMigration,audience,coreClaim,primaryMethod,secondaryMethod:null|string,structure:string[],endingMode:'观点停留'|'行动提醒'|'资料承接'|'不承接',forbiddenMoves:string[],voice:{openingMode,reasoningTone,sentenceRhythm,endingTone,avoid:string[]}}。structure最多4步。",
    `【Mo姐证据方法库】\n${JSON.stringify(methods)}`,
    `【热点】\nTab：${topic.tab}\n标题：${topic.title}\n来源：${topic.source}\n事实：${topic.summary}\n风险提示：${topic.risk}`,
  ].join("\n\n");
  const result = await complete([{role:"user",content:prompt}],1600,0.15);
  const decision = parseJson(result.text);
  if (!decision.coreClaim || !decision.primaryMethod || !Array.isArray(decision.forbiddenMoves) || !decision.voice) throw new Error("incomplete Mo decision");
  return { ...decision, model:result.model };
}

async function writeMo(coach, topic, decision) {
  const selected = coach.methods.filter((method) => [decision.primaryMethod,decision.secondaryMethod].filter(Boolean).some((name) => name===method.key || name===method.name));
  const methodCards = (selected.length ? selected : coach.methods.filter((method) => method.name===decision.primaryMethod).slice(0,1)).map((method) => ({ name:method.name,summary:method.summary,steps:method.steps,notFor:method.notFor,evidence:method.evidence?.slice(0,3) }));
  const prompt = [
    "你是口播写作者，不是策略师。Mo姐教练已完成决策，必须服从；不得重新选择受众、主张、方法、财富迁移或收束。",
    "每段只服务coreClaim；只能使用所选方法；forbiddenMoves绝对不得出现。原始证据只用于理解推进方式，禁止复制其中专属事实、数字和句子。",
    "输出320—500字、60—90秒可直接录制的中文口播正文；不输出标题、分析、字段或说明。",
    `【教练决策单】\n${JSON.stringify(decision)}`,
    `【本题允许的方法卡】\n${JSON.stringify(methodCards)}`,
    `【当前热点事实】\n标题：${topic.title}\n来源：${topic.source}\n${topic.summary}\n${topic.risk}`,
  ].join("\n\n");
  return complete([{role:"user",content:prompt}],1100,0.55);
}

async function evaluateBatch(items) {
  const payload = items.map((item) => ({ id: item.id, tab: item.tab, title: item.title, fact: item.summary,
    A: item.order === "mo-first" ? item.mo.text : item.default.text,
    B: item.order === "mo-first" ? item.default.text : item.mo.text }));
  const rubric = `你是匿名口播文案评审。仅依据给定热点事实评价A/B，不猜教练身份。每项1-5分：topicFidelity热点保真、openingTension开头张力与代入、singleJudgment单一清晰判断、evidenceUse事实服务论证、structureFit结构适题、spokenNaturalness口语自然、growthFit自然获客承接、boundarySafety边界与克制、distinctiveness跨题辨识度。另判断genericTemplate是否落入可替换热点的通用保险模板。严格返回JSON {items:[{id,A:{各分数,genericTemplate:boolean},B:{...},winner:"A"|"B"|"tie",reason:string}]}，reason不超过80字。`;
  const result = await complete([{ role: "system", content: rubric }, { role: "user", content: JSON.stringify(payload) }], 4200, 0.1);
  const parsed = parseJson(result.text);
  if (!Array.isArray(parsed.items) || parsed.items.length !== items.length) throw new Error("incomplete evaluation batch");
  return parsed.items;
}

function average(values) { return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0; }

function report(state) {
  const axes = ["topicFidelity", "openingTension", "singleJudgment", "evidenceUse", "structureFit", "spokenNaturalness", "growthFit", "boundarySafety", "distinctiveness"];
  const labels = { topicFidelity:"热点保真",openingTension:"开头张力/代入",singleJudgment:"单一判断",evidenceUse:"证据使用",structureFit:"结构适配",spokenNaturalness:"口语自然",growthFit:"获客承接",boundarySafety:"边界安全",distinctiveness:"辨识度" };
  const normalized = state.items.map((item) => {
    const e = item.evaluation; const mo = item.order === "mo-first" ? e.A : e.B; const d = item.order === "mo-first" ? e.B : e.A;
    const winner = e.winner === "tie" ? "tie" : ((e.winner === "A") === (item.order === "mo-first") ? "mo" : "default");
    return { ...item, scores: { mo, default: d }, winner, reason: e.reason };
  });
  const wins = normalized.reduce((a, x) => (a[x.winner]++, a), { mo:0, default:0, tie:0 });
  const lines = [`# 默认教练 vs Mo姐 V5.1候选｜当前热点30题口播对比报告`, "", `- 生成时间：${state.generatedAt}`, `- 热点批次：${state.source.completedAt}`, `- 样本：${Object.entries(state.source.tabCounts).map(([k,v])=>`${k}${v}条`).join("、")}`, `- 模型：${models.join(" / ")}`, `- 胜负：Mo姐 V5.1 ${wins.mo}｜默认 ${wins.default}｜平局 ${wins.tie}`, "", "## 总体量化结果", "", "| 维度 | 默认教练 | Mo姐 V5.1 | 差值 |", "|---|---:|---:|---:|"];
  for (const axis of axes) { const d=average(normalized.map(x=>Number(x.scores.default[axis])||0)); const m=average(normalized.map(x=>Number(x.scores.mo[axis])||0)); lines.push(`| ${labels[axis]} | ${d.toFixed(2)} | ${m.toFixed(2)} | ${(m-d).toFixed(2)} |`); }
  const dg=normalized.filter(x=>x.scores.default.genericTemplate).length, mg=normalized.filter(x=>x.scores.mo.genericTemplate).length;
  lines.push("", `通用模板判定：默认 ${dg}/30，Mo姐 V5.1 ${mg}/30。`, "", "## 分Tab结果", "");
  for (const tab of [...new Set(normalized.map(x=>x.tab))]) { const xs=normalized.filter(x=>x.tab===tab); const w=xs.reduce((a,x)=>(a[x.winner]++,a),{mo:0,default:0,tie:0}); lines.push(`- ${tab}：Mo姐 ${w.mo} 胜，默认 ${w.default} 胜，平局 ${w.tie}。`); }
  lines.push("", "## 逐题对比", "");
  for (const x of normalized) lines.push(`### ${x.id}｜[${x.tab}] ${x.title}`, "", `结论：${x.winner === "mo" ? "Mo姐 V5.1" : x.winner === "default" ? "默认教练" : "平局"}。${x.reason}`, "", `Mo姐决策：${x.moDecision.coreClaim}；主方法：${x.moDecision.primaryMethod}；财富迁移：${x.moDecision.wealthMigration ? "是" : "否"}；收束：${x.moDecision.endingMode}。`, "", "**默认教练口播**", "", x.default.text, "", "**Mo姐 V5.1口播**", "", x.mo.text, "");
  lines.push("## 方法说明", "", "同一热点分别独立生成；评审阶段随机交换A/B顺序并隐藏教练身份。评分属于同一模型裁判的相对评价，适合发现系统性差异，不等同于真实平台播放或转化实验。", "");
  return lines.join("\n");
}

async function main() {
  if (!key) throw new Error("MODEL_API_KEY is required");
  let state = await loadState();
  if (!state) {
    const run = (await pool.query(`select id,completed_at from topic_ingestion_runs where status='completed' order by completed_at desc limit 1`)).rows[0];
    const topics = (await pool.query(`select topic_tab tab,title,source,summary,recommended_angle angle,risk_note risk from topic_snapshots where ingestion_run_id=$1 order by topic_tab,created_at`, [run.id])).rows;
    const byTab = Map.groupBy(topics, (x) => x.tab); const available = [...byTab.keys()];
    const allocation = available.length === 2 ? Object.fromEntries(available.map((t) => [t, 15])) : Object.fromEntries(available.map((t,i)=>[t,Math.floor(30/available.length)+(i<30%available.length?1:0)]));
    const selected = available.flatMap((tab) => pickEvenly(byTab.get(tab), allocation[tab])).slice(0, 30).map((x,i)=>({ id:`T${String(i+1).padStart(2,"0")}`,...x,order:i%2?"default-first":"mo-first" }));
    const coaches = await pool.query(`select c.name,c.is_system,v.version,v.ip_positioning_prompt,v.content_creation_prompt,v.growth_prompt,v.skill_modules from creative_coach_versions v join creative_coaches c on c.id=v.coach_id where v.status='active' and (c.is_system=true or c.name='Mo姐教练')`);
    const d=coaches.rows.find(x=>x.is_system), mo=coaches.rows.find(x=>x.name==='Mo姐教练'); if(!d||!mo) throw new Error("missing active coaches");
    state={schemaVersion:2,generatedAt:new Date().toISOString(),source:{runId:run.id,completedAt:run.completed_at,tabCounts:Object.fromEntries(Object.entries(allocation))},coaches:{default:{name:d.name,version:d.version,prompt:coachPrompt(d)},mo:{name:mo.name,version:mo.version,methods:mo.skill_modules?.discoveredMethods||[]}},items:selected}; if(!state.coaches.mo.methods.length)throw new Error("Mo methods missing"); await save(state);
  }
  for (let offset=0;offset<state.items.length;offset+=2) {
    const batch=state.items.slice(offset,offset+2);
    await Promise.all(batch.map(async (item) => {
      const [defaultResult,decisionResult]=await Promise.all([
        item.default ? Promise.resolve(item.default) : generate(state.coaches.default,item),
        item.moDecision ? Promise.resolve(item.moDecision) : decideMo(state.coaches.mo,item),
      ]);
      item.default=defaultResult; item.moDecision=decisionResult;
      if(!item.mo)item.mo=await writeMo(state.coaches.mo,item,item.moDecision);
      console.log(JSON.stringify({phase:"generate",completed:state.items.filter(x=>x.default&&x.mo).length,total:30,id:item.id}));
    }));
    await save(state);
  }
  for(let i=0;i<state.items.length;i+=3){const batch=state.items.slice(i,i+3); if(batch.every(x=>x.evaluation))continue; const evals=await evaluateBatch(batch); for(const item of batch)item.evaluation=evals.find(x=>x.id===item.id); await save(state); console.log(JSON.stringify({phase:"evaluate",completed:state.items.filter(x=>x.evaluation).length,total:30}));}
  await writeFile(reportPath, report(state)); console.log(JSON.stringify({phase:"completed",checkpoint:checkpointPath.pathname,report:reportPath.pathname}));
}

try { await main(); } finally { await pool.end(); }
