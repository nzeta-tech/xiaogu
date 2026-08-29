import assert from "node:assert/strict";
import test from "node:test";
import {
  buildProgressiveCoachTrainingArgs,
  decideCreativeCoachTrainingAction,
} from "./creative-coach-training-orchestrator.ts";

test("progressive training starts only after the source corpus succeeds", () => {
  assert.equal(decideCreativeCoachTrainingAction({ sourceStatus:"running",jobStatus:"waiting_source",leaseExpired:true }), "wait");
  assert.equal(decideCreativeCoachTrainingAction({ sourceStatus:"failed",jobStatus:"waiting_source",leaseExpired:true }), "fail");
  assert.equal(decideCreativeCoachTrainingAction({ sourceStatus:"succeeded",jobStatus:"waiting_source",leaseExpired:true }), "start");
  assert.equal(decideCreativeCoachTrainingAction({ sourceStatus:"succeeded",jobStatus:"training",leaseExpired:false }), "wait");
  assert.equal(decideCreativeCoachTrainingAction({ sourceStatus:"succeeded",jobStatus:"training",leaseExpired:true }), "start");
});

test("the durable job invokes the progressive trainer with activation", () => {
  assert.deepEqual(buildProgressiveCoachTrainingArgs({
    scriptPath:"/app/scripts/retrain-creative-coach-progressive-skills.mjs",
    coachName:"Mo姐教练",
    creatorName:"Mo姐",
    sourceSkillId:"source-skill-id",
  }), [
    "/app/scripts/retrain-creative-coach-progressive-skills.mjs",
    "--coach-name","Mo姐教练",
    "--creator-name","Mo姐",
    "--source-skill-ids","source-skill-id",
    "--activate",
  ]);
});
