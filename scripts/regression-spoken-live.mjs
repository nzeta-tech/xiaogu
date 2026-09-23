// Tags: spoken:end-to-end. Dedicated candidate database and authorized local
// recording only. Creates isolated rows, checks a real worker, then cleans up.
import {Pool} from 'pg';import {SignJWT} from 'jose';import {randomUUID} from 'node:crypto';import {readFile,writeFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const base=process.env.PAID_ACCESS_TEST_BASE_URL;assert.equal(new URL(base).hostname,'127.0.0.1');assert.equal(new URL(process.env.DATABASE_URL).pathname,'/paid_access_test');
const pool=new Pool({connectionString:process.env.DATABASE_URL});const id=randomUUID();let assertions=0;const check=(v,message)=>{assert.ok(v,message);assertions++};
const cookie='ica_session='+await new SignJWT({id,email:id+'@example.test',name:'发布验收',role:'broker',sessionVersion:1}).setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime('2h').sign(new TextEncoder().encode(process.env.AUTH_SECRET));
async function api(url,options={}){const r=await fetch(base+url,{...options,headers:{cookie,...options.headers},signal:AbortSignal.timeout(300000)});const d=await r.json();check(r.ok,`API ${url}: ${r.status} ${d.error||''}`);return d;}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
try{
 await pool.query("insert into users(id,name,email,password_hash,role,email_verified_at) values($1,'发布验收',$2,'test-only','broker',now())",[id,id+'@example.test']);
 await pool.query("insert into exclusive_app_access_overrides(user_id,mode,reason) values($1,'granted','Candidate release acceptance')",[id]);
 await pool.query("insert into gift_records(user_id,source_type,quota_amount) values($1,'admin',1000)",[id]);
 const list=await api('/api/spoken-photos');check(list.templates.length===171,'171 templates');
 const photoForm=new FormData();photoForm.set('action','import');photoForm.set('consent','true');photoForm.set('name','发布验收照片');photoForm.set('templateId',list.templates.find(t=>t.category==='金融保险')?.id||list.templates[0].id);
 const {photo}=await api('/api/spoken-photos',{method:'POST',body:photoForm});
 const voiceForm=new FormData();voiceForm.set('action','record');voiceForm.set('consent','true');voiceForm.set('name','发布验收声音');voiceForm.set('recording',new File([await readFile(process.env.SPOKEN_TEST_RECORDING_FILE)],'recording.webm',{type:'audio/webm'}));
 const {voice}=await api('/api/spoken-voices',{method:'POST',body:voiceForm});
 let ready=false;
 for(let i=0;i<90;i++){const row=(await api('/api/spoken-voices')).voices.find(v=>v.id===voice.id);if(row?.status==='ready'){ready=true;break;}check(row?.status!=='failed','voice clone failed');await wait(10000);}
 check(ready,'real voice clone completes');console.log(JSON.stringify({stage:'voice-ready',assertions}));
 const {job}=await api('/api/digital-human-videos',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({workflow:'spoken_video_v1',productionMode:'basic',personSource:'photo',photoId:photo.media_id,voiceAssetId:voice.id,title:'家庭资料整理',script:'整理家庭资料，可以先把保单和重要文件分类保存。需要查找时，就能更快找到对应的信息。',aspectRatio:'9:16'})});
 let completed;
 for(let i=0;i<180;i++){const row=(await pool.query('select status,progress,request_json,video_url from digital_human_video_jobs where id=$1',[job.id])).rows[0];if(i%6===0)console.log(JSON.stringify({stage:row.request_json.stage,status:row.status,progress:row.progress}));if(row.status==='completed'){completed=row;break;}if(row.status==='failed')throw new Error('Real video task failed; inspect privacy-safe worker diagnostics');await wait(10000);}
 check(completed,'real video completes');const r=await fetch(base+`/api/digital-human-videos/${job.id}/media`,{headers:{cookie,range:'bytes=0-31'}});check(r.status===206,'video Range playback');const bytes=Buffer.from(await r.arrayBuffer());check(bytes.includes(Buffer.from('ftyp')),'MP4 signature');
 const usage=(await pool.query('select count(*)::int as n,sum(quota_cost)::int as cost from usage_logs where user_id=$1',[id])).rows[0];check(usage.n===1&&usage.cost===50,'exactly one 50-credit debit');
 await pool.query("update digital_human_video_jobs set status='completed' where id=$1",[job.id]);check((await pool.query('select count(*)::int as n from usage_logs where user_id=$1',[id])).rows[0].n===1,'completion replay not charged');
 const out={passed:true,assertions,voiceClone:true,videoGenerated:true,playback:true,charged:50};console.log(JSON.stringify(out));await writeFile('/tmp/xiaogu-spoken-live-result.json',JSON.stringify(out));
}finally{
 await pool.query('delete from local_agent_tasks where owner_user_id=$1',[id]);await pool.query('delete from spoken_photo_assets where user_id=$1',[id]);await pool.query('delete from digital_human_media_assets where user_id=$1',[id]);await pool.query('delete from users where id=$1',[id]);await pool.end();
}
