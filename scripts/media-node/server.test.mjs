import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { randomUUID, createHash } from 'node:crypto';
import { createMediaServer, parseRange } from './server.mjs';
const token='isolated-test-token-32-characters-long';
const key=()=>`test-user/2026-09/${randomUUID()}.mp4`;
async function fixture(options={}){
 const root=await mkdtemp(path.join(os.tmpdir(),'xiaogu-media-test-'));let server;
 const start=async()=>{server=createMediaServer({root,token,reserveBytes:0,...options});server.listen(0,'127.0.0.1');await once(server,'listening');return `http://127.0.0.1:${server.address().port}`};
 let base=await start();
 return {root,request:(k,init={})=>fetch(`${base}/objects/${k}`,{...init,headers:{authorization:`Bearer ${token}`,...init.headers}}),base:()=>base,restart:async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));base=await start()},close:async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));await rm(root,{recursive:true,force:true})}};
}
test('upload above 50 MB streams, validates checksum, and survives restart',async()=>{
 const f=await fixture();try{const k=key(),chunk=Buffer.alloc(1024*1024,7);const hash=createHash('sha256');let i=0;
 const stream=new ReadableStream({pull(c){if(i++===51){c.close();return;}hash.update(chunk);c.enqueue(chunk)}});
 const uploaded=await f.request(k,{method:'PUT',body:stream,duplex:'half',headers:{'content-length':String(51*chunk.length)}});assert.equal(uploaded.status,201);const saved=await uploaded.json();assert.equal(saved.size,51*chunk.length);assert.equal(saved.sha256,hash.digest('hex'));
 await f.restart();const range=await f.request(k,{headers:{range:'bytes=-4'}});assert.equal(range.status,206);assert.equal(range.headers.get('content-range'),`bytes ${saved.size-4}-${saved.size-1}/${saved.size}`);assert.deepEqual(Buffer.from(await range.arrayBuffer()),Buffer.alloc(4,7));
 const duplicate=await f.request(k,{method:'PUT',body:'replace'});assert.equal(duplicate.status,409);
 const invalid=await f.request(k,{headers:{range:`bytes=${saved.size}-`}});assert.equal(invalid.status,416);
 }finally{await f.close()}
});
test('auth and key boundaries reject reads/writes outside the object namespace',async()=>{
 const f=await fixture();try{assert.equal((await fetch(f.base()+'/objects/'+key())).status,401);assert.equal((await f.request('%2e%2e/secret')).status,400);assert.equal((await f.request(key())).status,404);assert.equal((await fetch(f.base()+'/health',{headers:{authorization:`Bearer ${token}`}})).status,200);}finally{await f.close()}
});
test('declared and streaming size limits reject oversized files without committing partial data',async()=>{
 const f=await fixture({maxBytes:8});try{assert.equal((await f.request(key(),{method:'PUT',body:'123456789'})).status,413);
 const stream=new ReadableStream({start(c){c.enqueue(Buffer.from('123456789'));c.close()}});
 assert.equal((await f.request(key(),{method:'PUT',body:stream,duplex:'half'})).status,413);
 assert.deepEqual(await readdir(f.root),[]);
 }finally{await f.close()}
});
test('disk reserve fails closed before any file is written',async()=>{
 const f=await fixture({reserveBytes:Number.MAX_SAFE_INTEGER});try{assert.equal((await f.request(key(),{method:'PUT',body:'x'})).status,507);assert.deepEqual(await readdir(f.root),[]);}finally{await f.close()}
});
test('ranges handle suffix, open ended and malformed requests',()=>{assert.deepEqual(parseRange('bytes=-3',10),{start:7,end:9});assert.deepEqual(parseRange('bytes=2-',10),{start:2,end:9});for(const r of ['bytes=-0','bytes=11-','bytes=8-2','bytes=0-1,3-4','bad'])assert.equal(parseRange(r,10),false)});
