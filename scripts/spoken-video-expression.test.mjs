import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { expressionSpec, expressionLayout, createExpressionMaterial } from "./spoken-video-expression.mjs";
import { videoSafeLayout } from "./spoken-video-layout.mjs";

const fixtures=[
  {kind:"compare",nodes:["甲产品支持离线。","乙产品需要联网。"],evidence:"甲产品支持离线。乙产品需要联网。"},
  {kind:"sequence",nodes:["先登记。","再等待审核。","最后领取结果。"],evidence:"先登记。再等待审核。最后领取结果。"},
  {kind:"timeline",nodes:["第一天复习。","第三天练习。","第五天测验。"],evidence:"第一天复习。第三天练习。第五天测验。"},
  {kind:"cause",nodes:["因为降雨，","所以道路湿滑。"],evidence:"因为降雨，所以道路湿滑。"},
  {kind:"parts",nodes:["早餐包含鸡蛋。","还有牛奶。"],evidence:"早餐包含鸡蛋。还有牛奶。"},
  {kind:"keypoints",nodes:["收益可能波动。","不保证回本。"],evidence:""},
];
for(const expression of fixtures)test(`cross-domain ${expression.kind} retains all source conditions`,()=>{
  const segment={text:expression.nodes.join(""),expression};
  assert.equal(expressionSpec(segment).kind,expression.kind);
  for(const aspectRatio of ["9:16","16:9"]){
    const layout=expressionLayout(segment,{aspectRatio,subtitleFontSize:aspectRatio==="9:16"?18:24});
    assert.equal(layout.cells.map(c=>c.text).join(""),segment.text);
    assert.ok(layout.cells.every(c=>c.y+c.height<videoSafeLayout(layout.width,layout.height,aspectRatio==="9:16"?18:24).subtitleTop));
  }
});
test("unsupported relation, omitted caveat, and invented numbers degrade to full quotation",()=>{
  const text="预期收益5%，但不保证本金。";
  for(const expression of [{kind:"compare",nodes:["预期收益5%","保证本金"],evidence:text},{kind:"cause",nodes:["预期收益5%，","但不保证本金。"],evidence:"因为"},{kind:"unknown",nodes:[text]}]){
    const result=expressionSpec({text,expression});assert.equal(result.kind,"keypoints");assert.equal(result.nodes.join(""),text);
  }
});
test("oversized text and indivisible tokens fall back to mother instead of truncation",()=>{
  for(const text of ["完整条件不可省略。".repeat(200),"A".repeat(400)])assert.equal(expressionLayout({text}).spec.kind,"presenter");
});
test("rendered cards are nonblank, correctly sized and leave subtitle zone untouched",async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),"expression-test-"));
  try{for(const aspectRatio of ["9:16","16:9"]){
    const expression=fixtures[0],segment={text:expression.nodes.join(""),expression};
    const material=await createExpressionMaterial(segment,dir,0,{aspectRatio});
    const metadata=await sharp(material.file).metadata();assert.equal(metadata.width,aspectRatio==="9:16"?1080:1920);
    const stats=await sharp(material.file).stats();assert.ok(stats.channels.some(c=>c.stdev>10));
    const crop=await sharp(material.file).extract({left:0,top:metadata.height-200,width:metadata.width,height:200}).toBuffer();
    const bottom=await sharp(crop).stats();assert.ok(bottom.channels.every(c=>c.stdev<1));
  }}finally{await rm(dir,{recursive:true,force:true});}
});
