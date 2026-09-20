import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { retryVideoStage, VideoStageOutputError } from "./spoken-video-stage.mjs";
import { compactSrt, validateVideoSubtitles, planMaterials, planRecut, renderWithCodexReview, knowledgeCardSpec, relevantAssetTitle, materialFor } from "./spoken-video-production.mjs";

test("advisory-only review delivers once without regenerating artwork",async()=>{
  let renders=0;
  const result=await renderWithCodexReview({segments:[],materials:[],resolveMaterial:async()=>{throw Error("advisories must not regenerate materials");}},{
    finalize:async()=>{renders++;return {output:"fixture.mp4"};},check:async()=>{},sheet:async()=>"fixture.jpg",
    review:async()=>({pass:true,issues:[],warnings:["模板变化可以更丰富"],cardFixes:{s1:{style:"unused"}}}),
  });
  assert.equal(renders,1);assert.equal(result.acceptedWithNotes,false);
  assert.deepEqual(result.reviewHistory,[{attempt:1,pass:true,issues:[],warnings:["模板变化可以更丰富"]}]);
});
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
    else {const result=await work;assert.equal(result.acceptedWithNotes,true);assert.deepEqual(result.reviewHistory.map(r=>r.pass),[false,false,false]);}
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

test("a generated repair is reused without discarded extra image calls",async()=>{
  let resolved=0,reviews=0;
  const result=await renderWithCodexReview({segments:[{id:"s1",text:"整理资料",query:"document folders",visual:"资料分类"}],materials:[{source:"xiaogu-generated-visual",title:"资料分类",file:"old.jpg"}],
    resolveMaterial:async()=>{resolved++;return {source:"xiaogu-generated-visual",title:"资料分类",file:"new.jpg"};},
    generateVisual:async()=>{throw Error("unnecessary paid generation");},
  },{
    finalize:async()=>({output:"test.mp4",durationSeconds:6}),check:async()=>{},sheet:async()=>"sheet.jpg",
    review:async()=>({pass:++reviews===2,issues:[],searchQueries:{s1:["document folder","organized paperwork","file cabinet"]}}),
  });
  assert.equal(resolved,1);assert.equal(reviews,2);assert.equal(result.materials[0].file,"new.jpg");
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

test("valid recut plan survives a nonzero Codex exit without a second model call",async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),"video-recut-plan-"));
  try{
    let calls=0;
    const input={aspectRatio:"9:16",options:{subtitleFontSize:12},materialPlan:[{id:"s1",text:"家里有没有足够现金？",visual:"现金储备",query:"family cash reserve",material:{points:["家里有没有足够现金"]}}]};
    const result=await planRecut(dir,input,async()=>{
      calls++;
      const saved=JSON.parse(await readFile(path.join(dir,"recut-input.json"),"utf8"));
      await writeFile(path.join(dir,"recut-plan.json"),JSON.stringify({segments:saved.segments.map(segment=>({...segment,regenerate:true,forceCard:true,cardPoints:["家里有没有足够现金"]})),options:{subtitleFontSize:14}}));
      throw new Error("Command failed after writing recut-plan.json");
    });
    assert.equal(calls,1);
    assert.equal(result.segments[0].regenerate,true);
    assert.equal(result.options.subtitleFontSize,14);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test("recut planning retries when Codex exits before producing a plan",async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),"video-recut-retry-"));
  try{
    let calls=0;
    const input={aspectRatio:"9:16",options:{},materialPlan:[{id:"s1",text:"先看现金流。",visual:"现金流",query:"cash flow",material:{points:["先看现金流"]}}]};
    const result=await planRecut(dir,input,async()=>{
      calls++;
      if(calls===1)throw new Error("Command failed before output");
      const saved=JSON.parse(await readFile(path.join(dir,"recut-input.json"),"utf8"));
      await writeFile(path.join(dir,"recut-plan.json"),JSON.stringify({segments:saved.segments.map(segment=>({...segment,regenerate:false,forceCard:true,cardPoints:["先看现金流"]})),options:{}}));
    });
    assert.equal(calls,2);
    assert.equal(result.segments[0].forceCard,true);
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

test("layout-only quality repairs reuse visuals and remain fullscreen in later rounds",async()=>{
  let rounds=0;const layouts=[];
  const material={kind:"image",file:"original.jpg",source:"fixture"};
  const result=await renderWithCodexReview({segments:[{id:"s1",text:"画面",intent:"scene",layout:"presenter-pip"}],materials:[material],initialOptions:{timelineMode:"semantic"},resolveMaterial:async()=>{throw Error("must not regenerate a layout-only repair");}},{
    finalize:async(_master,segments)=>{layouts.push(segments[0].layout);return {output:"test.mp4",durationSeconds:6};},check:async()=>{},sheet:async()=>"sheet.jpg",
    review:async()=>{rounds++;return rounds===1?{pass:false,issues:["s1 人像PIP与字幕相叠"],layoutFixes:{s1:"fullscreen"}}:rounds===2?{pass:false,issues:["头像出镜不足"],subtitleMaxChars:12}:{pass:true,issues:[]};},
  });
  assert.deepEqual(layouts,["presenter-pip","fullscreen","fullscreen"]);assert.equal(result.materials[0],material);assert.equal(rounds,3);
});

test("long financial timelines repair only the rejected beat and preserve locked narration",async()=>{
  const segments=Array.from({length:18},(_,index)=>({id:`s${index+1}`,text:`第${index+1}段：贷款利率与现金流需要结合条件判断。`,intent:index%3?"explain":"anchor",layout:index%3?"presenter-pip":"presenter"}));
  const materials=segments.map(s=>({kind:s.intent==="anchor"?"presenter":"image",source:"fixture",file:s.id+".jpg"}));
  const calls=[];let rounds=0;
  const result=await renderWithCodexReview({segments,materials,initialOptions:{timelineMode:"semantic"},resolveMaterial:async(segment,index)=>{calls.push(index);assert.equal(segment.text,segments[index].text);assert.equal(segment.layout,"fullscreen");return {...materials[index],file:"repair.jpg"};}},{
    finalize:async(_master,current)=>{assert.deepEqual(current.map(s=>s.text),segments.map(s=>s.text));assert(current.filter(s=>s.intent==="explain").every(s=>s.layout==="fullscreen"));return {output:"test.mp4",durationSeconds:240};},check:async()=>{},sheet:async()=>"sheet.jpg",
    review:async()=>++rounds===1?{pass:false,issues:["s5现金流机制不清楚"],cardFixes:{s5:{style:"按原文条件展示资金流向，不增加数字"}}}:{pass:true,issues:[]},
  });
  assert.deepEqual(calls,[4]);assert.equal(result.segments.length,18);
  for(let i=0;i<18;i++)if(i!==4)assert.equal(result.materials[i],materials[i]);
});

test("third review publishes with truthful findings, including review-only",async()=>{
  for(const reviewOnly of [false,true]){
    let reviews=0,renders=0;
    const result=await renderWithCodexReview({segments:[],materials:[],initialOptions:{reviewOnly}},{
      finalize:async()=>{renders++;return {output:"test.mp4",durationSeconds:6};},check:async()=>{},sheet:async()=>"sheet.jpg",
      review:async()=>{reviews++;return {pass:false,issues:["字幕遮挡"]};},
    });
    assert.equal(reviews,3);assert.equal(renders,1);assert.equal(result.acceptedWithNotes,true);
    assert.deepEqual(result.reviewHistory.at(-1).issues,["字幕遮挡"]);
  }
});

test("technical failures never publish a corrupt or absent output",async()=>{
  let reviews=0;
  await assert.rejects(renderWithCodexReview({segments:[],materials:[]},{
    finalize:async()=>({output:"bad.mp4"}),check:async()=>{throw Error("decode failed");},
    review:async()=>{reviews++;return {pass:true,issues:[]};},
  }),/decode failed/);assert.equal(reviews,0);
});

test('unavailable final reviewer releases after three rounds with an explicit user notice',async()=>{
  let renders=0;
  const result=await renderWithCodexReview({segments:[],materials:[]},{
    finalize:async()=>{renders++;return {output:'playable.mp4'};},check:async()=>{},sheet:async()=> 'sheet.jpg',
    review:async()=>{throw Error('review service unavailable');},
  });
  assert.equal(renders,1);assert.equal(result.reviewHistory.length,3);assert.equal(result.acceptedWithNotes,true);assert.match(result.reviewHistory.at(-1).issues[0],/未能完成/);
});
