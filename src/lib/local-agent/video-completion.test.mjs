import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spokenVideoCompletion } from "./video-completion.ts";
import { VideoQualityError } from "../../../scripts/spoken-video-production.mjs";

const passed = {status:"completed",videoUrl:"https://example.com/video.mp4",qualityReview:[{attempt:1,pass:true,issues:[]}]};
test("advisories persist without bypassing blocking issues or explicit failures",()=>{
  const review={attempt:1,pass:true,issues:[],warnings:["s2：模板可以更多样"]};
  const result=spokenVideoCompletion({...passed,qualityReview:[review]});
  assert.equal(result.completed,true);assert.deepEqual(result.reviews[0].warnings,review.warnings);
  assert.equal(spokenVideoCompletion({...passed,qualityReview:[{...review,issues:["字幕遮挡"]}]}).completed,false);
  assert.equal(spokenVideoCompletion({...passed,qualityReview:[{...review,pass:false}]}).completed,false);
});
test("only an explicit final quality pass permits completed status",()=>{
  assert.equal(spokenVideoCompletion(passed).completed,true);
  for(const patch of [
    {qualityReview:undefined}, {qualityReview:[]}, {qualityReview:[{attempt:1,pass:"true",issues:[]}]},
    {qualityReview:[{attempt:1,pass:true,issues:[]},{attempt:2,pass:false,issues:["脸部变形"]}]},
    {qualityReview:[{attempt:3,pass:true,issues:[]}]},
    {videoUrl:" "}, {status:"failed"}, {acceptedWithNotes:true}, {deliveryNotes:["字幕遮挡"]},
  ]) assert.equal(spokenVideoCompletion({...passed,...patch}).completed,false,JSON.stringify(patch));
});
test("third failed review and legacy soft-success retain visible reasons",()=>{
  const qualityReview=[1,2,3].map(attempt=>({attempt,pass:false,issues:["字幕遮挡","脸部变形"]}));
  const result=spokenVideoCompletion({...passed,qualityReview,deliveryNotes:["字幕遮挡"]});
  assert.equal(result.completed,true);
  assert.equal(result.error,null);
  assert.deepEqual(result.deliveryNotes,["字幕遮挡","脸部变形"]);
  assert.equal(result.qualityPassed,false);
  assert.deepEqual(result.reviews,qualityReview);
  const failure=new VideoQualityError("成片质检未通过：脸部变形",qualityReview).result("job");
  assert.equal(failure.status,"failed");
  assert.equal(spokenVideoCompletion(failure).completed,false);
  assert.deepEqual(spokenVideoCompletion(failure).reviews,qualityReview);
});
test("successful repair is eligible but prior failed rounds remain available",()=>{
  const result=spokenVideoCompletion({...passed,qualityReview:[{attempt:1,pass:false,issues:["字幕遮挡"]},{attempt:2,pass:true,issues:[]}]});
  assert.equal(result.completed,true);assert.equal(result.error,null);assert.equal(result.reviews.length,2);
});
test("existing transaction, charging condition and UI are wired to the guarded status",async()=>{
  const repo=await readFile(new URL("./repository.ts",import.meta.url),"utf8");
  const billing=await readFile(new URL("../../../migrations/084_paid_application_access.sql",import.meta.url),"utf8");
  const ui=await readFile(new URL("../../components/pages/SpokenVideoVersions.tsx",import.meta.url),"utf8");
  assert.match(repo,/const \{completed,error,reviews,deliveryNotes,qualityPassed\}=spokenVideoCompletion\(resultPayload\)/);
  assert.match(repo,/quality_review:reviews/);
  assert.match(repo,/if\(!completed\)await client.query\("update local_agent_tasks set status='failed'/);
  assert.match(repo,/if \(completed\) await selectCompletedSpokenVideoAsCurrent\(client, jobId\)/);
  assert.match(repo,/delivered\.status='completed'/);
  assert.match(repo,/delivered\.video_url is not null/);
  assert.match(billing,/if new.status='completed' and new.quota_cost/);
  assert.ok(ui.includes("成片质检未通过|Codex 质检未通过"));
  assert.ok(ui.includes("?chosen.error_message:"));
});
