import { test } from "node:test";
import assert from "node:assert/strict";
import { compactSrt, knowledgeCardSpec, materialSearchQueries, reusableLicense, shouldUseExplainerCard, snapCutsToCaptions } from "./spoken-video-production.mjs";

test("long Chinese subtitle cues are split into timed, screen-safe lines", () => {
  const result = compactSrt("1\n00:00:00,000 --> 00:00:04,000\n为什么现在很多家庭手里一有余钱，第一反应不是投资，而是先还贷？\n");
  const cues = result.trim().split(/\n\n/);
  assert.equal(cues.length, 3);
  assert.ok(cues.every(cue => Array.from(cue.split("\n")[2]).length <= 14));
  assert.match(cues[0], /00:00:00,000 -->/);
  assert.match(cues.at(-1), /--> 00:00:04,000/);
  assert.equal(cues.map(cue => cue.split("\n")[2]).join(""), "为什么现在很多家庭手里一有余钱，第一反应不是投资，而是先还贷？");
});

test("subtitle breaks preserve decimal numbers and avoid orphan sentence endings", () => {
  const source = "1\n00:00:00,000 --> 00:00:02,000\n居民贷款前8个月减少了1.\n\n2\n00:00:02,000 --> 00:00:04,000\n03万亿。这个判断只对了一半。\n";
  const cues = compactSrt(source).trim().split(/\n\n/).map(cue => cue.split("\n")[2]);
  assert.match(cues.join(""), /1\.03万亿/);
  assert.ok(cues.some(cue => cue.includes("1.03万亿")));
  assert.ok(cues.every(cue => Array.from(cue).length <= 14));
  assert.ok(cues.every(cue => Array.from(cue.replace(/[，。！？；：,.!?;:]/g, "")).length !== 1));
});

test("visual cuts land after complete spoken thoughts without changing total duration", () => {
  const shots=[{start:0,length:8.7},{start:8.7,length:13.2},{start:21.9,length:8.1}];
  const srt="1\n00:00:05,000 --> 00:00:08,300\n要不要先还掉？\n\n2\n00:00:08,300 --> 00:00:09,500\n你看8月的\n\n3\n00:00:19,900 --> 00:00:21,600\n减少了1.03万亿，\n\n4\n00:00:21,600 --> 00:00:22,400\n这个判断只对了一半。\n";
  const result=snapCutsToCaptions(shots,srt,30);
  assert.equal(result[1].start,8.3);
  assert.equal(result[2].start,22.4);
  assert.equal(result.at(-1).start+result.at(-1).length,30);
});

test("stock licenses allow credited commercial edits but reject restricted variants", () => {
  assert.deepEqual(reusableLicense("CC BY 4.0"),{license:"CC BY 4.0",licenseUrl:"https://creativecommons.org/licenses/by/4.0/",requiresCredit:true});
  assert.equal(reusableLicense("CC0 1.0")?.requiresCredit,false);
  for(const license of ["CC BY-NC 4.0","CC BY-ND 4.0","CC BY-SA 4.0","unknown"])assert.equal(reusableLicense(license),null);
});

test("material search relaxes an over-specific scene query", () => {
  assert.deepEqual(materialSearchQueries("family mortgage repayment calculator savings"),["family mortgage repayment calculator savings","mortgage repayment","mortgage"]);
});

test("smart financial scenes become original explanatory cards with legible data layouts",()=>{
  assert.equal(shouldUseExplainerCard({text:"新增贷款600亿，但居民贷款减少1.03万亿元"}),true);
  assert.equal(shouldUseExplainerCard({text:"两个人走进餐厅"}),false);
  const spec=knowledgeCardSpec(["新增贷款只有600亿。","居民贷款减少1.03万亿元。"],"信贷数据怎么读",0);
  assert.equal(spec.kind,"metrics");
  assert.deepEqual(spec.metrics.map(item=>item.value),["600亿","1.03万亿元"]);
  assert.equal(knowledgeCardSpec(["投资回报和资产价格都有波动，但月供和利息不会等你。","收入一波动，它就是现金流压力。"],"确定月供与现金流压力",3).kind,"cashflow");
  assert.equal(knowledgeCardSpec(["“买了就能涨”的确定性已经没那么强了。","房子有居住价值、地段价值。"],"房产价值与上涨预期",2).kind,"contrast");
  assert.equal(knowledgeCardSpec(["从“赌未来上涨”变成“降低确定性压力”。"],"从赌上涨到降压力",5).kind,"shift");
});

test("retired voice jobs fail before any worker side effect", async () => {
  const { executeSpokenVideoProduction } = await import("./spoken-video-production.mjs");
  for (const voiceProvider of ["chanjing", "unknown", undefined]) {
    await assert.rejects(executeSpokenVideoProduction({payload:{voiceProvider,jobId:"legacy",script:"test"}},"lease",{}), /已下线/);
  }
});

test("knowledge cards reject invented points and preserve original qualification", async () => {
  const {knowledgePoints}=await import('./spoken-video-production.mjs');
  const text='居民去杠杆不等于全民躺平，更不等于所有人都应该提前还贷。投资回报和资产价格都有波动，但月供和利息不会等你。';
  const points=knowledgePoints({text,cardPoints:['所有人都应该提前还贷，收益保证10%。','没有风险。']});
  assert.ok(points.every(point=>text.includes(point)));
  assert.ok(points.some(point=>point.includes('更不等于所有人都应该提前还贷')));
});

test("knowledge cards keep exact source decimals and selected substantive points", async () => {
  const {knowledgePoints}=await import('./spoken-video-production.mjs');
  const cardPoints=['新增贷款只有600亿，但M2还在增长。','居民贷款前8个月却减少了1.03万亿。'];
  assert.deepEqual(knowledgePoints({text:cardPoints.join(''),cardPoints}),cardPoints);
});

test('recut plan refuses any narration rewrite or segment reorder', async()=>{
 const {validateRecutPlan}=await import('./spoken-video-production.mjs');
 const segments=[{id:'s1',text:'月供和利息不会等你。',visual:'现金流'},{id:'s2',text:'家里有没有足够现金？',visual:'现金储备'}];
 assert.throws(()=>validateRecutPlan({segments:[{...segments[0],text:'全新文案'},segments[1]]},segments,'9:16'),/改变了口播/);
 assert.throws(()=>validateRecutPlan({segments:[segments[1],segments[0]]},segments,'9:16'),/改变了口播/);
 assert.throws(()=>validateRecutPlan({segments,unsupportedReason:'更换声音'},segments,'9:16'),/仅支持/);
 const plan=validateRecutPlan({segments,options:{subtitleFontSize:999,presenterShare:-1,script:'bad',voiceId:'bad'}},segments,'9:16');
 assert.equal(plan.options.presenterShare,.3);assert.equal('script' in plan.options,false);assert.equal('voiceId' in plan.options,false);
});

test('recut dispatch never requires a voice or invokes HeyGen creation',async()=>{
 const {executeSpokenVideoProduction}=await import('./spoken-video-production.mjs');
 const http=await import('node:http');let hits=0;
 const server=http.createServer((req,res)=>{hits++;assert.match(req.url,/kind=recut/);res.writeHead(404);res.end();});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{await assert.rejects(executeSpokenVideoProduction({payload:{mode:'recut',jobId:'test'}},'lease',{remoteBase:`http://127.0.0.1:${server.address().port}`,token:'test'}),/无法读取原版本/);assert.equal(hits,1);}finally{server.close();}
});
