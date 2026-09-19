import { createHash } from "node:crypto";
import { requireLocalAgent } from "@/lib/local-agent/auth";
import { getPool } from "@/lib/db/client";
import { readDigitalHumanMedia } from "@/lib/digital-human/media-assets";
import { mediaResponse } from "@/lib/digital-human/media-response";

// Every read/checkpoint is fenced by the live lease; a stale worker cannot
// submit a second clone or overwrite a newer worker's provider checkpoint.
export async function POST(request: Request) {
  const unauthorized=requireLocalAgent(request);if(unauthorized)return unauthorized;
  const body=await request.json().catch(()=>null);
  if(!body||!/^[-0-9a-f]{36}$/i.test(body.taskId||"")||typeof body.leaseToken!=="string")return Response.json({error:"invalid_input"},{status:400});
  const client=await getPool().connect();
  try{
    await client.query("begin");
    const task=(await client.query<{owner_user_id:string;payload:{voiceId:string}}>(`select owner_user_id,payload from local_agent_tasks where id=$1 and task_type='spoken.voice.clone' and status='leased' and agent_id=$2 and lease_token_hash=$3 and lease_expires_at>now() for update`,[body.taskId,body.agentId,createHash("sha256").update(body.leaseToken).digest("hex")])).rows[0];
    if(!task){await client.query("rollback");return Response.json({error:"lease_not_active"},{status:409});}
    const voice=(await client.query<{id:string;name:string;status:string;provider_voice_id:string|null;metadata_json:Record<string,unknown>}>("select id,name,status,provider_voice_id,metadata_json from digital_human_voice_assets where id=$1 and user_id=$2 for update",[task.payload.voiceId,task.owner_user_id])).rows[0];
    if(!voice){await client.query("rollback");return Response.json({error:"voice_not_found"},{status:404});}
    if(body.action==="reserve"){
      if(voice.provider_voice_id||voice.metadata_json.clone_submission_started){await client.query("rollback");return Response.json({error:"submission_already_started"},{status:409});}
      await client.query("update digital_human_voice_assets set metadata_json=metadata_json||jsonb_build_object('clone_submission_started',true),updated_at=now() where id=$1",[voice.id]);
    }else if(body.action==="checkpoint"){
      if(typeof body.providerVoiceId!=="string"||!body.providerVoiceId||body.providerVoiceId.length>200){await client.query("rollback");return Response.json({error:"invalid_provider_id"},{status:400});}
      if(voice.provider_voice_id&&voice.provider_voice_id!==body.providerVoiceId){await client.query("rollback");return Response.json({error:"checkpoint_conflict"},{status:409});}
      await client.query("update digital_human_voice_assets set provider_voice_id=$2,updated_at=now() where id=$1",[voice.id,body.providerVoiceId]);
    }else if(!["state","recording"].includes(body.action)){await client.query("rollback");return Response.json({error:"invalid_action"},{status:400});}
    await client.query("commit");
    if(body.action==="recording"){
      const media=await readDigitalHumanMedia(task.owner_user_id,String(voice.metadata_json.recording_media_id||""));
      return media?mediaResponse(media):Response.json({error:"recording_unavailable"},{status:404});
    }
    return Response.json({voice:{name:voice.name,status:voice.status,providerVoiceId:voice.provider_voice_id,submissionStarted:voice.metadata_json.clone_submission_started===true}});
  }catch{await client.query("rollback").catch(()=>{});return Response.json({error:"voice_checkpoint_failed"},{status:503});}finally{client.release();}
}
