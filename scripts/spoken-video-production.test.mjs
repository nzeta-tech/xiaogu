import { test } from "node:test";
import assert from "node:assert/strict";
import { assertRequestedKnowledgeCards, compactSrt, enforceRequestedKnowledgeCards, knowledgeCardNeedsGeneratedCard, knowledgeCardSpec, materialSearchQueries, normalizePresentationText, normalizeSubtitleSrt, repairRequestedKnowledgeCards, requiresStrictAiKnowledgeCards, retryAiKnowledgeCard, reusableLicense, requiresFullscreenKnowledgeCards, selectKnowledgeCardIndices, shouldGenerateCompleteKnowledgeCard, shouldPreserveRecutMaterials, shouldUseExplainerCard, smartTimelineSegments, snapCutsToCaptions } from "./spoken-video-production.mjs";

test("same materials and template bypasses recut replanning",()=>{
  assert.equal(shouldPreserveRecutMaterials("使用与 V20 完全相同的素材、模板、人物、声音和口播原文，重新走一遍完整生成流程"),true);
  assert.equal(shouldPreserveRecutMaterials("复用原有全部素材和模板，只重新渲染成片"),true);
  assert.equal(shouldPreserveRecutMaterials("知识卡更精美，替换全部画面素材"),false);
});

test("presentation copy repairs adjacent percentage ranges without changing values",()=>{
  assert.equal(normalizePresentationText("收益率常年在 2.5%3.5% 区间"),"收益率常年在 2.5%—3.5% 区间");
  assert.equal(normalizePresentationText("3%-5%、6%-10%、25%-35%"),"3%-5%、6%-10%、25%-35%");
});

test("recut subtitles repair a percentage range split across timed cues",()=>{
  const input="1\n00:00:01,000 --> 00:00:02,000\n收益率常年在2.\n\n2\n00:00:02,000 --> 00:00:03,000\n5%3.5%区间。\n";
  const output=normalizeSubtitleSrt(input);
  assert.match(output,/收益率常年在\n\n2\n/);
  assert.match(output,/2\.5%—3\.5%区间/);
  assert.doesNotMatch(output,/2\.5%3\.5%/);
});

test("AI knowledge cards retry transient generation failures",async()=>{
  const calls=[];
  const card=await retryAiKnowledgeCard(async attempt=>{
    calls.push(attempt);
    if(attempt<3)throw new Error("fetch failed");
    return {source:"xiaogu-ai-knowledge-card"};
  },{delayMs:0});
  assert.equal(card.source,"xiaogu-ai-knowledge-card");
  assert.deepEqual(calls,[1,2,3]);
});

test("AI knowledge cards fail closed after retries",async()=>{
  let calls=0;
  await assert.rejects(()=>retryAiKnowledgeCard(async()=>{calls++;throw new Error("fetch failed");},{delayMs:0}),/fetch failed/);
  assert.equal(calls,3);
});

test("explicit all-AI card styling disables local card fallback",()=>{
  assert.equal(requiresStrictAiKnowledgeCards({forceCard:true,cardStyle:"全部用 AI 生成，统一深蓝财经信息图"}),true);
  assert.equal(requiresStrictAiKnowledgeCards({forceCard:true,cardStyle:"简洁专业"}),false);
  assert.equal(requiresStrictAiKnowledgeCards({forceCard:false,cardStyle:"AI 深蓝财经信息图"}),false);
});
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

test("money retained and resident-loan decline selects a debt-flow diagram without a repayment keyword",()=>{
  const spec=knowledgeCardSpec(["钱并没有凭空消失，","居民贷款前8个月却减少了1.03万亿。"],"货币与居民贷款变化",3);
  assert.equal(spec.kind,"debtFlow");
  assert.match(spec.claim,/1\.03万亿/);
});

