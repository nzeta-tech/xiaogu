import { test } from "node:test";
import assert from "node:assert/strict";
import { buildEvidencePacks, fallbackDirectorPlan, officialSource } from "./spoken-video-director.mjs";

test("director evidence packs bind official sources to the exact locked segment",()=>{
  const segments=[{id:"s1-b1",text:"根据监管文件，等待期为90天。",intent:"evidence",visual:"等待期"}];
  const references=[[{title:"产品条款",url:"https://www.nfra.gov.cn/policy/terms.pdf",excerpt:"本合同等待期为90天。",kind:"document",rights:"reference-only"}]];
  const packs=buildEvidencePacks(segments,references);
  assert.equal(packs[0].claim,segments[0].text);
  assert.equal(packs[0].sources[0].official,true);
  assert.equal(packs[0].primarySourceId,"s1-b1-e1");
  assert.equal(packs[0].status,"supported");
});

test("smart director chooses original evidence for factual beats and keeps generated scenes illustrative",()=>{
  const segments=[
    {id:"s1-b1",text:"官方数据显示增长10%。",intent:"evidence",layout:"presenter-pip",visual:"增长数据",query:"growth data"},
    {id:"s1-b2",text:"一家人开始重新讨论家庭预算。",intent:"scene",layout:"fullscreen",visual:"家庭讨论",query:"family budget discussion"},
  ];
  const packs=buildEvidencePacks(segments,[[{title:"统计公报",url:"https://stats.gov.cn/report",excerpt:"同比增长10%。",kind:"webpage"}],[]]);
  const plan=fallbackDirectorPlan(segments,packs);
  assert.equal(plan[0].visualTreatment,"official-source");
  assert.equal(plan[0].layout,"presenter-evidence");
  assert.deepEqual(plan[0].evidenceIds,["s1-b1-e1"]);
  assert.equal(plan[1].visualTreatment,"generated-scene");
  assert.equal(plan[1].layout,"presenter-overlay");
  assert.match(plan[1].generativePrompt,/no text, no logo/);
});

test("official source detection does not treat an arbitrary commercial page as an authority",()=>{
  assert.equal(officialSource("https://www.gov.hk/en/residents/"),true);
  assert.equal(officialSource("https://example.com/article"),false);
});

test("smart fallback uses composite presenter layouts only when the content stays readable",()=>{
  const segments=[
    {id:"short",text:"利率下降10%。",intent:"explain",visual:"利率变化"},
    {id:"long",text:"这是一段需要完整解释多个条件、相互关系和决策顺序的复杂机制，不能缩成一个小挂件。",intent:"explain",visual:"复杂机制"},
  ];
  const plan=fallbackDirectorPlan(segments,buildEvidencePacks(segments,[[],[]]));
  assert.equal(plan[0].layout,"presenter-data");
  assert.equal(plan[1].layout,"fullscreen");
});
