// Executed inside the production app container. Output is captured privately by
// the runner, never printed in release reports. Only disposable users are written.
const{createRequire}=require('node:module');const req=createRequire(process.env.XIAOGU_FIXTURE_PACKAGE||'/app/server.js');const{Pool}=req('pg');const{randomUUID,createHash}=require('node:crypto');
(async()=>{const pool=new Pool({connectionString:process.env.DATABASE_URL});try{
 const action=process.argv[2],id=process.argv[3];
 if(action==='create'){
  const uid=randomUUID(),email='spoken-release-'+uid+'@example.invalid';
  await pool.query("insert into users(id,name,email,password_hash,role,email_verified_at) values($1,'发布回归',$2,$3,'admin',now())",[uid,email,randomUUID()]);
  await pool.query("insert into gift_records(user_id,source_type,quota_amount) values($1,'admin',1000)",[uid]);
  const now=Math.floor(Date.now()/1000),encode=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
  const unsigned=encode({alg:'HS256'})+'.'+encode({id:uid,email,name:'发布回归',role:'admin',sessionVersion:1,iat:now,exp:now+7200});
  const cookie='ica_session='+unsigned+'.'+require('node:crypto').createHmac('sha256',process.env.AUTH_SECRET).update(unsigned).digest('base64url');
  const source=(await pool.query("select payload->>'url' as url from local_agent_tasks where task_type='source.inspect' and status='succeeded' and length(result->'fields'->>'source_transcript')>0 and payload->>'url' like '%douyin.com%' order by completed_at desc limit 1")).rows[0]?.url;
  console.log(JSON.stringify({id:uid,cookie,source,agentToken:process.env.LOCAL_AGENT_TOKEN}));
 }else{
  if(!/^[0-9a-f-]{36}$/.test(id||''))throw Error('invalid fixture id');
  const allowed=await pool.query("select id from users where id=$1 and email=$2",[id,'spoken-release-'+id+'@example.invalid']);if(!allowed.rowCount)throw Error('fixture owner mismatch');
  if(action==='cleanup'){
   await pool.query('delete from local_agent_tasks where owner_user_id=$1',[id]);await pool.query('delete from spoken_photo_assets where user_id=$1',[id]);await pool.query('delete from digital_human_media_assets where user_id=$1',[id]);await pool.query('delete from users where id=$1',[id]);console.log(JSON.stringify({cleaned:true}));
  }else if(action==='grant'){
   await pool.query("insert into exclusive_app_access_overrides(user_id,mode,reason) values($1,'granted','Production release regression') on conflict(user_id) do update set mode='granted'",[id]);console.log(JSON.stringify({granted:true}));
  }else if(action==='quality-create'){
   const jobId=randomUUID(),taskId=randomUUID(),leaseToken=randomUUID(),agentId='release-quality-'+id;
   await pool.query("insert into digital_human_video_jobs(id,user_id,provider,edition,title,script,aspect_ratio,status,quota_cost,request_json) values($1,$2,'heygen','pro','质检验收','合成验收文案','9:16','processing',50,'{\"workflow\":\"spoken_video_v1\"}')",[jobId,id]);
   await pool.query("insert into local_agent_tasks(id,task_type,owner_user_id,payload,status,agent_id,lease_token_hash,lease_expires_at,attempt_count) values($1,'digital-human.video.produce',$2,$3,'leased',$4,$5,now()+interval '5 minutes',1)",[taskId,id,{jobId},agentId,createHash('sha256').update(leaseToken).digest('hex')]);
   console.log(JSON.stringify({jobId,taskId,leaseToken,agentId}));
  }else if(action==='quality-evidence'){
   const rows=await pool.query("select job.id,job.status,job.error_message,job.video_url is not null as has_video,job.request_json->'quality_review' as reviews,job.request_json->'delivery_notes' as delivery_notes,job.request_json->'quality_passed' as quality_passed,task.status as task_status,(select count(*)::int from usage_logs where metadata->>'digitalHumanVideoJobId'=job.id::text) as charges from digital_human_video_jobs job join local_agent_tasks task on task.payload->>'jobId'=job.id::text where job.user_id=$1",[id]);
   console.log(JSON.stringify({jobs:rows.rows}));
  }else if(action==='task-evidence'){
   const tasks=await pool.query("select id,status,task_type,result,attempt_count from local_agent_tasks where owner_user_id=$1 order by created_at desc",[id]);console.log(JSON.stringify({tasks:tasks.rows}));
  }else throw Error('unsupported fixture action');
 }
}finally{await pool.end()}})().catch(e=>{console.error(e.code||e.message);process.exitCode=1});
