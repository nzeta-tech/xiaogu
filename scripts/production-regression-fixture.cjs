// Executed inside the production app container. Output is captured privately by
// the runner, never printed in release reports. Only disposable users are written.
const{createRequire}=require('node:module');const req=createRequire('/app/server.js');const{Pool}=req('pg');const{randomUUID}=require('node:crypto');
(async()=>{const pool=new Pool({connectionString:process.env.DATABASE_URL});try{
 const action=process.argv[2],id=process.argv[3];
 if(action==='create'){
  const uid=randomUUID(),email='spoken-release-'+uid+'@example.invalid';
  await pool.query("insert into users(id,name,email,password_hash,role,email_verified_at) values($1,'发布回归',$2,$3,'admin',now())",[uid,email,randomUUID()]);
  await pool.query("insert into gift_records(user_id,source_type,quota_amount) values($1,'admin',1000)",[uid]);
  const{SignJWT}=await import(req.resolve('jose'));
  const cookie='ica_session='+await new SignJWT({id:uid,email,name:'发布回归',role:'admin',sessionVersion:1}).setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime('2h').sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  const source=(await pool.query("select payload->>'url' as url from local_agent_tasks where task_type='source.inspect' and status='succeeded' and length(result->'fields'->>'source_transcript')>0 and payload->>'url' like '%douyin.com%' order by completed_at desc limit 1")).rows[0]?.url;
  console.log(JSON.stringify({id:uid,cookie,source,agentToken:process.env.LOCAL_AGENT_TOKEN}));
 }else{
  if(!/^[0-9a-f-]{36}$/.test(id||''))throw Error('invalid fixture id');
  const allowed=await pool.query("select id from users where id=$1 and email=$2",[id,'spoken-release-'+id+'@example.invalid']);if(!allowed.rowCount)throw Error('fixture owner mismatch');
  if(action==='cleanup'){
   await pool.query('delete from local_agent_tasks where owner_user_id=$1',[id]);await pool.query('delete from spoken_photo_assets where user_id=$1',[id]);await pool.query('delete from digital_human_media_assets where user_id=$1',[id]);await pool.query('delete from users where id=$1',[id]);console.log(JSON.stringify({cleaned:true}));
  }else if(action==='grant'){
   await pool.query("insert into exclusive_app_access_overrides(user_id,mode,reason) values($1,'granted','Production release regression') on conflict(user_id) do update set mode='granted'",[id]);console.log(JSON.stringify({granted:true}));
  }else if(action==='task-evidence'){
   const tasks=await pool.query("select id,status,task_type,result,attempt_count from local_agent_tasks where owner_user_id=$1 order by created_at desc",[id]);console.log(JSON.stringify({tasks:tasks.rows}));
  }else throw Error('unsupported fixture action');
 }
}finally{await pool.end()}})().catch(e=>{console.error(e.code||e.message);process.exitCode=1});
