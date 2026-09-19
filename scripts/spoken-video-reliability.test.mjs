import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { retryVideoStage, VideoStageOutputError } from "./spoken-video-stage.mjs";
import { compactSrt, validateVideoSubtitles, planMaterials, renderWithCodexReview, knowledgeCardSpec, relevantAssetTitle, materialFor } from "./spoken-video-production.mjs";
import { researchSegmentsWithCodex } from "./spoken-video-web-research.mjs";

test("stock relevance requires meaningful whole-word matches, not generic people or substrings",()=>{
  assert.equal(relevantAssetTitle("File:Woman stopped by police.webm","woman quickly finding labeled document folder in home office"),false);
  assert.equal(relevantAssetTitle("Woman with a hat oil painting","woman searching household documents"),false);
  assert.equal(relevantAssetTitle("Profile of a protest","file folders"),false);
  assert.equal(relevantAssetTitle("Hands at a protest","close up hands sorting household documents into labeled file folders"),false);
  assert.equal(relevantAssetTitle("File:Sorting documents into file folders.webm","close up hands sorting household documents into labeled file folders"),true);
  assert.equal(relevantAssetTitle("Monthly budget spreadsheet","family budget"),true);
});

test("repeated rejected stock escalates to an original scene and still requires final QA",async()=>{
  for(const finalPass of [true,false]){
    let searches=0,generated=0,reviews=0;
    const work=renderWithCodexReview({segments:[{id:"s1",text:"整理资料",query:"document folders",visual:"资料分类",intent:"scene",layout:"fullscreen"}],materials:[{source:"https://example.com/old",title:"Old",kind:"video"}],
      resolveMaterial:async()=>{searches++;return {source:"https://example.com/replacement",title:"Replacement",kind:"video"};},
      generateVisual:async()=>{generated++;return {source:"xiaogu-generated-visual",title:"资料分类",kind:"image"};},
    },{
      finalize:async()=>({output:"test.mp4",durationSeconds:6}),check:async()=>{},sheet:async()=>"sheet.jpg",
      review:async()=>({pass:++reviews===3&&finalPass,issues:reviews===3&&finalPass?[]:["s1画面无关"],searchQueries:{s1:["organizing document folders"]}}),
    });
    if(finalPass){const result=await work;assert.deepEqual(result.reviewHistory.map(r=>r.pass),[false,false,true]);assert.equal(result.materials[0].source,"xiaogu-generated-visual");}
    else await assert.rejects(work,/成片质检未通过/);
    assert.equal(searches,1);assert.equal(generated,1);assert.equal(reviews,3);
  }
});

test("broader searches cannot weaken the original visual relevance requirement",async()=>{
  const query="labeled paper file folders",seen=[];
  const rejected=await materialFor({query},"unused",0,{providers:[async(search,dir,index,relevanceQuery)=>{
    seen.push(relevanceQuery);return search===query?null:{title:"File:Weather on Exoplanet labeled 1080.webm",source:"https://example.com/wrong"};
  }],card:async()=>({source:"xiaogu-knowledge-card"})});
  assert.equal(rejected.source,"xiaogu-knowledge-card");assert.equal(seen.length,3);assert(seen.every(value=>value===query));
  const accepted=await materialFor({query},"unused",0,{providers:[async()=>({title:"Paper file folders",source:"https://example.com/relevant"})]});
  assert.equal(accepted.source,"https://example.com/relevant");
});

test("diagram suggestions cannot invent template numbers or reporting periods",()=>{
  for(const points of [["M2发生变化。"],["居民贷款减少，需要结合原因分析。"]]){
    const result=JSON.stringify(knowledgeCardSpec(points,"家庭资金流",0,"双轨与储蓄池"));
    assert.doesNotMatch(result,/600亿|1.03万亿|前8个月/);
  }
  const spec=knowledgeCardSpec(["居民贷款去年减少了2亿元。","家庭主动还贷。"],"家庭资金流",0);
  assert.equal(spec.claim,"居民贷款去年减少了2亿元。");
});

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