test("validated expression relation selects a generic diagram without domain keywords",()=>{
  const spec=knowledgeCardSpec(["收入一波动，","它就是现金流压力。"],"收入波动与现金流",13,"",{kind:"cause",nodes:["收入一波动，","它就是现金流压力。"]});
  assert.equal(spec.kind,"causeDiagram");
  assert.deepEqual(spec.nodes,["收入一波动，","它就是现金流压力。"]);
});

test("card capacity gate routes long prose to generated editorial artwork",()=>{
  assert.equal(knowledgeCardNeedsGeneratedCard({kind:"comparisonDiagram",nodes:["央行的城镇居民资产调研告诉我们，国内城镇家庭住房资产占家庭总资产接近60%。","真正的金融活钱资产只占20.4%。"]}),true);
  assert.equal(knowledgeCardNeedsGeneratedCard({kind:"comparisonDiagram",nodes:["住房资产接近60%","金融活钱约20.4%"]}),false);
});

test("structured teaching cards prefer a complete AI-designed composition",()=>{
  assert.equal(shouldGenerateCompleteKnowledgeCard({kind:"metrics"},["住房资产接近60%","金融活钱资产只占20.4%"]),true);
  assert.equal(shouldGenerateCompleteKnowledgeCard({kind:"numbered",points:["第一，现金流稳定","第二，管理省心","第三，可以变现","第四，波动可承受"]},["第一，现金流稳定","第二，管理省心","第三，可以变现","第四，波动可承受"]),true);
  assert.equal(shouldGenerateCompleteKnowledgeCard({kind:"causeDiagram",nodes:["利率上升","债券价格下降"]},["利率上升","债券价格下降"]),true);
  assert.equal(shouldGenerateCompleteKnowledgeCard({kind:"spotlight"},["核心结论只有一句"]),false);
  assert.equal(shouldGenerateCompleteKnowledgeCard({kind:"spotlight"},["收益率3%-5%","最大回撤25%-35%"]),true);
});

test("numbered cards preserve four grounded criteria",()=>{
  const points=["第一，现金流够不够稳；","第二，要不要天天管理；","第三，急用钱能不能拿出来；","第四，价格波动能不能承受。"];
  const spec=knowledgeCardSpec(points,"四个判断维度",1);
  assert.equal(spec.kind,"numbered");
  assert.deepEqual(spec.points,points);
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
 const plan=validateRecutPlan({segments,options:{subtitleFontSize:999,presenterShare:-1,script:'bad',voiceId:'bad'}},segments,'9:16',{instructions:'字幕和人物比例都调整'});
 assert.equal(plan.options.presenterShare,.3);assert.equal('script' in plan.options,false);assert.equal('voiceId' in plan.options,false);
});

test('explicit full-screen card recuts cannot leave explanatory cards in PIP',async()=>{
 const {validateRecutPlan}=await import('./spoken-video-production.mjs');
 const instructions='将所有知识卡、证据卡和解释图改为全屏，禁止人物画中画和无意义留白。';
 assert.equal(requiresFullscreenKnowledgeCards(instructions),true);
 const segments=[{id:'s1',text:'今天我们聊现金流。',intent:'anchor',visualTreatment:'presenter',layout:'presenter'},{id:'s2',text:'第一，现金流够不够稳；第二，急用钱能不能拿出来。',intent:'explain',visualTreatment:'motion-card',layout:'presenter-pip'}];
 const parsed={segments:segments.map(s=>({...s,regenerate:false,forceCard:false,layout:'presenter-pip'})),options:{}};
 const plan=validateRecutPlan(parsed,segments,'9:16',{instructions});
 assert.equal(plan.segments[0].layout,'presenter');
 assert.deepEqual(Object.fromEntries(['layout','forceFullscreen','regenerate','forceCard'].map(key=>[key,plan.segments[1][key]])),{layout:'fullscreen',forceFullscreen:true,regenerate:true,forceCard:true});
});

