import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { retryVideoStage, VideoStageOutputError } from "./spoken-video-stage.mjs";
import { compactSrt, validateVideoSubtitles, planMaterials, renderWithCodexReview } from "./spoken-video-production.mjs";
import { researchSegmentsWithCodex } from "./spoken-video-web-research.mjs";

test("stage retries transient failures but not credentials or permanent errors",async()=>{
  for(const error of [new VideoStageOutputError("invalid output"),Object.assign(new Error("fetch failed"),{status:503})]){
    let calls=0;
    assert.equal(await retryVideoStage(()=>{if(++calls===1)throw error;return "ok";},{sleep:async()=>{}}),"ok");
    assert.equal(calls,2);
  }
  for(const error of [Object.assign(new Error("forbidden"),{status:403}),new Error("invalid input")]){
    let calls=0;
    await assert.rejects(retryVideoStage(()=>{calls++;throw error;},{sleep:async()=>{}}));
    assert.equal(calls,1);
  }
  let calls=0;
  await assert.rejects(retryVideoStage(()=>{calls++;throw new Error("timeout");},{sleep:async()=>{}}));
  assert.equal(calls,2);
});

test("long unsplittable words and numbers cannot exceed subtitle width",()=>{
  for(const text of ["ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijk","123456789012345678901234567890123456","这是Supercalifragilisticexpialidocious的说明。"]){
    for(const limit of [10,14]){
      const output=compactSrt(`1\n00:00:00,000 --> 00:00:06,000\n${text}\n`,limit);
      validateVideoSubtitles(output,limit);
      assert.equal(output.split(/\n\s*\n/).filter(Boolean).map(block=>block.split("\n").slice(2).join("")).join(""),text);
      assert.match(output,/00:00:00,000/);
      assert.match(output,/00:00:06,000/);
    }
  }
  assert.throws(()=>validateVideoSubtitles(""));
});

test("valid planning output survives CLI timeout without a second model call",async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),"video-plan-"));
  try{
    let calls=0;
    const result=await planMaterials(dir,"这是一段用于测试的完整口播文案。",null,async()=>{
      calls++;
      const input=JSON.parse(await readFile(path.join(dir,"research-input.json"),"utf8"));
      await writeFile(path.join(dir,"material-plan.json"),JSON.stringify({segments:input.segments.map(s=>({...s,visual:"测试说明",query:"office desk"}))}));
      throw Object.assign(new Error("timeout"),{killed:true,signal:"SIGTERM"});
    });
    assert.equal(calls,1);assert.ok(result.length);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test("research retries only failed stage and preserves valid output after timeout",async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),"video-research-"));
  try{
    let calls=0;
    const result=await researchSegmentsWithCodex([{id:"s1",text:"测试",visual:"测试"}],dir,async()=>{
      if(++calls===1)throw new Error("ECONNRESET");
      await writeFile(path.join(dir,"web-research-output.json"),JSON.stringify({webAccessed:true,segments:[{id:"s1",sources:[]}]}));
      throw new Error("timeout");
    });
    assert.equal(calls,2);assert.deepEqual(result,[[]]);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test("transient QA failure retries review without re-rendering",async()=>{
  let renders=0,reviews=0;
  const result=await renderWithCodexReview({segments:[],materials:[]},{
    finalize:async()=>{renders++;return {output:"test.mp4",durationSeconds:6};},check:async()=>{},sheet:async()=>"sheet.jpg",
    review:async()=>{if(++reviews===1)throw new Error("timeout");return {pass:true,issues:[]};},
  });
  assert.equal(renders,1);assert.equal(reviews,2);assert.equal(result.acceptedWithNotes,false);
});

test("failed quality cannot become successful delivery at retry limit or review-only",async()=>{
  for(const reviewOnly of [false,true]){
    let reviews=0;
    await assert.rejects(renderWithCodexReview({segments:[],materials:[],initialOptions:{reviewOnly}},{
      finalize:async()=>({output:"test.mp4",durationSeconds:6}),check:async()=>{},sheet:async()=>"sheet.jpg",
      review:async()=>({pass:false,issues:["字幕遮挡"],subtitleMaxChars:13-++reviews}),
    }),/成片质检未通过/);
    assert.equal(reviews,reviewOnly?1:3);
  }
});
