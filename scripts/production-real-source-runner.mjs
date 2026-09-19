#!/usr/bin/env node
import {readFile} from 'node:fs/promises';import{spawnSync}from'node:child_process';import assert from'node:assert/strict';import path from'node:path';
const[repo,sha,base]=process.argv.slice(2);if(!repo||!base)throw Error('release runner arguments required');
const fixtureCode=await readFile(path.join(repo,'scripts/production-regression-fixture.cjs'));
function fixture(action,id=''){
 const r=spawnSync('ssh',['-o','BatchMode=yes','-i',process.env.XIAOGU_SSH_KEY||'/Users/a2251/Downloads/router.pem',process.env.XIAOGU_PRIMARY_SSH||'ubuntu@16.176.34.69',`docker exec -i -w /app insurance-content-agent-app-1 node - ${action} ${id}`],{input:fixtureCode,encoding:'utf8',timeout:60000});
 if(r.status!==0)throw Error(`Fixture ${action} failed`);return JSON.parse(r.stdout);
}
const f=fixture('create');const headers={cookie:f.cookie,'content-type':'application/json'};let count=0;
try{
 assert(f.source,'supported real source unavailable');
 const source=new URL(f.source);source.searchParams.set('xiaogu_release_probe',sha+'-'+Date.now());
 const r=await fetch(base+'/api/creation/link-remix/inspect',{method:'POST',headers,body:JSON.stringify({url:String(source)}),signal:AbortSignal.timeout(60000)});const body=await r.json();assert.equal(r.status,202);assert(body.taskId);
 let result;
 for(let i=0;i<180;i++){
  const rr=await fetch(base+'/api/creation/link-remix/inspect/'+body.taskId,{headers,signal:AbortSignal.timeout(30000)});assert(rr.ok);const d=await rr.json();if(d.status==='succeeded'){result=d.result;break;}assert(!['failed','cancelled'].includes(d.status),'real-source task failed');await new Promise(r=>setTimeout(r,5000));
 }
 assert(result,'real-source task timed out');const transcript=result.fields?.source_transcript||'';assert(transcript.length>0);assert(!result.mediaUrl&&!result.mediaDecryptKey);
 const events=await fetch(base+'/api/creation/link-remix/inspect/'+body.taskId+'/events?after=0',{headers,signal:AbortSignal.timeout(60000)});assert(events.ok);const raw=await events.text();let chars=0,done=false;
 for(const event of raw.split('\n\n')){const name=event.match(/^event: (.+)$/m)?.[1],data=event.match(/^data: (.+)$/m)?.[1];if(name==='done')done=true;if(data){const d=JSON.parse(data);if(d.type==='delta'&&typeof d.content==='string'){count++;chars+=d.content.length;}}}
 assert(done&&count>0);assert.equal(chars,transcript.length);
 console.log(JSON.stringify({passed:true,taskId:body.taskId,release:sha,sseDeltas:count,transcriptCharacters:transcript.length,sensitiveFieldsPresent:false}));
}finally{fixture('cleanup',f.id);}
