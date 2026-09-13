#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";

const root = new URL(`../artifacts/${process.env.MULTI_COACH_ARTIFACT_DIR || "multi-coach-v8-originals"}/`, import.meta.url);
const runsPath = new URL("runs.json", root);
const evaluationPath = new URL("evaluation.json", root);
const reportPath = new URL("report.md", root);
const base = (process.env.MODEL_API_BASE || "https://api.openai.com/v1").replace(/\/$/, "");
const key = process.env.MODEL_API_KEY;
const models = [...new Set([process.env.TRAINING_MODEL_NAME || process.env.MODEL_NAME || "gpt-5.6-terra", process.env.TRAINING_FALLBACK_MODEL || "gpt-5.5"])];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fidelityAxes = ["thesisFidelity", "reasoningFidelity", "evidenceFidelity", "boundaryFidelity", "mindShiftFidelity"];
const rewriteAxes = ["expressionIndependence", "structuralReorganization", "nonCopying"];
const coachAxes = ["voiceFidelity", "coachDistinctiveness", "methodFit", "nonGeneric"];
const qualityAxes = ["clarity", "informationDensity", "spokenNaturalness", "structureFit", "boundarySafety"];
const allAxes = [...fidelityAxes, ...rewriteAxes, ...coachAxes, ...qualityAxes];
const labels = {
  thesisFidelity:"核心判断",reasoningFidelity:"论证链",evidenceFidelity:"关键论据",boundaryFidelity:"条件边界",mindShiftFidelity:"认知变化",
  expressionIndependence:"表达独立",structuralReorganization:"结构重组",nonCopying:"非照搬",voiceFidelity:"作者声纹",coachDistinctiveness:"教练辨识度",methodFit:"方法适配",nonGeneric:"非通用化",
  clarity:"清晰度",informationDensity:"信息密度",spokenNaturalness:"口语自然",structureFit:"结构适配",boundarySafety:"边界安全",
};

function parseJson(raw) { const match=String(raw).match(/\{[\s\S]*\}/); if(!match)throw new Error("missing JSON"); return JSON.parse(match[0]); }
async function complete(messages) {
  let lastError;
  for(let attempt=0;attempt<8;attempt+=1){
    try{
      const response=await fetch(`${base}/chat/completions`,{method:"POST",headers:{authorization:`Bearer ${key}`,"content-type":"application/json"},body:JSON.stringify({model:models[attempt%models.length],temperature:.1,max_tokens:4800,messages}),signal:AbortSignal.timeout(250_000)});
      if(response.ok)return parseJson((await response.json()).choices?.[0]?.message?.content);
      lastError=new Error(`HTTP ${response.status}: ${(await response.text()).slice(0,500)}`);
    }catch(error){lastError=error}
    await sleep(Math.min(120_000,5000*2**attempt));
  }
  throw lastError;
}
const average=(values)=>values.reduce((sum,value)=>sum+value,0)/Math.max(1,values.length);
const winnerFor=(winner,coachFirst)=>winner==="tie"?"tie":((winner==="A")===coachFirst?"coach":"default");

function normalizedRows(state,evaluation){
  return state.items.map((item,index)=>{
    const result=evaluation.items[item.sampleId];
    const coachFirst=index%2===0;
    return {item,result,coachScores:coachFirst?result?.A:result?.B,defaultScores:coachFirst?result?.B:result?.A,fidelityWinner:winnerFor(result?.fidelityWinner,coachFirst),productionWinner:winnerFor(result?.productionWinner,coachFirst)};
  });
}

function counts(rows,key){return rows.reduce((output,row)=>{output[row[key]]=(output[row[key]]||0)+1;return output},{coach:0,default:0,tie:0})}
function formatScoreTable(rows){
  const lines=["|维度|默认|对应教练|差值|","|---|---:|---:|---:|"];
  for(const axis of allAxes){const d=average(rows.map(row=>Number(row.defaultScores?.[axis])||0)),c=average(rows.map(row=>Number(row.coachScores?.[axis])||0));lines.push(`|${labels[axis]}|${d.toFixed(2)}|${c.toFixed(2)}|${(c-d).toFixed(2)}|`)}
  return lines;
}

