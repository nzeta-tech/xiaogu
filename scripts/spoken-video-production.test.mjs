import { test } from "node:test";
import assert from "node:assert/strict";
import { compactSrt, knowledgeCardSpec, materialSearchQueries, prepareFullDirectorRedesign, requestsFullDirectorRedesign, reusableLicense, shouldUseExplainerCard, smartTimelineSegments, snapCutsToCaptions } from "./spoken-video-production.mjs";
import { expandSmartSegments, presenterAnchorMaterial } from "./spoken-video-beats.mjs";

test("smart production expands a paragraph into exact semantic visual beats", () => {
  const source="8月新增贷款600亿元。这个数字不能单独说明家庭没钱，而要结合居民贷款变化来看。";
  const beats=expandSmartSegments([{id:"s1",text:source,visual:"信贷数据怎么读",query:"China household lending",beats:[
    {text:"8月新增贷款600亿元。",intent:"evidence",layout:"presenter-pip",query:"China August new loans official chart",visual:"8月新增贷款"},
    {text:"这个数字不能单独说明家庭没钱，而要结合居民贷款变化来看。",intent:"explain",layout:"presenter-pip",query:"household lending comparison diagram",visual:"两个口径一起看"},
  ]}]);
  assert.equal(beats.map(beat=>beat.text).join(""),source);
  assert.deepEqual(beats.map(beat=>beat.id),["s1-b1","s1-b2"]);
  assert.deepEqual(beats.map(beat=>beat.intent),["evidence","explain"]);
});

test("smart production falls back safely when a supplied beat rewrites narration", () => {
  const source="家庭先看现金流，再决定是否提前还贷。";
  const beats=expandSmartSegments([{id:"s1",text:source,visual:"先看现金流",query:"family cash flow",beats:[{text:"所有家庭都应该提前还贷。",intent:"anchor"}]}]);
  assert.equal(beats.map(beat=>beat.text).join(""),source);
  assert.ok(beats.length>=1&&beats.length<=4);
  assert.ok(beats.every(beat=>["presenter","presenter-pip","fullscreen"].includes(beat.layout)));
});

test("smart timeline keeps the opening decision on the presenter before evidence cards",()=>{
  const beats=smartTimelineSegments([{id:"s1",text:"手里有余钱，是投资还是把贷款先还掉？新增贷款600亿。",visual:"余钱怎么选",query:"mortgage",beats:[
    {text:"手里有余钱，是投资还是把贷款先还掉？",intent:"scene",layout:"fullscreen",visual:"余钱选择",query:"family finance"},
    {text:"新增贷款600亿。",intent:"evidence",layout:"presenter-pip",visual:"新增贷款",query:"loan data"},
  ]}]);
  assert.deepEqual(beats.map(beat=>beat.layout),["presenter","presenter-pip"]);
  assert.deepEqual(beats.map(beat=>beat.intent),["anchor","evidence"]);
});

test("presenter anchors do not create or archive filler artwork", () => {
  const material=presenterAnchorMaterial({visual:"关键结论",query:"speaker"});
  assert.equal(material.kind,"presenter");
  assert.equal(material.source,"xiaogu-presenter-anchor");
});

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

test("subtitle breaks preserve core financial phrases", () => {
  const input=`1\n00:00:00,000 --> 00:00:06,000\n居民去杠杆不等于全民躺平，家庭资产负债表要先守住现金流。\n`;
  const output=compactSrt(input,11);
  assert.doesNotMatch(output,/不\n\n\d+\n[^\n]+\n等于/);
  assert.doesNotMatch(output,/资产\n\n\d+\n[^\n]+\n负债表/);
  assert.doesNotMatch(output,/现金\n\n\d+\n[^\n]+\n流/);
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
  assert.equal(spec.metrics[0].value,"600亿");
  assert.equal(knowledgeCardSpec(["投资回报和资产价格都有波动，但月供和利息不会等你。","收入一波动，它就是现金流压力。"],"确定月供与现金流压力",3).kind,"cashflow");
  assert.equal(knowledgeCardSpec(["“买了就能涨”的确定性已经没那么强了。","房子有居住价值、地段价值。"],"房产价值与上涨预期",2).kind,"houseExpectation");
  assert.equal(knowledgeCardSpec(["从“赌未来上涨”变成“降低确定性压力”。"],"从赌上涨到降压力",5).kind,"shift");
});

