import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,writeFile,readFile,rm} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {videoSafeLayout,safeSemanticLayout,expressionSafeTitleDuration,presenterOverlayFrame} from "./spoken-video-layout.mjs";
import {cachedVideoShot,mediaFingerprint} from "./spoken-video-render-cache.mjs";

test("subtitle and PIP safety uses the same ASS coordinate scale for both aspect ratios",()=>{
  for(const [w,h,sizes] of [[1080,1920,[10,12,14,18]],[1920,1080,[10,18,24]]]){
    for(const size of sizes){const layout=videoSafeLayout(w,h,size);assert(layout.pipFits);assert(layout.pip.y+layout.pip.size<layout.subtitleTop);assert(layout.subtitleTop<h-layout.marginV*h/288);}
  }
  assert.equal(videoSafeLayout(320,240,70).pipFits,false);
  assert.throws(()=>videoSafeLayout(0,1920));
});

test("presenter overlays use the left safe column and never occupy the right presenter zone",()=>{
  const frame=presenterOverlayFrame(1080,1920,"presenter-overlay");
  const pip=videoSafeLayout(1080,1920).pip;
  assert.equal(frame.side,"left");
  assert(frame.x+frame.width<pip.x,"support panel must not cover the right-side presenter");
  assert(frame.y+frame.height<videoSafeLayout(1080,1920).subtitleTop,"support panel must clear captions");
});

test("financial explanation and evidence do not obscure diagrams with a presenter",()=>{
  for(const intent of ["evidence","explain"])assert.equal(safeSemanticLayout({intent,layout:"presenter-pip"},{kind:"image"}),"fullscreen");
  assert.equal(safeSemanticLayout({intent:"explain"},{kind:"presenter"}),"presenter");
  assert.equal(safeSemanticLayout({intent:"scene",layout:"presenter-pip"},{kind:"image"}),"presenter-pip");
  assert.equal(safeSemanticLayout({intent:"explain",layout:"fullscreen",visualTreatment:"motion-card"},{kind:"image",source:"xiaogu-knowledge-card-expression",presentation:"expression-v2:cause:verbatim-partition:pip-safe"}),"fullscreen");
  assert.equal(safeSemanticLayout({intent:"explain",layout:"presenter-pip"},{kind:"image",source:"xiaogu-knowledge-card-expression",presentation:"expression-v2:sequence:verbatim-partition:fullscreen"}),"fullscreen");
  assert.equal(safeSemanticLayout({intent:"explain",visualTreatment:"data-widget"},{kind:"image"}),"fullscreen");
  assert.equal(safeSemanticLayout({intent:"evidence",visualTreatment:"evidence-snippet"},{kind:"image"}),"fullscreen");
  assert.equal(safeSemanticLayout({intent:"explain",visualTreatment:"keyword-motion"},{kind:"image"}),"presenter");
});

test("intro title ends before a grounded diagram enters including its transition",()=>{
  const material={source:"xiaogu-knowledge-card-expression"};
  assert.equal(expressionSafeTitleDuration([{start:0,showMaterial:true,material}],4.5,.4),0);
  assert.equal(expressionSafeTitleDuration([{start:3,showMaterial:true,material}],4.5,.4),2.8);
  assert.equal(expressionSafeTitleDuration([{start:3,showMaterial:false,material}],4.5,.4),4.5);
});

test("job-local render cache reuses unchanged shots and never reuses partial failures",async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),"shot-cache-"));
  try{
    let calls=0;const render=async file=>{calls++;await writeFile(file,"valid-clip");};
    const input=path.join(dir,"input.jpg");await writeFile(input,"first");const first=await mediaFingerprint(input);
    const key={master:"master1",material:first,start:0,length:10,layout:"fullscreen"};
    const a=await cachedVideoShot(dir,key,render);assert.equal(await cachedVideoShot(dir,key,render),a);assert.equal(calls,1);
    await writeFile(input,"other");const next=await mediaFingerprint(input);assert.notEqual(first,next);
    for(const changed of [{material:next},{master:"master2"},{start:1},{length:11},{layout:"presenter-pip"}])assert.notEqual(await cachedVideoShot(dir,{...key,...changed},render),a);
    assert.equal(calls,6);
    const failure={...key,start:99};await assert.rejects(cachedVideoShot(dir,failure,async file=>{await writeFile(file,"partial");throw Error("render failed");}));
    const b=await cachedVideoShot(dir,failure,render);assert.equal(await readFile(b,"utf8"),"valid-clip");assert.equal(calls,7);
  }finally{await rm(dir,{recursive:true,force:true});}
});
