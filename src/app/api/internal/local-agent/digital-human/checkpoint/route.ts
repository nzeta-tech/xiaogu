import { createHash } from "node:crypto";
import { requireLocalAgent } from "@/lib/local-agent/auth";
import { getPool } from "@/lib/db/client";
export async function POST(request:Request){
  const unauthorized=requireLocalAgent(request);if(unauthorized)return unauthorized;
  const body=await request.json().catch(()=>null);
  if(!body||!/^[-0-9a-f]{36}$/i.test(body.taskId||"")||typeof body.leaseToken!=="string")return Response.json({error:"invalid_input"},{status:400});
  const db=await getPool().connect();
  try{
    await db.query("begin");
    const task=(await db.query<{owner_user_id:string;payload:{jobId:string}}>(`select owner_user_id,payload from local_agent_tasks where id=$1 and task_type='digital-human.video.produce' and status='leased' and agent_id=$2 and lease_token_hash=$3 and lease_expires_at>now() for update`,[body.taskId,body.agentId,createHash("sha256").update(body.leaseToken).digest("hex")])).rows[0];
    if(!task){await db.query("rollback");return Response.json({error:"lease_not_active"},{status:409});}
    const job=(await db.query<{provider_job_id:string|null;request_json:Record<string,unknown>}>("select provider_job_id,request_json from digital_human_video_jobs where id=$1 and user_id=$2 for update",[task.payload.jobId,task.owner_user_id])).rows[0];
    if(!job){await db.query("rollback");return Response.json({error:"job_not_found"},{status:404});}
    if(body.action==="reserve"){
      if(job.provider_job_id||job.request_json.provider_submission_started){await db.query("rollback");return Response.json({error:"submission_already_started"},{status:409});}
      await db.query("update digital_human_video_jobs set request_json=request_json||'{\"provider_submission_started\":true}'::jsonb,updated_at=now() where id=$1",[task.payload.jobId]);
    }else if(body.action!=="state"){await db.query("rollback");return Response.json({error:"invalid_action"},{status:400});}
    await db.query("commit");
    return Response.json({providerJobId:job.provider_job_id,submissionStarted:job.request_json.provider_submission_started===true});
  }catch{await db.query("rollback").catch(()=>{});return Response.json({error:"checkpoint_unavailable"},{status:503});}finally{db.release();}
}