function report(state,evaluation){
  const rows=normalizedRows(state,evaluation),groupIds=[...new Set(rows.map(row=>row.item.groupId))];
  const out=["# Mo姐 V8 跨作者原始文案配对评测","",`- 随机种子：${state.seed}`,`- 样本：${state.items.length}条原始文案；默认版与 Mo姐 V8 共${state.items.length*2}篇。`,`- 设计：所有样本都比较默认版与同一个 Mo姐 V8；原文是思想与声纹金标准，用于检验教练能力能否跨作者迁移且不覆盖原作者思想。`,`- 生成链路：内容资产隔离 → Skill渐进路由 → 教练重新立题 → 自动信息量时长 → 独立写作 → 语义/相似双检。`,`- 评分不考虑自动转写错字、同音词、断句和标点。`,""];
  for(const groupId of groupIds){
    const groupRows=rows.filter(row=>row.item.groupId===groupId),sample=groupRows[0].item,fw=counts(groupRows,"fidelityWinner"),pw=counts(groupRows,"productionWinner");
    const defaultLength=Math.round(average(groupRows.map(row=>row.item.default.characters))),coachLength=Math.round(average(groupRows.map(row=>row.item.coach.characters)),),originalLength=Math.round(average(groupRows.map(row=>String(row.item.transcript||"").replace(/\s/g,"").length)));
    const defaultOverlap=average(groupRows.map(row=>row.item.default.expressionOverlap?.overlapRatio||0)),coachOverlap=average(groupRows.map(row=>row.item.coach.expressionOverlap?.overlapRatio||0));
    const defaultPass=groupRows.filter(row=>row.item.default.finalAudit?.status==="pass").length,coachPass=groupRows.filter(row=>row.item.coach.finalAudit?.status==="pass").length;
    const confidenceNote = sample.lowConfidence
      ? `> 低置信度：${sample.lowConfidenceReason || "本组有效长素材较少，只适合发现明显问题，不能据此判定泛化能力。"}`
      : "";
    out.push(`## ${sample.groupLabel}｜${sample.coachLabel}`,"",confidenceNote,`- 思想/作者保真：教练 ${fw.coach}｜默认 ${fw.default}｜平局 ${fw.tie}`,`- 独立成品质量：教练 ${pw.coach}｜默认 ${pw.default}｜平局 ${pw.tie}`,`- 硬审校可直接发布：默认 ${defaultPass}/5｜教练 ${coachPass}/5`,`- 平均字数：原文 ${originalLength}｜默认 ${defaultLength}｜教练 ${coachLength}`,`- 8字片段重叠率：默认 ${(defaultOverlap*100).toFixed(1)}%｜教练 ${(coachOverlap*100).toFixed(1)}%（越低越不接近照搬，但不能以牺牲语义为代价）`,"",...formatScoreTable(groupRows),"");
  }
  out.push("## 逐题记录","");
  for(const row of rows){
    const names={coach:"对应教练",default:"默认",tie:"平局"};
    out.push(`### ${row.item.sampleId}｜${row.item.groupLabel}｜${String(row.item.title).replaceAll("|","/")}`,"",`作者保真：${names[row.fidelityWinner]}；成品质量：${names[row.productionWinner]}。${row.result?.reason||""}`,"",`原文资产特征：${row.result?.originalTraits||"—"}`,`教练版主要遗漏：${row.coachScores?.lostAssets||"—"}`,`默认版主要遗漏：${row.defaultScores?.lostAssets||"—"}`,`教练版独立改写：${row.coachScores?.copyRisk||"—"}`,`默认版独立改写：${row.defaultScores?.copyRisk||"—"}`,"",`原素材：${row.item.source_url||"—"}`,"");
  }
  out.push("## 判读边界","","- 保真高但重叠也高：可能只是贴近原稿，不代表教练能力。","- 重叠低但保真低：可能是过度改写或通用化。","- 合格结果应同时满足：语义资产完整、表达独立、原作者声纹不被覆盖、无不支持承诺。","- 本轮所有组使用同一个 Mo姐 V8；跨作者组的目标是验证方法迁移，不是把其他作者改写成 Mo姐本人。","");
  return out.filter((line,index,all)=>!(line===""&&all[index-1]==="")).join("\n");
}

async function main(){
  if(!key)throw new Error("MODEL_API_KEY is required");
  const state=JSON.parse(await readFile(runsPath,"utf8"));
  if(state.items.some(item=>!item.default?.text||!item.coach?.text))throw new Error("generation incomplete");
  let evaluation;try{evaluation=JSON.parse(await readFile(evaluationPath,"utf8"))}catch{evaluation={schemaVersion:1,items:{}}}
  for(let index=0;index<state.items.length;index+=1){
    const item=state.items[index];if(evaluation.items[item.sampleId])continue;
    const coachFirst=index%2===0;
    const payload={id:item.sampleId,creator:item.groupLabel,title:item.title,ORIGINAL:item.transcript,A:coachFirst?item.coach.text:item.default.text,B:coachFirst?item.default.text:item.coach.text,deterministicOverlap:{A:coachFirst?item.coach.expressionOverlap:item.default.expressionOverlap,B:coachFirst?item.default.expressionOverlap:item.coach.expressionOverlap}};
    const rubric=`ORIGINAL是该创作者本人原始口播自动转写，是思想、论证与声纹金标准；忽略错字、同音词、断句和标点，也不因原文较长自动加分。A/B是匿名独立改写。分别按1-5评分：${allAxes.join("、")}。保真看语义资产而非逐句相同；表达独立看是否重做钩子、句子和编排，产品名、数字、术语相同不算抄袭；voiceFidelity看该作者的设问、反差、信息密度、判断强度、案例与收束，不奖励固定口头禅；成品质量不得以删除关键证据换取简短。严格JSON {id,originalTraits,A:{所有维度数字,lostAssets:string,copyRisk:string},B:{所有维度数字,lostAssets:string,copyRisk:string},fidelityWinner:'A'|'B'|'tie',productionWinner:'A'|'B'|'tie',reason:string}。`;
    evaluation.items[item.sampleId]=await complete([{role:"system",content:rubric},{role:"user",content:JSON.stringify(payload)}]);
    await writeFile(evaluationPath,`${JSON.stringify(evaluation,null,2)}\n`);
    console.log(JSON.stringify({phase:"evaluate",completed:Object.keys(evaluation.items).length,total:state.items.length,sampleId:item.sampleId}));
  }
  await writeFile(reportPath,report(state,evaluation));
  console.log(JSON.stringify({phase:"completed",report:reportPath.pathname}));
}

await main();
