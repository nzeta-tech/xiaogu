import {test} from "node:test";
import assert from "node:assert/strict";
import {classifyWebSource,normalizeWebSources,researchSegmentsWithCodex} from "./spoken-video-web-research.mjs";
import {mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

test("web research retains relevant evidence and rejects unrelated media",()=>{
  const segment={visual:"先还贷？先看信贷数据",text:"8月新增贷款600亿，前8个月住户贷款减少1.03万亿元。"};
  const sources=normalizeWebSources([
    {title:"金融统计数据报告",url:"https://www.pbc.gov.cn/report.pdf",content:"前8个月住户贷款减少1.03万亿元",score:.7},
    {title:"家庭还贷视频",url:"https://www.bilibili.com/video/BV123",content:"家庭房贷",score:.8},
    {title:"居民贷款图解",url:"https://example.com/chart.webp",kind:"image",content:"住户贷款",score:.1},
  ],segment);
  assert.equal(sources[0].kind,"document");
  assert.equal(sources[0].official,true);
  assert.equal(sources.find(source=>source.kind==="video"),undefined);
  assert.equal(sources.find(source=>source.kind==="image"),undefined);
});

test("web source classification keeps media and reports distinct",()=>{
  assert.equal(classifyWebSource("https://example.com/a.pdf"),"document");
  assert.equal(classifyWebSource("https://example.com/a.jpg"),"image");
  assert.equal(classifyWebSource("https://www.youtube.com/watch?v=abc"),"video");
  assert.equal(classifyWebSource("https://example.com/article"),"webpage");
});

test("Codex research validates segment alignment and keeps unlicensed media as leads only",async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),"spoken-research-test-"));
  const segments=[{id:"s1",visual:"信贷数据",text:"新增贷款600亿"},{id:"s2",visual:"家庭现金流",text:"先看现金流"}];
  try{
    const runner=async(_command,args,options)=>{
      const input=JSON.parse(await readFile(path.join(dir,"web-research-input.json"),"utf8"));
      assert.deepEqual(input.segments.map(segment=>segment.id),["s1","s2"]);
      assert.deepEqual(Object.keys(input.segments[0]),["id","text","visual"]);
      assert.equal(input.segments[0].queries,undefined);
      assert.ok(args.includes("read-only"));
      assert.equal(options.env.TAVILY_API_KEY,undefined);
      assert.equal(options.env.SEARCH_API_KEY,undefined);
      await writeFile(args[args.indexOf("-o")+1],JSON.stringify({webAccessed:true,segments:[{id:"s1",sources:[{title:"金融报告",url:"https://www.pbc.gov.cn/data.pdf",content:"新增贷款600亿"},{title:"相关视频",url:"https://www.bilibili.com/video/BV123",content:"新增贷款600亿"}]},{id:"s2",sources:[]}]}));
    };
    const result=await researchSegmentsWithCodex(segments,dir,runner);
    assert.equal(result.length,2);
    assert.equal(result[0][0].kind,"document");
    assert.equal(result[0].find(source=>source.kind==="video")?.rights,"unverified");
    assert.deepEqual(result[1],[]);
    await assert.rejects(researchSegmentsWithCodex(segments,dir,async(_command,args)=>writeFile(args[args.indexOf("-o")+1],JSON.stringify({webAccessed:false,segments:[]}))),/实时网页检索/);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test("resume research batches uncached segments while retaining per-segment checkpoints",async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),"spoken-research-batch-test-"));
  const dir=path.join(root,"work");
  const {videoResumeCache}=await import("./spoken-video-resume.mjs");
  const segments=Array.from({length:9},(_,index)=>({id:`s${index+1}`,visual:`主题${index+1}`,text:`内容${index+1}`}));
  const calls=[];
  const runner=async(_command,args,options)=>{
    const input=JSON.parse(await readFile(path.join(options.cwd,"web-research-input.json"),"utf8"));
    calls.push(input.segments.map(segment=>segment.id));
    await writeFile(args[args.indexOf("-o")+1],JSON.stringify({webAccessed:true,segments:input.segments.map(segment=>({id:segment.id,sources:[]}))}));
  };
  try{
    await researchSegmentsWithCodex(segments,dir,runner,videoResumeCache(root,"task"));
    assert.deepEqual(calls.map(call=>call.length).sort((a,b)=>a-b),[1,4,4]);
    calls.length=0;
    await researchSegmentsWithCodex(segments,dir,runner,videoResumeCache(root,"task"));
    assert.equal(calls.length,0);
    await researchSegmentsWithCodex([{...segments[0],text:"已修改"},...segments.slice(1)],dir,runner,videoResumeCache(root,"task"));
    assert.deepEqual(calls,[["s1"]]);
  }finally{await rm(root,{recursive:true,force:true});}
});
