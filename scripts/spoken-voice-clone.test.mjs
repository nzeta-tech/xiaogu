import test from 'node:test';
import assert from 'node:assert/strict';
import { executeSpokenVoiceClone } from './spoken-voice-clone.mjs';
test('resume queries durable provider id without submitting another clone',async()=>{
  const calls=[];const result=await executeSpokenVoiceClone({id:'task'},'lease',{remote:async()=>({voice:{providerVoiceId:'saved-id'}})},{cli:async args=>{calls.push(args);return {status:'complete'};}});
  assert.equal(result.providerVoiceId,'saved-id');assert.deepEqual(calls,[['voice','get','saved-id']]);
});
test('ambiguous clone submission is never repeated automatically',async()=>{
  let calls=0;await assert.rejects(executeSpokenVoiceClone({id:'task'},'lease',{remote:async()=>({voice:{submissionStarted:true}})},{cli:async()=>{calls++;}}),/待核对/);assert.equal(calls,0);
});
test('provider failure remains failed rather than returning a ready voice',async()=>{
  await assert.rejects(executeSpokenVoiceClone({id:'task'},'lease',{remote:async()=>({voice:{providerVoiceId:'saved-id'}})},{cli:async()=>({status:'failed'})}),/克隆失败/);
});
