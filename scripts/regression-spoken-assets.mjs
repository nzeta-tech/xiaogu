// Tags: spoken:assets, spoken:voice-lease, media:ownership. Candidate only; no provider requests.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {SignJWT} from 'jose';
const base=process.env.SPOKEN_TEST_BASE_URL||'http://127.0.0.1:3118';
assert.equal(new URL(base).hostname,'127.0.0.1');assert.equal(new URL(process.env.DATABASE_URL).pathname,'/paid_access_test');
const pool=new Pool({connectionString:process.env.DATABASE_URL});const id=randomUUID(),agent='voice-fixture-'+randomUUID();
const cookie='ica_session='+await new SignJWT({id,role:'broker',email:id+'@example.invalid',name:'Fixture',sessionVersion:1}).setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode(process.env.AUTH_SECRET));
const api=(url,options={})=>fetch(base+url,{...options,headers:{cookie,...options.headers},signal:AbortSignal.timeout(90000)});
const remote=(url,body)=>api(url,{method:'POST',headers:{authorization:'Bearer '+process.env.LOCAL_AGENT_TOKEN,'content-type':'application/json'},body:JSON.stringify(body)});
const prior=(await pool.query("select setting_value from system_settings where setting_key='features'")).rows[0]?.setting_value||{};
let assertions=0;const equal=(a,b)=>{assert.equal(a,b);assertions++};
try{
 await pool.query("insert into users(id,name,email,password_hash,role,email_verified_at) values($1,'Fixture',$2,'test','broker',now())",[id,id+'@example.invalid']);
 await pool.query("update system_settings set setting_value=setting_value||'{\"localAgentEnabled\":true}'::jsonb where setting_key='features'");
 const heartbeat=()=>remote('/api/internal/local-agent/heartbeat',{agentId:agent,status:'ready',version:'fixture',protocolVersion:1,capabilities:{'spoken.voice.clone':true},health:{codexCli:'healthy',heygenCli:'healthy',ffmpeg:'healthy'},activeTaskCount:0});
 equal((await heartbeat()).status,200);
 const list=await (await api('/api/spoken-photos')).json();equal(list.templates.length,171);
 const form=new FormData();form.set('action','import');form.set('consent','true');form.set('name','Fixture');form.set('templateId',list.templates[0].id);
 const imported=await api('/api/spoken-photos',{method:'POST',body:form});equal(imported.status,201);const photo=(await imported.json()).photo;
 const bytes=await api(photo.url,{headers:{range:'bytes=0-7'}});equal(bytes.status,206);equal((await bytes.arrayBuffer()).byteLength,8);
 equal((await fetch(base+photo.url)).status,401);
 const record=async()=>{await heartbeat();const f=new FormData();f.set('action','record');f.set('name','Fixture');f.set('consent','true');f.set('recording',new File([Buffer.alloc(12000,1)],'fixture.webm',{type:'audio/webm'}));const r=await api('/api/spoken-voices',{method:'POST',body:f});equal(r.status,201);return (await r.json()).voice.id};
 const voice=await record();const leased=await (await remote('/api/internal/local-agent/tasks/lease',{agentId:agent,capabilities:['spoken.voice.clone'],leaseSeconds:300,protocolVersion:1})).json();equal(leased.task.payload.voiceId,voice);
 const auth={taskId:leased.task.id,agentId:agent,leaseToken:leased.leaseToken};
 equal((await remote('/api/internal/local-agent/spoken-voice',{...auth,leaseToken:'wrong',action:'state'})).status,409);
 equal((await remote('/api/internal/local-agent/spoken-voice',{...auth,action:'state'})).status,200);
 equal((await remote('/api/internal/local-agent/spoken-voice',{...auth,action:'reserve'})).status,200);
 equal((await remote('/api/internal/local-agent/spoken-voice',{...auth,action:'reserve'})).status,409);
 equal((await remote('/api/internal/local-agent/spoken-voice',{...auth,action:'checkpoint',providerVoiceId:'fixture-voice'})).status,200);
 const complete=()=>remote(`/api/internal/local-agent/tasks/${leased.task.id}/complete`,{...auth,result:{status:'completed',providerVoiceId:'fixture-voice'}});
 equal((await complete()).status,200);equal((await complete()).status,409);
 equal((await (await api('/api/spoken-voices')).json()).voices.find(v=>v.id===voice).status,'ready');
 const failedVoice=await record();const failure=await (await remote('/api/internal/local-agent/tasks/lease',{agentId:agent,capabilities:['spoken.voice.clone'],leaseSeconds:300,protocolVersion:1})).json();
 equal((await remote(`/api/internal/local-agent/tasks/${failure.task.id}/fail`,{agentId:agent,leaseToken:failure.leaseToken,error:'Controlled candidate failure',retryable:false})).status,200);
 equal((await (await api('/api/spoken-voices')).json()).voices.find(v=>v.id===failedVoice).status,'failed');
 console.log(JSON.stringify({passed:true,assertions,providerRequests:0}));
}finally{
 await pool.query('delete from local_agent_tasks where owner_user_id=$1',[id]);await pool.query('delete from users where id=$1',[id]);await pool.query('delete from local_agent_nodes where agent_id=$1',[agent]);await pool.query("update system_settings set setting_value=$1 where setting_key='features'",[prior]);await pool.end();
}
