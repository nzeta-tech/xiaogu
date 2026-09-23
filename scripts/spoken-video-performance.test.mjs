import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {preflightShots,changedReviewScope} from './spoken-video-preflight.mjs';
import {cachedVideoShot} from './spoken-video-render-cache.mjs';
import {cachedMaterial} from './spoken-video-artifact-cache.mjs';
import {performanceScope,measureVideoStage,videoMetrics} from './spoken-video-performance.mjs';
import {encodeVideo} from './spoken-video-encoder.mjs';

test('preflight enforces continuity using snapped timings and catches coverage errors',()=>{
  const shots=[{start:0,length:7,showMaterial:true,layout:'fullscreen'},{start:7,length:7,showMaterial:true,layout:'fullscreen'},{start:14,length:2,showMaterial:false,layout:'presenter'}];
  const result=preflightShots(shots,16);assert.equal(result.shots[1].layout,'presenter-pip');assert.equal(shots[1].layout,'fullscreen');assert.equal(result.changes.length,1);
  assert.throws(()=>preflightShots([{start:1,length:3}],4),/空隙/);
  assert.throws(()=>preflightShots([{start:0,length:3}],4),/覆盖/);
});
test('review scope includes changed shot neighbors and invalidates globally',()=>{
  const before={global:'a',shots:['a','b','c','d']};
  assert.deepEqual(changedReviewScope(before,{global:'a',shots:['a','x','c','d']}),[0,1,2]);
  assert.equal(changedReviewScope(before,{...before,global:'b'}),null);
  assert.deepEqual(changedReviewScope(before,before),[]);
});
test('persistent clips are reused across workspaces but corrupted bytes force regeneration',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'clip-cache-'));let renders=0;
  try{const produce=file=>{renders++;return writeFile(file,'video-'+renders);};
    const first=await cachedVideoShot(dir,{master:'a',subtitle:'a'},produce);
    assert.equal(await cachedVideoShot(dir,{master:'a',subtitle:'a'},produce),first);assert.equal(renders,1);
    await writeFile(first,'bad');await cachedVideoShot(dir,{master:'a',subtitle:'a'},produce);assert.equal(renders,2);
    await cachedVideoShot(dir,{master:'a',subtitle:'b'},produce);assert.equal(renders,3);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('material cache survives producer workspace removal and invalidates changed content',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'material-cache-'));let calls=0;
  try{const src=path.join(root,'source.jpg'),dir=path.join(root,'cache');await writeFile(src,'image');
    const produce=async()=>{calls++;return {kind:'image',file:src};};
    const a=await cachedMaterial(dir,{text:'same'},produce);await rm(src);
    const b=await cachedMaterial(dir,{text:'same'},produce);assert.equal(calls,1);assert.equal(a.file,b.file);assert.equal(await readFile(b.file,'utf8'),'image');
    await writeFile(src,'changed');await cachedMaterial(dir,{text:'new'},produce);assert.equal(calls,2);
  }finally{await rm(root,{recursive:true,force:true});}
});
test('performance scopes isolate concurrent jobs and retain failure timings',async()=>{
  const results=await Promise.all(['one','two'].map(stage=>performanceScope(null,async()=>{await measureVideoStage(stage,async()=>{});await assert.rejects(measureVideoStage('error',async()=>{throw Error('test');}));return videoMetrics();})));
  assert.deepEqual(results.map(r=>r.stages[0].stage),['one','two']);assert(results.every(r=>r.stages[1].ok===false));
});
test('hardware encode failure retries software with original args',async()=>{
  const old=process.env.LOCAL_AGENT_VIDEO_ENCODER;process.env.LOCAL_AGENT_VIDEO_ENCODER='h264_nvenc';const calls=[];
  try{const args=['-y','-i','fixture','-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p','out.mp4'];
    await encodeVideo(async(_bin,args)=>{calls.push(args);if(args.includes('out.mp4')&&args.includes('h264_nvenc'))throw Error('busy');},args);
    assert.equal(calls.length,3);assert.deepEqual(calls.at(-1),args);assert(calls[1].includes('8M'));assert(!calls[1].includes('-crf'));
  }finally{if(old===undefined)delete process.env.LOCAL_AGENT_VIDEO_ENCODER;else process.env.LOCAL_AGENT_VIDEO_ENCODER=old;}
});

test('deterministic SVG preflight retains long text without canvas clipping',async()=>{
  const {fitCardSvg}=await import('./spoken-video-svg-preflight.mjs');
  const svg='<svg width="1080" height="1920"><text x="900" y="2200" font-size="60">完整文字不会删掉</text></svg>';
  const fitted=fitCardSvg(svg,1080,1920);assert.match(fitted,/scale\(0\./);assert.match(fitted,/完整文字不会删掉/);assert.match(fitted,/overflow="visible"/);
});