test("quality-card directions produce distinct relationship diagrams instead of repeated text lists",()=>{
  assert.equal(knowledgeCardSpec(["已缴保费，","抵押给银行，","获得贷款。"],"保单抵押",0,"三步现金流箭头图").kind,"flowDiagram");
  assert.equal(knowledgeCardSpec(["退保回款，","偿还本金，","净落袋。"],"第五年",0,"时间线瀑布图").kind,"timelineDiagram");
  assert.equal(knowledgeCardSpec(["中银P值，","汇丰P值。"],"银行利率",0,"横向并列对比条形图").kind,"comparisonDiagram");
  assert.equal(knowledgeCardSpec(["借款本金，","年利率，","一年利息。"],"利息测算",0,"乘法等式公式卡").kind,"formulaDiagram");
  assert.equal(knowledgeCardSpec(["新增贷款只有600亿，但M2还在增长。"],"两个口径",0,"双轨走势").kind,"moneyDivergence");
  assert.equal(knowledgeCardSpec(["居民贷款前8个月减少了1.03万亿。","家庭主动还贷。"],"家庭资金流",1,"储蓄池与负债收缩").kind,"debtFlow");
  assert.equal(knowledgeCardSpec(["这个判断只对了一半。"],"别急着下结论",2,"贷款下降不等于没钱").kind,"halfTruth");
  assert.equal(knowledgeCardSpec(["我还有没有选择权？"],"安全感",3,"应急现金缓冲").kind,"safetyBuffer");
  assert.equal(knowledgeCardSpec(["从先扩大资产变成先守住现金流。"],"资产负债表",4,"家庭去杠杆").kind,"balanceShift");
  assert.equal(knowledgeCardSpec(["这笔贷款要不要先还掉？"],"余钱的选择",5,"投资和提前还贷的决策分叉").kind,"decisionFork");
  assert.equal(knowledgeCardSpec(["不愿把未来很多年的收入抵押给固定负债。"],"家庭账本",6,"长期固定月供").kind,"incomeDebt");
  assert.equal(knowledgeCardSpec(["资产上涨可能覆盖债务。"],"底层逻辑变化",7,"房产杠杆机制").kind,"leverageShift");
  assert.equal(knowledgeCardSpec(["居民没钱了，大家都悲观了。"],"快速结论",8,"").kind,"quickConclusion");
  assert.equal(knowledgeCardSpec(["居民去杠杆不等于全民躺平，更不等于所有人都应该提前还贷。"],"去杠杆",9,"").kind,"deleveraging");
  assert.equal(knowledgeCardSpec(["房子有居住价值、地段价值，但买了就涨不再确定。"],"房产预期",10,"").kind,"houseExpectation");
  assert.equal(knowledgeCardSpec(["如果收入停几个月，月供扛不扛得住？家里有没有足够现金？"],"现金与选择权",11,"").kind,"cashChoice");
  assert.equal(knowledgeCardSpec(["第一，房产上涨预期弱了。"],"上涨预期转弱",12,"").kind,"expectationWeakening");
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

test('a full visual redo clears inherited director choices',()=>{
 assert.equal(requestsFullDirectorRedesign('完整重做全部分镜，达到专业导演级'),true);
 assert.equal(requestsFullDirectorRedesign('只把字幕调大一点'),false);
 const [segment]=prepareFullDirectorRedesign([{id:'s1',text:'观点',expression:{kind:'keypoints'},intent:'explain',visualTreatment:'motion-card',layout:'presenter-pip',narrativeRole:'explain',cardStyle:'旧模板'}]);
 assert.equal(segment.regenerate,true);assert.equal(segment.expression,undefined);assert.equal(segment.intent,undefined);assert.equal(segment.visualTreatment,undefined);assert.equal(segment.layout,undefined);assert.equal(segment.narrativeRole,undefined);assert.equal(segment.cardStyle,'');
});

test('QA artwork repair preserves the smart overlay layout contract',async()=>{
 const {renderWithCodexReview}=await import('./spoken-video-production.mjs');
 const segment={id:'s1',text:'金融活钱资产只占20.4%。',visualTreatment:'data-widget',layout:'fullscreen',intent:'explain',visual:'活钱资产'};
 const material={kind:'image',file:'/tmp/original.jpg',source:'xiaogu-knowledge-card',title:'活钱资产',points:[]};
 let reviews=0,layouts=[];
 const result=await renderWithCodexReview({master:'master',segments:[segment],materials:[material],subtitleUrl:'',script:segment.text,dir:'/tmp',title:'测试',aspectRatio:'9:16',initialOptions:{timelineMode:'semantic'},resolveMaterial:async()=>({...material,file:'/tmp/repaired.jpg'})},{
   finalize:async(_master,segments)=>{layouts.push(segments[0].layout);return {output:'/tmp/final.mp4,dummy',durationSeconds:3,subtitleFile:'/tmp/captions.srt',shotTimeline:[{start:0,length:3,layout:segments[0].layout,showMaterial:true}]};},
   check:async()=>{},sheet:async()=>'/tmp/sheet.jpg',
   review:async()=>++reviews===1?{pass:false,issues:['s1：信息层级弱。'],cardFixes:{s1:{style:'比例对比图'}},searchQueries:{}}:{pass:true,issues:[]},
 });
 assert.deepEqual(layouts,['fullscreen']);
 assert.equal(result.segments[0].layout,'fullscreen');
});

test('recut dispatch never requires a voice or invokes HeyGen creation',async()=>{
 const {executeSpokenVideoProduction}=await import('./spoken-video-production.mjs');
 const http=await import('node:http');let hits=0;
 const server=http.createServer((req,res)=>{hits++;assert.match(req.url,/kind=recut/);res.writeHead(404);res.end();});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{await assert.rejects(executeSpokenVideoProduction({payload:{mode:'recut',jobId:'test'}},'lease',{remoteBase:`http://127.0.0.1:${server.address().port}`,token:'test'}),/无法读取原版本/);assert.equal(hits,1);}finally{server.close();}
});
