import { test } from "node:test";
import assert from "node:assert/strict";
import { reviewFrameTimes, codexReview, reviewScopeRules, parseReview } from "./spoken-video-quality.mjs";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

test("review stays within the locked source scope without overriding an explicit failure",async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),"video-review-scope-"));
  try{
    const result=await codexReview({dir,contactSheet:"fixture.jpg",title:"文件整理",script:"给文件起一个清楚的名字。",segments:[],materials:[],attempt:1,presenterShare:.4},async(command,args)=>{
      assert(args.at(-1).startsWith(reviewScopeRules));
      assert.match(args.at(-1),/Never require extra examples/);
      assert.match(args.at(-1),/Still reject unrelated or misleading visuals/);
      assert.match(args.at(-1),/layout-only defect must use layoutFixes/);
      assert.doesNotMatch(args.at(-1),/fail repeated generic cards/);
      assert.match(args.at(-1),/advisory-only results must pass/);
      await writeFile(path.join(dir,"qa-review-1.json"),JSON.stringify({pass:false,issues:["无关素材和字幕遮挡"],layoutFixes:{s1:"fullscreen",s2:"invalid"}}));
    });
    assert.equal(result.pass,false);assert.deepEqual(result.issues,["无关素材和字幕遮挡"]);
    assert.deepEqual(result.layoutFixes,{s1:"fullscreen"});
  }finally{await rm(dir,{recursive:true,force:true});}
});

const finding=(category)=>({category,segmentId:"s2-b2",evidence:"labelled frame",message:category});
test("aesthetic-only findings pass and retain separate warnings",()=>{
  const result=parseReview(JSON.stringify({pass:true,issues:[],findings:["template_repetition","layout_variety","illustration_depth","visual_hierarchy","presenter_share"].map(finding)}));
  assert.equal(result.pass,true);assert.equal(result.warnings.length,5);assert.deepEqual(result.issues,[]);
});
test("every hard category blocks even when model incorrectly says pass",()=>{
  for(const category of ["content_error","misleading_visual","unrelated_visual","unreadable_text","critical_overlap","blank_frame","face_distortion"]){
    const result=parseReview(JSON.stringify({pass:true,issues:[],findings:[finding("template_repetition"),finding(category)]}));
    assert.equal(result.pass,false);assert.equal(result.issues.length,1);
  }
});
test("unknown or evidence-free findings cannot silently pass",()=>{
  for(const f of [finding("unknown"),{...finding("critical_overlap"),evidence:""}])assert.throws(()=>parseReview(JSON.stringify({pass:true,issues:[],findings:[f]})));
});
test("explicit and legacy failures cannot become advisory successes",()=>{
  assert.equal(parseReview(JSON.stringify({pass:false,issues:[],findings:[finding("template_repetition")]})).pass,false);
  assert.equal(parseReview(JSON.stringify({pass:true,issues:["字幕遮挡"]})).pass,false);
});

test("quality contact sheet samples every material section and the presenter", () => {
  const times=reviewFrameTimes([{text:"甲".repeat(40)},{text:"乙".repeat(40)},{text:"丙".repeat(40)}],60,.6);
  assert.equal(times.length,6);
  assert.ok(times.every(time=>time>0&&time<60));
  assert.ok(times.some(time=>time>10&&time<20));
  assert.ok(times.some(time=>time>30&&time<40));
  assert.ok(times.some(time=>time>50&&time<60));
  assert.ok(times.some(time=>time>4&&time<8));
  assert.ok(times.some(time=>time>24&&time<28));
  assert.ok(times.some(time=>time>44&&time<48));
});

test("semantic timeline quality sampling follows ordered beat midpoints", () => {
  const times=reviewFrameTimes([
    {text:"开场观点",intent:"anchor",layout:"presenter"},
    {text:"数据证据",intent:"evidence",layout:"presenter-pip"},
    {text:"生活场景",intent:"scene",layout:"fullscreen"},
  ],30,.6);
  assert.equal(times.length,3);
  assert.ok(times[0]<times[1]&&times[1]<times[2]);
  assert.ok(times.every(time=>time>0&&time<30));
});
