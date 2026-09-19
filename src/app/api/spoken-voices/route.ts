import { getSpokenVoiceAgentAvailability } from "@/lib/local-agent/repository";
import { z } from "zod";
import { requireSessionUser } from "@/lib/auth/session";
import { getPool, query } from "@/lib/db/client";
import { retiredChanjingResponse } from "@/lib/digital-human/retirement";
import { listCreatorVoices } from "@/lib/digital-human/store";
import { storeDigitalHumanMedia } from "@/lib/digital-human/media-assets";

export const runtime="nodejs";
export async function GET(){
  const user=await requireSessionUser();if(user instanceof Response)return user;
  const voices=await listCreatorVoices(user.id);
  return Response.json({voices:voices.filter(voice=>voice.provider==="heygen").map(voice=>({...voice,source:"creator",preview_audio_url:voice.preview_audio_url||""}))});
}

export async function POST(request:Request){
  const user=await requireSessionUser();if(user instanceof Response)return user;
  const form=await request.formData().catch(()=>null);
  if(!form||form.get("consent")!=="true")return Response.json({error:"请确认声音使用授权"},{status:400});
  const action=String(form.get("action")||"record"),name=String(form.get("name")||"").trim().slice(0,80);
  if(!name)return Response.json({error:"请输入声音名称"},{status:400});
  if(action==="chanjing")return retiredChanjingResponse();
  const recording=form.get("recording");
  if(action!=="record"||!(recording instanceof File)||recording.size<10*1024||recording.size>32*1024*1024||!/^audio\//.test(recording.type))return Response.json({error:"请录制 32 MB 内的有效音频"},{status:400});
  if(!await getSpokenVoiceAgentAvailability())return Response.json({error:"声音处理服务暂不可用，请稍后重试"},{status:503});
  try{
    const raw=Buffer.from(await recording.arrayBuffer());
    const mediaId=await storeDigitalHumanMedia({userId:user.id,kind:"voice_recording",bytes:raw,contentType:recording.type,fileName:"录音"});
    const client=await getPool().connect();
    try{
      await client.query("begin");
      const row=await client.query<{id:string}>(`insert into digital_human_voice_assets(user_id,provider,name,status,preview_audio_url,consent_confirmed_at,metadata_json)
        values($1,'heygen',$2,'creating',$3,now(),$4::jsonb) returning id`,[user.id,name,`/api/digital-human-media/${mediaId}`,{source:"browser_recording",recording_media_id:mediaId}]);
      await client.query(`insert into local_agent_tasks(task_type,owner_user_id,payload,dedupe_key,max_attempts) values('spoken.voice.clone',$1,$2,$3,3)`,[user.id,{voiceId:row.rows[0].id},row.rows[0].id]);
      await client.query("commit");
      return Response.json({voice:{id:row.rows[0].id,status:"creating"}},{status:201});
    }catch(error){await client.query("rollback");throw error;}finally{client.release();}
  }catch{return Response.json({error:"声音保存失败，请稍后重试"},{status:502});}
}

export async function PATCH(request:Request){
  const user=await requireSessionUser();if(user instanceof Response)return user;
  const body=await request.json().catch(()=>null);
  if(body?.action==="retry"){
    if(!z.string().uuid().safeParse(body.id).success)return Response.json({error:"声音参数无效"},{status:400});
    const client=await getPool().connect();
    try{
      await client.query("begin");
      const voice=(await client.query<{id:string;provider_voice_id:string|null;metadata_json:Record<string,unknown>}>("select id,provider_voice_id,metadata_json from digital_human_voice_assets where user_id=$1 and id=$2 and status='failed' for update",[user.id,body.id])).rows[0];
      if(!voice){await client.query("rollback");return Response.json({error:"声音不存在或无需重试"},{status:409});}
      if(voice.metadata_json.clone_submission_started&&!voice.provider_voice_id){await client.query("rollback");return Response.json({error:"提交结果待核对，请联系管理员，避免重复创建"},{status:409});}
      await client.query("update digital_human_voice_assets set status='creating',error_message=null,updated_at=now() where id=$1",[voice.id]);
      await client.query(`insert into local_agent_tasks(task_type,owner_user_id,payload,dedupe_key,max_attempts) values('spoken.voice.clone',$1,$2,$3,3)`,[user.id,{voiceId:voice.id},voice.id]);
      await client.query("commit");return Response.json({ok:true});
    }catch{await client.query("rollback");return Response.json({error:"重试失败，请稍后再试"},{status:503});}finally{client.release();}
  }
  const parsed=z.object({id:z.string().uuid(),name:z.string().trim().min(1).max(80)}).safeParse(body);
  if(!parsed.success)return Response.json({error:"声音名称无效"},{status:400});
  const row=await query<{id:string}>(`update digital_human_voice_assets set name=$3,updated_at=now() where user_id=$1 and id=$2 returning id`,[user.id,parsed.data.id,parsed.data.name]);
  return row.rows[0]?Response.json({ok:true}):Response.json({error:"声音不存在或仍在处理中"},{status:409});
}

export async function DELETE(request:Request){
  const user=await requireSessionUser();if(user instanceof Response)return user;
  const body=await request.json().catch(()=>null);const parsed=z.object({id:z.string().uuid()}).safeParse(body);
  if(!parsed.success)return Response.json({error:"声音参数无效"},{status:400});
  const deleted=await query<{id:string}>(`delete from digital_human_voice_assets where user_id=$1 and id=$2 and status<>'creating' returning id`,[user.id,parsed.data.id]);
  return deleted.rows[0]?Response.json({ok:true}):Response.json({error:"声音不存在或仍在处理中"},{status:409});
}
