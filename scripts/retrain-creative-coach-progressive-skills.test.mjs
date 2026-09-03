import assert from "node:assert/strict";
import test from "node:test";
import { reconcileEvidenceBackedSkills } from "./retrain-creative-coach-progressive-skills.mjs";

test("restores real evidence, drops unsupported skills, and supplements missing levels",()=>{
  const partials=[
    {id:"strategy-a",name:"策略A",level:"strategy",supportCount:3,sourceWorkFingerprints:["a","b","c"]},
    {id:"atomic-a",name:"动作A",level:"atomic",supportCount:2,sourceWorkFingerprints:["d","e"]},
    {id:"general-a",name:"原则A",level:"general",supportCount:2,sourceWorkFingerprints:["f","g"]},
    {id:"functional-a",name:"功能A",level:"functional",supportCount:2,sourceWorkFingerprints:["h","i"]},
  ];
  const merged=[
    {id:"strategy-a",name:"策略A",level:"strategy",supportCount:1,sourceWorkFingerprints:[]},
    {id:"unsupported",name:"无证据项",level:"atomic",supportCount:1,sourceWorkFingerprints:["x"]},
  ];
  const result=reconcileEvidenceBackedSkills(merged,partials);
  assert.deepEqual(result.find((skill)=>skill.id==="strategy-a")?.sourceWorkFingerprints,["a","b","c"]);
  assert.equal(result.some((skill)=>skill.id==="unsupported"),false);
  assert.deepEqual(new Set(result.map((skill)=>skill.level)),new Set(["general","strategy","functional","atomic"]));
  assert.equal(result.every((skill)=>skill.supportCount>=2&&skill.sourceWorkFingerprints.length>=2),true);
});
