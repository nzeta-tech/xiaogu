// Local-only HTTP regression fixtures. Real users, access policy and media are untouched.
import pg from 'pg';import{randomUUID}from'node:crypto';import{SignJWT}from'jose';import assert from'node:assert/strict';
const base=process.env.SPOKEN_TEST_BASE||'http://localhost:3000';
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname)||!['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname))throw Error('Local test database only');
const db=new pg.Client({connectionString:process.env.DATABASE_URL});await db.connect();
const uid=randomUUID(),root=randomUUID(),other=randomUUID();const fixtureIds=[uid,other];const paused=Number(process.env.SPOKEN_TEST_WORKER_PID);let resumed=false;
const sign=async(id)=>new SignJWT({id,email:`${id}@example.test`,name:'视频版本测试',role:'broker',sessionVersion:1}).setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime('10m').sign(new TextEncoder().encode(process.env.AUTH_SECRET||process.env.NEXTAUTH_SECRET||'dev-secret-change-before-production'));
try{
 if(paused)process.kill(paused,'SIGSTOP');
 await db.query("insert into users(id,name,email,password_hash,role,email_verified_at) values($1,'版本回归测试',$3,'test-only','broker',now()),($2,'隔离用户',$4,'test-only','broker',now())",[uid,other,`${uid}@example.test`,`${other}@example.test`]);
 await db.query("insert into exclusive_app_access_overrides(user_id,mode,reason) values($1,'granted','Local regression fixture'),($2,'granted','Local regression fixture')",[uid,other]);
 await db.query("insert into digital_human_video_jobs(id,user_id,provider,edition,title,script,aspect_ratio,status,video_url,request_json) values($1,$2,'heygen','pro','版本回归测试','固定口播原文，不允许修改。','9:16','completed','/fixture/v1','{\"workflow\":\"spoken_video_v1\"}')",[root,uid]);
 await db.query("insert into digital_human_media_assets(user_id,video_job_id,kind,storage_provider,content_type,original_filename,size_bytes,file_data,sha256) values($1,$2,'presenter_master','database','video/mp4','fixture.mp4',4,$3,'fixture-sha')",[uid,root,Buffer.from('test')]);
 const token=await sign(uid),foreign=await sign(other);
 const call=async(id,method,body,t=token)=>{const r=await fetch(`${base}/api/digital-human-videos/${id}/versions`,{method,headers:{cookie:`ica_session=${t}`,'content-type':'application/json'},body:JSON.stringify(body)});return{status:r.status,data:await r.json()}};
 assert.equal((await call(root,'POST',{instructions:'字幕更大一些',requestId:randomUUID(),voiceId:'forbidden'})).status,400);
 assert.equal((await call(root,'POST',{instructions:'字幕更大一些',requestId:randomUUID()},foreign)).status,404);
 const idempotency=randomUUID(),body={instructions:'字幕更大一些',requestId:idempotency};const a=await call(root,'POST',body);assert.equal(a.status,202,JSON.stringify(a.data));const v2=a.data.job.id;
 assert.equal((await call(root,'POST',body)).data.job.id,v2);
 assert.equal((await call(root,'POST',{...body,requestId:randomUUID()})).status,409);
 assert.equal((await call(root,'PATCH',{versionId:v2})).status,404);
 const payload=(await db.query("select payload from local_agent_tasks where owner_user_id=$1",[uid])).rows[0].payload;assert.deepEqual(Object.keys(payload).sort(),['jobId','mode']);assert.equal(payload.mode,'recut');
 // Simulate completion of this isolated fixture to test a second edit and selection.
 await db.query("update local_agent_tasks set status='succeeded' where owner_user_id=$1",[uid]);
 await db.query("update digital_human_video_jobs set status='completed',video_url='/fixture/v2' where id=$1",[v2]);
 assert.equal((await call(root,'PATCH',{versionId:v2})).status,200);
 assert.equal((await call(root,'PATCH',{versionId:v2},foreign)).status,404);
 const b=await call(v2,'POST',{instructions:'标题显示三秒',requestId:randomUUID(),productionMode:'smart'});assert.equal(b.status,202,JSON.stringify(b.data));assert.equal(b.data.job.request_json.revision_number,3);assert.equal(b.data.job.request_json.base_version_id,v2);assert.equal(b.data.job.request_json.production_mode,'smart');assert.equal(b.data.job.script,'固定口播原文，不允许修改。');assert.equal(b.data.job.quota_cost,0);
 await db.query("update local_agent_tasks set status='failed' where owner_user_id=$1 and status='pending'",[uid]);await db.query("update digital_human_video_jobs set status='failed' where id=$1",[b.data.job.id]);
 const original=(await db.query('select * from digital_human_video_jobs where id=$1',[root])).rows[0];assert.equal(original.status,'completed');assert.equal(original.video_url,'/fixture/v1');assert.equal(original.request_json.selected_version_id,v2);
 const usage=await db.query('select id from usage_logs where user_id=$1',[uid]);assert.equal(usage.rowCount,0);
 const list=await fetch(base+'/api/digital-human-videos',{headers:{cookie:`ica_session=${token}`}});const data=await list.json();assert.equal(data.jobs.filter(j=>j.id===root||j.request_json?.root_job_id===root).length,3);
 // A failed delivery can be recut only when its immutable master is still owned.
 await db.query("update digital_human_video_jobs set status='failed',video_url=null,request_json=request_json||'{\"material_plan\":null}'::jsonb where id=$1",[root]);
 const recoveryBody={instructions:'复用母片重新混剪，修复字幕遮挡',requestId:randomUUID()};
 const recovery=await call(root,'POST',recoveryBody);assert.equal(recovery.status,202,JSON.stringify(recovery.data));assert.equal(recovery.data.job.quota_cost,0);
 assert.equal((await call(root,'POST',recoveryBody)).data.job.id,recovery.data.job.id);
 const recoveredInput=await fetch(base+'/api/internal/local-agent/digital-human/input?'+new URLSearchParams({jobId:recovery.data.job.id,kind:'recut'}),{headers:{authorization:'Bearer '+process.env.LOCAL_AGENT_TOKEN}});
 assert.equal(recoveredInput.status,200);assert.deepEqual((await recoveredInput.json()).materialPlan,[]);
 const retained=(await db.query('select status,video_url from digital_human_video_jobs where id=$1',[root])).rows[0];assert.equal(retained.status,'failed');assert.equal(retained.video_url,null);
 const missing=randomUUID();await db.query("insert into digital_human_video_jobs(id,user_id,provider,edition,title,script,aspect_ratio,status,request_json) values($1,$2,'heygen','pro','无母片测试','原文保持不变。','9:16','failed','{\"workflow\":\"spoken_video_v1\"}')",[missing,uid]);
 assert.equal((await call(missing,'POST',{...recoveryBody,requestId:randomUUID()})).status,409);
 console.log('PASS: ownership, locked inputs, idempotency, concurrent edits, pending selection, V1→V2→V3, saved selection, failure isolation, immutable original, no double charge, grouped listing');
}finally{
 await db.query('delete from local_agent_tasks where owner_user_id=any($1::uuid[])',[fixtureIds]);await db.query('delete from digital_human_media_assets where user_id=any($1::uuid[])',[fixtureIds]);await db.query('delete from digital_human_video_jobs where user_id=any($1::uuid[])',[fixtureIds]);await db.query('delete from users where id=any($1::uuid[])',[fixtureIds]);await db.end();if(paused&&!resumed){process.kill(paused,'SIGCONT');resumed=true;}
}
