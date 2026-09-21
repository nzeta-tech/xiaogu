// Tags: spoken:media-upload. Real HTTP, owned chunks, checksum, retry, cleanup, Range.
import assert from 'node:assert/strict';import{readFileSync}from'node:fs';import{mkdtemp,writeFile,rm}from'node:fs/promises';import{execFileSync}from'node:child_process';import{createHash}from'node:crypto';import os from'node:os';import path from'node:path';import{downloadPresenterMaster}from'./spoken-video-master-download.mjs';
const production=process.argv.includes('--production'),large=process.argv.includes('--large');const base=production?'https://xiaogu.nzeta.ai':'http://127.0.0.1:3119';if(!production){const u=new URL(process.env.DATABASE_URL);assert.equal(u.hostname,'127.0.0.1');assert.equal(u.pathname,'/paid_access_test');}
const code=readFileSync(new URL('./production-regression-fixture.cjs',import.meta.url));function fixture(action,id=''){const options={input:code,encoding:'utf8',timeout:60000};return JSON.parse(production?execFileSync('ssh',['-i','/Users/a2251/Downloads/router.pem','ubuntu@16.176.34.69',`docker exec -i -w /app insurance-content-agent-app-1 node - ${action} ${id}`],options):execFileSync(process.execPath,['-',action,id],{...options,env:{...process.env,XIAOGU_FIXTURE_PACKAGE:new URL('../package.json',import.meta.url).pathname}}));}
let checks=0;const check=(v,label)=>{assert(v,label);checks++;};const f=fixture('create'),dir=await mkdtemp(path.join(os.tmpdir(),'master-http-'));const started=Date.now();
try{
 const j=fixture('quality-create',f.id);fixture('media-renew',f.id);const headers={authorization:'Bearer '+f.agentToken};
 const bytes=Buffer.alloc(8*1024*1024,37);bytes.write('ftyp',4);
 const upload=await fetch(base+'/api/internal/local-agent/digital-human/media?'+new URLSearchParams({jobId:j.jobId,kind:'presenter_master'}),{method:'PUT',headers:{...headers,'content-type':'video/mp4'},body:bytes,signal:AbortSignal.timeout(180000)});check(upload.ok,'master fixture stored');fixture('media-lock',f.id);
 const url=base+'/api/internal/local-agent/digital-human/input?'+new URLSearchParams({jobId:j.jobId,kind:'master'});
 check((await fetch(url)).status===401,'anonymous master rejected');
 const input=await(await fetch(base+'/api/internal/local-agent/digital-human/input?'+new URLSearchParams({jobId:j.jobId,kind:'recut'}),{headers})).json();
 check(input.master?.size===bytes.length,'owned descriptor size');check(input.master.sha256===createHash('sha256').update(bytes).digest('hex'),'owned descriptor checksum');
 const range=await fetch(url,{headers:{...headers,range:'bytes=11-42'}});check(range.status===206,'internal Range forwarded');check(Buffer.from(await range.arrayBuffer()).equals(bytes.subarray(11,43)),'Range bytes exact');
 const bad=await fetch(url,{headers:{...headers,range:'bytes='+bytes.length+'-'}});check(bad.status===416,'invalid Range rejected');await bad.body?.cancel();
 let dropped=false;const starts=[];
 const fetchImpl=async(u,o)=>{starts.push(Number(o.headers.range.slice(6).split('-')[0]));const r=await fetch(u,o);if(dropped)return r;dropped=true;const reader=r.body.getReader();let first=true;return new Response(new ReadableStream({async pull(c){if(first){first=false;const v=await reader.read();c.enqueue(v.value);}else{await reader.cancel();c.error(Error('simulated connection drop'));}}}),{status:r.status,headers:r.headers});};
 const file=path.join(dir,'master.mp4'),options={url,headers,identity:input.master,cacheDir:dir,file,fetchImpl,sleep:async()=>{}};
 await downloadPresenterMaster(options);check(starts.some(x=>x>0&&x<4*1024*1024),'retry resumes after partial bytes');check(createHash('sha256').update(readFileSync(file)).digest('hex')===input.master.sha256,'whole file checksum verified');
 const count=starts.length;check((await downloadPresenterMaster(options)).cacheHit,'persistent cache hit');check(starts.length===count,'cache avoids network');
 console.log(JSON.stringify({passed:true,checks,bytes:bytes.length,elapsedMs:Date.now()-started,production,providerCalls:0}));
}finally{await rm(dir,{recursive:true,force:true});fixture('cleanup',f.id);}
