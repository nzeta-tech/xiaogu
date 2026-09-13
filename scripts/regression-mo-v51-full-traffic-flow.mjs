#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { SignJWT } from "jose";
import { Pool } from "pg";

const pool=new Pool({connectionString:process.env.DATABASE_URL});
const api=(process.env.FULL_FLOW_API_BASE||"http://127.0.0.1:3000").replace(/\/$/,"");
const v5="2c3ad4f9-f45c-4620-bccf-778c81044d2c";
const root=new URL(`../artifacts/${process.env.FULL_FLOW_ARTIFACT_DIR||"mo-v51-full-traffic-flow"}/`,import.meta.url);
const perTab=Math.max(1,Number(process.env.FULL_FLOW_PER_TAB||15));
const checkpointPath=new URL("runs.json",root);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const clean=(x,n=1200)=>String(x||"").replace(/\s+/g," ").trim().slice(0,n);

async function sessionToken(){const {rows}=await pool.query(`select id,organization_id,name,email,role,session_version,terms_accepted_version from users where role='admin' and status='active' order by created_at limit 1`);const u=rows[0];const secret=new TextEncoder().encode(process.env.AUTH_SECRET||process.env.NEXTAUTH_SECRET||"dev-secret-change-before-production");return new SignJWT({id:u.id,organizationId:u.organization_id,name:u.name,email:u.email,role:u.role,sessionVersion:u.session_version,termsAcceptedVersion:u.terms_accepted_version}).setProtectedHeader({alg:"HS256"}).setIssuedAt().setExpirationTime("12h").sign(secret)}
async function load(){try{return JSON.parse(await readFile(checkpointPath,"utf8"))}catch{return null}}
async function save(state){await mkdir(root,{recursive:true});await writeFile(checkpointPath,JSON.stringify(state,null,2)+"\n")}
function pick(rows,n){return rows.length<=n?rows:Array.from({length:n},(_,i)=>rows[Math.floor(i*(rows.length-1)/(n-1))])}

async function prepare(token,item,coach){
  const values={source:`【V5.1正式全链路回归｜${item.id}】\nTab：${item.tab}\n标题：${item.title}\n来源：${item.source}\n已知事实：${item.summary}\n建议角度：${item.angle}\n风险提示：${item.risk}\n只使用以上事实；信息不足时收窄结论。`,creative_coach_version_ids:[coach==="default"?"default":v5]};
  for(let attempt=0;attempt<8;attempt++){
    const response=await fetch(`${api}/api/creation/apps/traffic-copy/prepare`,{method:"POST",headers:{"content-type":"application/json",cookie:`ica_session=${token}`},body:JSON.stringify({values}),signal:AbortSignal.timeout(90_000)});
    const body=await response.json().catch(()=>({}));
    if(response.ok&&body.work?.id)return {workId:body.work.id,values};
    if(response.status===429||response.status===409||response.status>=500){await sleep(Math.min(60_000,5000*2**attempt));continue}
    throw new Error(`prepare ${coach} ${item.id}: ${response.status} ${clean(body.error,300)}`);
  }
  throw new Error(`prepare exhausted ${coach} ${item.id}`);
}

async function waitWork(workId){
  for(let attempt=0;attempt<150;attempt++){
    const {rows}=await pool.query(`select w.status,w.app_run_id,r.status run_status,r.result_json,r.result_text,v.content,v.content_json from works w left join app_runs r on r.id=w.app_run_id left join lateral(select content,content_json from work_versions where work_id=w.id order by version_no desc limit 1)v on true where w.id=$1`,[workId]);
    const row=rows[0]; if(!row)throw new Error(`work missing ${workId}`);
    if(row.run_status==="failed")throw new Error(`run failed ${workId}`);
    if(row.run_status==="succeeded"&&String(row.content||row.result_text||"").trim())return {workId,status:row.status,runId:row.app_run_id,text:String(row.content||row.result_text),contentJson:row.content_json,resultJson:row.result_json};
    await sleep(4000);
  }
  throw new Error(`work timeout ${workId}`);
}

async function runOne(state,token,item,coach){
  if(item[coach]?.text)return;
  for(let attempt=0;attempt<6;attempt++){
    try{
      if(!item[coach]?.workId){const prepared=await prepare(token,item,coach);item[coach]={...prepared};await save(state)}
      item[coach]={...item[coach],...await waitWork(item[coach].workId)};await save(state);
      console.log(JSON.stringify({phase:"full-flow",completed:state.items.reduce((n,x)=>n+(x.default?.text?1:0)+(x.mo?.text?1:0),0),total:state.items.length*2,id:item.id,coach,workId:item[coach].workId}));
      return;
    }catch(error){
      if(!String(error?.message||error).includes("run failed")||attempt===5)throw error;
      item[coach]={lastFailedWorkId:item[coach]?.workId,lastFailureAt:new Date().toISOString()};await save(state);
      await sleep(Math.min(120_000,15_000*2**attempt));
    }
  }
}

async function main(){
  let state=await load();
  if(!state){const run=(await pool.query(`select id,completed_at from topic_ingestion_runs where status='completed' order by completed_at desc limit 1`)).rows[0];const rows=(await pool.query(`select topic_tab tab,title,source,summary,recommended_angle angle,risk_note risk from topic_snapshots where ingestion_run_id=$1 order by topic_tab,created_at`,[run.id])).rows;const groups=Map.groupBy(rows,x=>x.tab);const tabs=[...groups.keys()].filter(x=>groups.get(x)?.length);const allocation=Object.fromEntries(tabs.map(x=>[x,Math.min(perTab,groups.get(x).length)]));const items=tabs.flatMap(tab=>pick(groups.get(tab),allocation[tab])).map((x,i)=>({id:`F${String(i+1).padStart(2,"0")}`,...x}));state={schemaVersion:2,architectureVersion:7,generatedAt:new Date().toISOString(),source:{runId:run.id,completedAt:run.completed_at,allocation},items};await save(state)}
  const forced=new Set(String(process.env.FULL_FLOW_FORCE||"").split(",").map(x=>x.trim()).filter(Boolean));
  for(const item of state.items)for(const coach of ["default","mo"])if(forced.has(`${item.id}:${coach}`)){item[coach]={forcedAt:new Date().toISOString(),previousWorkId:item[coach]?.workId};}
  if(forced.size)await save(state);
  const token=await sessionToken();
  for(let offset=0;offset<state.items.length;offset++){
    const item=state.items[offset];
    // CheapLLM can temporarily enforce a one-request-per-user ceiling. Keep
    // the production flows sequential; checkpoints make the longer run resumable.
    await runOne(state,token,item,"default");
    await runOne(state,token,item,"mo");
  }
  console.log(JSON.stringify({phase:"completed",output:checkpointPath.pathname}));
}
try{await main()}finally{await pool.end()}
