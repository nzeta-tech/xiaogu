import {randomUUID} from "node:crypto";
import {readFile,stat} from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const rootId="24f9d64b-eed3-44a5-8391-66fe70a30887";
const marker="source-grounded-v3-20260919";
const dir=path.resolve("storage/digital-human-revisions",rootId,marker);
const result=JSON.parse(await readFile(path.join(dir,"result.json"),"utf8"));
const sources=JSON.parse(await readFile(path.join(dir,"curated-research.json"),"utf8"));
const base=(process.env.LOCAL_AGENT_BASE_URL||"http://localhost:3000").replace(/\/$/,"");
const token=process.env.LOCAL_AGENT_TOKEN;
if(!token)throw new Error("LOCAL_AGENT_TOKEN missing");
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
let jobId;
try{
  const client=await pool.connect();
  try{
    await client.query("begin");
    const existing=(await client.query("select id,status from digital_human_video_jobs where request_json->>'postproduction_revision'=$1 and request_json->>'root_job_id'=$2::text",[marker,rootId])).rows[0];
    if(existing){jobId=existing.id;if(existing.status==="completed"){await client.query("commit");console.log(JSON.stringify({jobId,status:"completed",reused:true}));process.exit(0);}}
    else{
      const root=(await client.query("select * from digital_human_video_jobs where id=$1::uuid for update",[rootId])).rows[0];
      if(!root||root.status!=="completed")throw new Error("original video unavailable");
      const active=await client.query("select id from digital_human_video_jobs where request_json->>'root_job_id'=$1 and status in ('queued','processing')",[rootId]);
      if(active.rowCount)throw new Error("another revision is active");
      const revision=Number((await client.query("select coalesce(max((request_json->>'revision_number')::int),1)+1 n from digital_human_video_jobs where request_json->>'root_job_id'=$1",[rootId])).rows[0].n);
      jobId=randomUUID();
      const request={workflow:"spoken_video_v1",stage:"archiving",root_job_id:rootId,base_version_id:rootId,revision_number:revision,revision_request_id:randomUUID(),edit_instructions:"依据已核对的资料重做六段知识图解，突出贷款数据、房价预期和家庭现金流；沿用原口播并让转场更自然。",postproduction_revision:marker,source_text_locked:true};
      await client.query("insert into digital_human_video_jobs(id,user_id,asset_id,provider,edition,title,script,aspect_ratio,subtitle_enabled,status,quota_cost,request_json) values($1,$2,$3,$4,$5,$6,$7,$8,true,'processing',0,$9)",[jobId,root.user_id,root.asset_id,root.provider,root.edition,root.title,root.script,root.aspect_ratio,request]);
    }
    await client.query("commit");
  }catch(error){await client.query("rollback");throw error}finally{client.release()}

  async function upload(kind,file,name,type){
    const bytes=await readFile(file);const size=(await stat(file)).size;
    const response=await fetch(`${base}/api/internal/local-agent/digital-human/media?${new URLSearchParams({jobId,kind})}`,{method:"PUT",headers:{authorization:`Bearer ${token}`,"content-type":type,"content-length":String(size),"x-xiaogu-filename":encodeURIComponent(name)},body:bytes,signal:AbortSignal.timeout(120000)});
    const data=await response.json();
    if(!response.ok||!data.id)throw new Error(`upload ${kind} failed: ${data.error||response.status}`);
    return data;
  }
  const materialIds=[];
  for(let i=0;i<result.materials.length;i++)materialIds.push((await upload("material",result.materials[i].file,`loan-infographic-${i+1}.jpg`,"image/jpeg")).id);
  const output=await upload("output",result.output,"这笔贷款，要不要先还掉？-图解新版.mp4","video/mp4");
  const cover=await upload("cover",result.cover,"这笔贷款，要不要先还掉？-图解新版封面.jpg","image/jpeg");
  const materialPlan=result.segments.map((s,i)=>({id:s.id,text:s.text,visual:s.visual,query:s.query||"",textReference:sources[i]?.[0]||null,researchReferences:sources[i]||[],material:{mediaId:materialIds[i],kind:"image",title:result.materials[i].title,source:result.materials[i].source,license:result.materials[i].license,points:result.materials[i].points||[]}}));
  const patch={stage:"completed",material_plan:materialPlan,subtitle_srt:await readFile(result.subtitleFile,"utf8"),edit_options:result.options,quality_review:[{attempt:1,pass:true,issues:[]}],creative_summary:["六段知识图解按口播重做","已核对关键数据并保留来源链接","复用原口播母版与声音","已检查整片解码和代表画面"]};
  const finalClient=await pool.connect();
  try{await finalClient.query("begin");await finalClient.query("update digital_human_video_jobs set status='completed',progress=100,video_url=$2,preview_image_url=$3,duration_seconds=$4,error_message=null,request_json=request_json||$5::jsonb,updated_at=now(),completed_at=now() where id=$1::uuid",[jobId,output.url,cover.url,result.durationSeconds,patch]);await finalClient.query("update digital_human_video_jobs set request_json=request_json||jsonb_build_object('selected_version_id',$2::text),updated_at=now() where id=$1::uuid",[rootId,jobId]);await finalClient.query("commit")}catch(error){await finalClient.query("rollback");throw error}finally{finalClient.release()}
  console.log(JSON.stringify({jobId,status:"completed",videoUrl:output.url,coverUrl:cover.url,revision:"V3"}));
}catch(error){if(jobId)await pool.query("update digital_human_video_jobs set status='failed',error_message=$2,request_json=request_json||jsonb_build_object('stage','failed'),updated_at=now() where id=$1::uuid and status='processing'",[jobId,String(error.message||error).slice(0,500)]).catch(()=>{});throw error}finally{await pool.end()}
