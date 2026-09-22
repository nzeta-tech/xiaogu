import { test } from "node:test";
import assert from "node:assert/strict";
import { buildEvidencePacks, enforceDirectorPlan, fallbackDirectorPlan, focusedEvidenceExcerpt, groundedOfficialSources, officialSource } from "./spoken-video-director.mjs";

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
  assert.deepEqual(plan[0].evidenceIds,["s1-b1-e1"]);
  assert.equal(plan[1].visualTreatment,"generated-scene");
  assert.match(plan[1].generativePrompt,/no text, no logo/);
});

test("official source detection does not treat an arbitrary commercial page as an authority",()=>{
  assert.equal(officialSource("https://www.gov.hk/en/residents/"),true);
  assert.equal(officialSource("https://example.com/article"),false);
});

test("official evidence must contain the exact numeric claim",()=>{
  const segment={id:"s1",text:"报告显示增长21.3%。",intent:"evidence"};
  const exact=buildEvidencePacks([segment],[[{title:"报告",url:"https://stats.gov.cn/report",excerpt:"本期同比增长21.3%。"}]])[0];
  const mismatch=buildEvidencePacks([segment],[[{title:"报告",url:"https://stats.gov.cn/report",excerpt:"本期同比增长12.3%。"}]])[0];
  assert.equal(groundedOfficialSources(exact).length,1);
  assert.equal(groundedOfficialSources(mismatch).length,0);
  assert.equal(fallbackDirectorPlan([segment],[mismatch])[0].visualTreatment,"motion-card");
});

test("one official source may ground one fact without repeating every number in the beat",()=>{
  const segment={id:"s1",text:"租金回报率2.2%，空置率21.3%。",intent:"evidence"};
  const pack=buildEvidencePacks([segment],[[{title:"报告",url:"https://stats.gov.cn/report",excerpt:"50城住宅平均租金回报率约2.2%。"}]])[0];
  assert.equal(groundedOfficialSources(pack).length,1);
  assert.equal(focusedEvidenceExcerpt(segment.text,"背景说明。50城住宅平均租金回报率约2.2%。其他内容。"),"50城住宅平均租金回报率约2.2%。");
});

test("dense cards are fullscreen and a presenter beat breaks three repeated cards",()=>{
  const plan=enforceDirectorPlan([0,1,2].map(index=>({id:`s${index}`,visualTreatment:"motion-card",layout:"presenter-pip",narrativeRole:"explain"})),[0,1,2].map(index=>({claim:`观点${index}`,sources:[]})));
  assert.equal(plan[0].layout,"fullscreen");
  assert.equal(plan[0].intent,"explain");
  assert.equal(plan[1].visualTreatment,"presenter");
  assert.equal(plan[1].layout,"presenter");
  assert.equal(plan[2].layout,"fullscreen");
});
