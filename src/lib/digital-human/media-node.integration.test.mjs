// Tags: media:fixed-node, media:ownership, media:streaming
// Real HTTP media node + Web handlers, with isolated in-memory metadata fixtures.
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createMediaServer } from '../../../scripts/media-node/server.mjs';
const owner=randomUUID(),stranger=randomUUID();
const state={user:owner,rows:new Map(),failWrites:false,settingsCalls:0};
globalThis.__mediaFixture=state;
const mocks={
 '@/lib/db/client':`const s=globalThis.__mediaFixture;export async function query(sql,v){if(sql.startsWith('insert into digital_human_media_assets')){if(s.failWrites)throw new Error('fixture database unavailable');const id=crypto.randomUUID();s.rows.set(id,{id,user_id:v[0],storage_provider:'local_disk',storage_key:v[4],storage_node_id:v[5],content_type:v[6],original_filename:v[7],size_bytes:v[8],file_data:null});return {rows:[{id}]}}if(sql.includes('where id=$1 and user_id=$2')){const row=s.rows.get(v[0]);return {rows:row&&row.user_id===v[1]?[row]:[]}}throw new Error('Unexpected fixture query')}`,
 '@/lib/db/repositories':`export async function tryGetSystemSettings(){globalThis.__mediaFixture.settingsCalls++;throw new Error('Fixed-node mode must not fall back to local settings')}`,
 '@/lib/security/secrets':`export function decryptSettingSecret(){throw new Error('Unexpected S3 fallback')}`,
 '@/lib/auth/session':`export async function requireSessionUser(){const user=globalThis.__mediaFixture.user;return user?{id:user}:Response.json({},{status:401})}`,
};
registerHooks({resolve(spec,context,next){if(mocks[spec])return {url:'data:text/javascript,'+encodeURIComponent(mocks[spec]),shortCircuit:true};if(spec.startsWith('@/'))return {url:pathToFileURL(path.join(process.cwd(),'src',spec.slice(2)+'.ts')).href,shortCircuit:true};return next(spec,context)}});
const {storeDigitalHumanMedia,storeDigitalHumanMediaStream}=await import('./media-assets.ts');
const {GET}=await import('../../app/api/digital-human-media/[id]/route.ts');
const root=await mkdtemp(path.join(os.tmpdir(),'media-integration-'));
const previous=Object.fromEntries(['MEDIA_NODE_URL','MEDIA_NODE_TOKEN','MEDIA_NODE_ID'].map(k=>[k,process.env[k]]));
process.env.MEDIA_NODE_TOKEN='integration-only-secret-at-least-32-chars';process.env.MEDIA_NODE_ID='test-fixed-node';
const server=createMediaServer({root,token:process.env.MEDIA_NODE_TOKEN,reserveBytes:0});
server.listen(0,'127.0.0.1');await once(server,'listening');process.env.MEDIA_NODE_URL=`http://127.0.0.1:${server.address().port}`;
test.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));await rm(root,{recursive:true,force:true});for(const [key,value]of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value}delete globalThis.__mediaFixture});
test.beforeEach(()=>{state.user=owner;state.failWrites=false});
function read(id,headers={},host='web-2.test'){return GET(new Request(`http://${host}/api/digital-human-media/${id}`,{headers}),{params:Promise.resolve({id})})}
test('photo saved by one Web request is readable through other Web hosts with ownership and range preserved',async()=>{
 const id=await storeDigitalHumanMedia({userId:owner,kind:'spoken_photo',bytes:Buffer.from('0123456789'),contentType:'image/jpeg',fileName:'照片.jpg'});
 for(const host of ['web-1.test','web-2.test','web-3.test']){const response=await read(id,{},host);assert.equal(response.status,200);assert.equal(await response.text(),'0123456789');assert.equal(response.headers.get('content-type'),'image/jpeg')}
 const suffix=await read(id,{range:'bytes=-3'});assert.equal(suffix.status,206);assert.equal(await suffix.text(),'789');
 assert.equal((await read(id,{range:'bytes=20-'})).status,416);
 state.user=stranger;assert.equal((await read(id)).status,404);state.user=null;assert.equal((await read(id)).status,401);
 assert.equal(state.settingsCalls,0);
});
test('Agent stream registers the verified media only after successful upload',async()=>{
 const before=state.rows.size;const bytes=Buffer.from('complete-video');
 const saved=await storeDigitalHumanMediaStream({userId:owner,videoJobId:randomUUID(),kind:'output',body:new ReadableStream({start(c){c.enqueue(bytes);c.close()}}),contentLength:bytes.length,contentType:'video/mp4',fileName:'视频.mp4'});
 assert.equal(state.rows.size,before+1);assert.equal(saved.size,bytes.length);assert.equal(await(await read(saved.id)).text(),'complete-video');
 await assert.rejects(storeDigitalHumanMediaStream({userId:owner,videoJobId:randomUUID(),kind:'output',body:new ReadableStream({start(c){c.close()}}),contentLength:501*1024*1024,contentType:'video/mp4',fileName:'large.mp4'}),e=>e.status===413);
 assert.equal(state.rows.size,before+1);
});
test('media-node failure never falls back to another Web disk or creates metadata',async()=>{
 const url=process.env.MEDIA_NODE_URL;process.env.MEDIA_NODE_URL='http://127.0.0.1:1';const before=state.rows.size;
 try{await assert.rejects(storeDigitalHumanMedia({userId:owner,kind:'spoken_photo',bytes:Buffer.from('x'),contentType:'image/jpeg',fileName:'x.jpg'}),e=>e.status===503);assert.equal(state.rows.size,before);assert.equal(state.settingsCalls,0)}finally{process.env.MEDIA_NODE_URL=url}
});
test('old node identity is rejected explicitly rather than returning an unrelated local file',async()=>{
 const id=randomUUID();state.rows.set(id,{id,user_id:owner,storage_provider:'local_disk',storage_key:`${owner}/2026-09/${randomUUID()}.mp4`,storage_node_id:'other-node'});assert.equal((await read(id)).status,503);
});