test('natural full-canvas wording forces relationship shots back to knowledge cards',()=>{
 const instructions='重新优化并混剪全部知识卡分镜，每张知识卡始终按竖屏画布完整铺满，人物仅作为右下角圆形浮层。';
 assert.equal(requiresFullscreenKnowledgeCards(instructions),true);
 const segments=[
  {id:'s1',text:'开场。',intent:'anchor',expression:{kind:'presenter',nodes:[]},layout:'presenter',visualTreatment:'presenter'},
  {id:'s2',text:'住房占60%，活钱占20.4%。',intent:'evidence',expression:{kind:'compare',nodes:['住房占60%，','活钱占20.4%。']},layout:'presenter',visualTreatment:'presenter'},
 ];
 const result=enforceRequestedKnowledgeCards(segments,instructions);
 assert.equal(result[0].visualTreatment,'presenter');
 assert.deepEqual(Object.fromEntries(['layout','forceFullscreen','regenerate','forceCard','visualTreatment'].map(key=>[key,result[1][key]])),{layout:'fullscreen',forceFullscreen:true,regenerate:true,forceCard:true,visualTreatment:'motion-card'});
 assert.throws(()=>assertRequestedKnowledgeCards(result,[{kind:'presenter'},{kind:'presenter',source:'xiaogu-presenter-anchor'}],instructions),/修改要求未落实/);
 assert.equal(assertRequestedKnowledgeCards(result,[{kind:'presenter'},{kind:'image',source:'xiaogu-knowledge-card'}],instructions),true);
});

test('requested cards are repaired inside the same attempt instead of restarting the task',async()=>{
 const instructions='重新优化全部知识卡，每张知识卡完整铺满竖屏画布。';
 const segments=[{id:'s1',text:'开场。',intent:'anchor',expression:{kind:'presenter',nodes:[]},layout:'presenter'},{id:'s2',text:'资产与活钱对比。',intent:'evidence',expression:{kind:'compare',nodes:['资产','与活钱对比。']},layout:'presenter'}];
 const calls=[];
 const repaired=await repairRequestedKnowledgeCards(segments,[{kind:'presenter'},{kind:'presenter',source:'xiaogu-presenter-anchor'}],instructions,async(segment,index)=>{calls.push([segment.id,index,segment.forceCard,segment.layout]);return{kind:'image',source:'xiaogu-ai-knowledge-card'};});
 assert.deepEqual(calls,[['s2',1,true,'fullscreen']]);
 assert.equal(repaired[1].kind,'image');
});

test('knowledge-card scheduler preserves rhythm and prioritizes teachable relations',()=>{
 const segments=Array.from({length:30},(_,index)=>({id:`s${index}`,text:index%3===0?'过渡观点。':`第${index}项收益为${index}%，因此现金流变化。`,intent:index%3===0?'anchor':'evidence',expression:index%3===0?{kind:'presenter',nodes:[]}:{kind:'cause',nodes:[`第${index}项收益为${index}%，`,'因此现金流变化。']},visualTreatment:'motion-card',material:{kind:'image'}}));
 const selected=selectKnowledgeCardIndices(segments);
 assert(selected.size<=18);
 assert(!selected.has(0));
 let run=0;for(let index=0;index<segments.length;index+=1){run=selected.has(index)?run+1:0;assert(run<=2);}
 const planned=enforceRequestedKnowledgeCards(segments,'重新优化全部知识卡并完整铺满画布');
 assert.equal(planned[0].layout,'presenter');
 assert.equal(planned[1].layout,'fullscreen');
 assert.equal(planned.filter(segment=>segment.forceCard).length,selected.size);
});

test('recut dispatch never requires a voice or invokes HeyGen creation',async()=>{
 const {executeSpokenVideoProduction}=await import('./spoken-video-production.mjs');
 const http=await import('node:http');let hits=0;
 const server=http.createServer((req,res)=>{hits++;assert.match(req.url,/kind=recut/);res.writeHead(404);res.end();});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{await assert.rejects(executeSpokenVideoProduction({payload:{mode:'recut',jobId:'test'}},'lease',{remoteBase:`http://127.0.0.1:${server.address().port}`,token:'test'}),/无法读取原版本/);assert.equal(hits,1);}finally{server.close();}
});
