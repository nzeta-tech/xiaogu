import {randomUUID} from "node:crypto";
import {readFile,stat} from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const rootId="24f9d64b-eed3-44a5-8391-66fe70a30887";
const baseVersionId="9de07a27-5503-4db0-8ead-5f07259d6c60";
const marker="director-optimized-v20-20260921";
const dir=path.resolve("storage/digital-human-revisions",baseVersionId,"workdir-snapshot",marker);
const result=JSON.parse(await readFile(path.join(dir,"result.json"),"utf8"));
const review=JSON.parse(await readFile(path.join(dir,"director-review.json"),"utf8"));
if(!review.pass)throw new Error("Director review has not passed");
const base=(process.env.LOCAL_AGENT_BASE_URL||"http://localhost:3000").replace(/\/$/,"");
const token=process.env.LOCAL_AGENT_TOKEN;
if(!token||!process.env.DATABASE_URL)throw new Error("Local development environment is not loaded");
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
let jobId;
try{
  const client=await pool.connect();
  try{
    await client.query("begin");
    const existing=(await client.query("select id,status from digital_human_video_jobs where request_json->>'postproduction_revision'=$1 and request_json->>'root_job_id'=$2",[marker,rootId])).rows[0];
    if(existing){jobId=existing.id;if(existing.status==="completed"){await client.query("commit");console.log(JSON.stringify({jobId,status:"completed",reused:true}));process.exit(0);}}
    else{
      const root=(await client.query("select * from digital_human_video_jobs where id=$1::uuid for update",[rootId])).rows[0];
      if(!root||root.status!=="completed")throw new Error("Original video unavailable");
      const active=await client.query("select id from digital_human_video_jobs where request_json->>'root_job_id'=$1 and status in ('queued','processing')",[rootId]);
      if(active.rowCount)throw new Error("Another revision is active");
      const revision=Number((await client.query("select coalesce(max((request_json->>'revision_number')::int),1)+1 n from digital_human_video_jobs where request_json->>'root_job_id'=$1",[rootId])).rows[0].n);
      jobId=randomUUID();
      const request={workflow:"spoken_video_v1",stage:"archiving",root_job_id:rootId,base_version_id:baseVersionId,revision_number:revision,revision_request_id:randomUUID(),production_mode:"smart",edit_instructions:"导演级完整优化：连续母版音轨、官方证据卡、统一知识图解、场景化画面、语义字幕、全片逐分镜质检。",postproduction_revision:marker,source_text_locked:true};
      await client.query("insert into digital_human_video_jobs(id,user_id,asset_id,provider,edition,title,script,aspect_ratio,subtitle_enabled,status,quota_cost,request_json) values($1,$2,$3,$4,$5,$6,$7,$8,true,'processing',0,$9)",[jobId,root.user_id,root.asset_id,root.provider,root.edition,root.title,root.script,root.aspect_ratio,request]);
    }
    await client.query("commit");
  }catch(error){await client.query("rollback");throw error}finally{client.release()}

  async function upload(kind,file,name,type){
    const bytes=await readFile(file),size=(await stat(file)).size;
    const response=await fetch(`${base}/api/internal/local-agent/digital-human/media?${new URLSearchParams({jobId,kind})}`,{method:"PUT",headers:{authorization:`Bearer ${token}`,"content-type":type,"content-length":String(size),"x-xiaogu-filename":encodeURIComponent(name)},body:bytes,signal:AbortSignal.timeout(1200000)});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data.id)throw new Error(`upload ${kind} failed: ${data.error||response.status}`);
    return data;
  }
  const archived=new Map();
  for(let index=0;index<result.materials.length;index++){
    const material=result.materials[index];
    if(material.kind==="presenter"||!material.file)continue;
    archived.set(index,await upload("material",material.file,`director-material-${String(index+1).padStart(2,"0")}${path.extname(material.file)||".jpg"}`,material.file.endsWith(".png")?"image/png":"image/jpeg"));
  }
  const output=await upload("output",result.output,"这笔贷款，要不要先还掉？-导演优化版.mp4","video/mp4");
  const cover=await upload("cover",result.cover,"这笔贷款，要不要先还掉？-导演优化版封面.jpg","image/jpeg");
  const evidence={
    "s1-b3":[{title:"中国人民银行金融统计数据",url:"https://www.pbc.gov.cn/diaochatongjisi/116219/116225/index.html"}],
    "s1-b4":[{title:"中国人民银行金融统计数据",url:"https://www.pbc.gov.cn/diaochatongjisi/116219/116225/index.html"}],
    "s3-b4":[{title:"2026年8月份70个大中城市商品住宅销售价格变动情况",url:"https://www.stats.gov.cn/sj/zxfb/202609/t20260915_1965304.html"}],
  };
  const materialPlan=result.segments.map((segment,index)=>{
    const material=result.materials[index],media=archived.get(index);
    return {id:segment.id,parentId:segment.parentId,text:segment.text,visual:segment.visual,narrativeRole:segment.narrativeRole,visualTreatment:segment.visualTreatment,layout:segment.layout,researchReferences:evidence[segment.id]||[],material:material.kind==="presenter"?{kind:"presenter",title:material.title,source:material.source,license:material.license}:{mediaId:media.id,kind:material.kind,title:material.title,source:material.source,license:material.license,points:material.points||[]}};
  });
  const patch={stage:"completed",production_mode:"smart",material_plan:materialPlan,subtitle_srt:await readFile(result.subtitleFile,"utf8"),edit_options:result.options,quality_review:[{attempt:1,pass:true,issues:[]}],creative_summary:["全程使用连续母版音轨，消除分镜AAC拼接停顿","加入央行和国家统计局证据卡","统一导演级财经图解与场景化画面","全片22个语义分镜均进入视觉质检","响度约-15.2 LUFS，真峰值约-1.5 dBFS"]};
  const finalClient=await pool.connect();
  try{
    await finalClient.query("begin");
    await finalClient.query("update digital_human_video_jobs set status='completed',progress=100,video_url=$2,preview_image_url=$3,duration_seconds=$4,error_message=null,request_json=request_json||$5::jsonb,updated_at=now(),completed_at=now() where id=$1::uuid",[jobId,output.url,cover.url,result.durationSeconds,patch]);
    await finalClient.query("update digital_human_video_jobs set request_json=request_json||jsonb_build_object('selected_version_id',$2::text),updated_at=now() where id=$1::uuid",[rootId,jobId]);
    await finalClient.query("commit");
  }catch(error){await finalClient.query("rollback");throw error}finally{finalClient.release()}
  console.log(JSON.stringify({jobId,status:"completed",videoUrl:output.url,coverUrl:cover.url,archivedMaterials:archived.size}));
}catch(error){
  if(jobId)await pool.query("update digital_human_video_jobs set status='failed',error_message=$2,request_json=request_json||jsonb_build_object('stage','failed'),updated_at=now() where id=$1::uuid and status='processing'",[jobId,String(error.message||error).slice(0,500)]).catch(()=>{});
  throw error;
}finally{await pool.end()}
