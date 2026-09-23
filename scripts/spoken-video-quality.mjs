import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, rm, stat, copyFile } from "node:fs/promises";
import { VideoStageOutputError } from "./spoken-video-stage.mjs";
import sharp from "sharp";
import {measureVideoStage} from "./spoken-video-performance.mjs";
import {mapVideoWork} from "./spoken-video-concurrency.mjs";

const exec = promisify(execFile);
export const reviewScopeRules = "The narration is locked and defines the scope of this review. Never require extra examples, specific filenames, dates, numerical values, or step-by-step procedures that are absent from the narration. For a general recommendation, a matching concrete illustration and its exact takeaway are sufficient; do not reject it solely for omitting an unstated method. Still reject unrelated or misleading visuals, blank frames, unreadable subtitles, and visible overlap. Image models render artwork without letters or numbers; exact text is composited separately, so art directions must not require invented text labels or values.";
function run(command,args,options={}){
  const pending=exec(command,args,{timeout:options.timeout||120000,maxBuffer:8*1024*1024,cwd:options.cwd,env:options.env});
  pending.child?.stdin?.end();
  return measureVideoStage(command==="ffmpeg"?"qa_extract":"qa_model",()=>pending);
}

export function reviewFrameTimes(segments,total,presenterShare=0.6){
  const weights=segments.map(segment=>Math.max(segment.text?.length||0,1));
  const sum=weights.reduce((a,b)=>a+b,0);
  if(segments.some(segment=>segment.layout||segment.intent)){
    const midpoints=[];let cursor=0;
    for(let index=0;index<segments.length;index++){
      const length=index===segments.length-1?total-cursor:total*weights[index]/sum;
      midpoints.push(Math.min(total-.3,cursor+length/2));cursor+=length;
    }
    return midpoints.length<=24?midpoints:Array.from({length:24},(_,index)=>midpoints[Math.floor(index*(midpoints.length-1)/23)]);
  }
  const materialTimes=[],presenterTimes=[];let cursor=0;
  for(let i=0;i<segments.length;i++){
    const length=i===segments.length-1?total-cursor:total*weights[i]/sum;
    const share=Math.min(.85,Math.max(.3,presenterShare));
    presenterTimes.push(Math.min(total-.3,cursor+Math.max(.3,length*share/2)));
    materialTimes.push(Math.min(total-.3,cursor+length*(share+(1-share)/2)));
    cursor+=length;
  }
  const selected=materialTimes.length<=6?materialTimes:Array.from({length:6},(_,i)=>materialTimes[Math.floor(i*(materialTimes.length-1)/5)]);
  const presenterIndices=[0,Math.floor((presenterTimes.length-1)/2),presenterTimes.length-1];
  const presenterSamples=[...new Set(presenterIndices)].map(index=>presenterTimes[index]);
  return [...presenterSamples,...selected].slice(0,9).sort((a,b)=>a-b);
}

export async function createReviewSheet(video,dir,segments,total,presenterShare,shotTimeline=[],options={}){
  const semanticShots=Array.isArray(shotTimeline)&&shotTimeline.length===segments.length?shotTimeline:null;
  const midpoints=semanticShots
    ? semanticShots.map((shot,index)=>({time:Math.min(total-.3,Number(shot.start)+Number(shot.length)/2),label:segments[index]?.id||"frame"}))
    : reviewFrameTimes(segments,total,presenterShare).map((time,index)=>({time,label:segments[index]?.id||"frame"}));
  const boundaries=Array.isArray(shotTimeline)?shotTimeline.slice(1).flatMap((shot,index)=>[
    {time:Math.max(.05,Number(shot.start)-.18),label:`cut ${index+1} -`},
    {time:Math.min(total-.05,Number(shot.start)+.18),label:`cut ${index+1} +`},
  ]).filter(item=>Number.isFinite(item.time)):[];
  // Every semantic beat must be represented. The previous first-16 cap silently
  // omitted the closing section of longer videos, which is often where the final
  // summary cards and call to action live.
  const samples=boundaries.length?[...midpoints,...boundaries.slice(0,8)].sort((a,b)=>a.time-b.time):midpoints;
  const semantic=segments.some(segment=>segment.layout||segment.intent);
  const columns=semantic?4:3,width=semantic?270:420,height=semantic?480:746,header=32;
  const layers=[];
  let prior=[];try{prior=JSON.parse(await readFile(path.join(dir,"qa-samples.json"),"utf8"));}catch{}
  const changed=Array.isArray(options.changedIds)?new Set(options.changedIds):null;
  const reusable=new Set();
  if(changed)await Promise.all(samples.map(async(sample,index)=>{
    if(sample.label.startsWith("cut ")||changed.has(sample.label))return;
    const saved=prior[index];
    if(saved?.label!==sample.label||saved?.time!==sample.time)return;
    try{if((await stat(path.join(dir,`qa-frame-${index}.jpg`))).size)reusable.add(index);}catch{}
  }));
  const missing=samples.filter((_,index)=>!reusable.has(index));
  const frameNumbers=[...new Set(missing.map(sample=>Math.max(0,Math.round(sample.time*30))))].sort((a,b)=>a-b);
  const batch=process.env.LOCAL_AGENT_VIDEO_FRAME_MODE!=="seek"&&missing.length>8;
  let batchReady=false;
  if(batch){
    try{
      await Promise.all(frameNumbers.map((_,i)=>rm(path.join(dir,`qa-batch-${i+1}.jpg`),{force:true})));
      await run("ffmpeg",["-v","error","-y","-i",video,"-an","-vf",`fps=30,select='${frameNumbers.map(n=>`eq(n,${n})`).join("+")}',scale=${width}:${height}:force_original_aspect_ratio=decrease`,"-fps_mode","vfr",path.join(dir,"qa-batch-%d.jpg")],{timeout:180000});
      batchReady=(await Promise.all(frameNumbers.map((_,i)=>stat(path.join(dir,`qa-batch-${i+1}.jpg`))))).every(s=>s.size>0);
    }catch{batchReady=false;}
  }
  await mapVideoWork([...samples.entries()],2,async([index,sample])=>{
    const time=sample.time;
    const file=path.join(dir,`qa-frame-${index}.jpg`);
    if(!reusable.has(index)&&batchReady)await copyFile(path.join(dir,`qa-batch-${frameNumbers.indexOf(Math.max(0,Math.round(time*30)))+1}.jpg`),file);
    if(!reusable.has(index)&&!batchReady)await run("ffmpeg",["-v","error","-y","-ss",time.toFixed(2),"-i",video,"-frames:v","1","-vf",`scale=${width}:${height}:force_original_aspect_ratio=decrease`,file],{timeout:30000});
    const thumbnail=await sharp(file).resize(width,height,{fit:"contain",background:"#18221b"}).jpeg({quality:85}).toBuffer();
    const left=index%columns*width,top=Math.floor(index/columns)*(height+header);
    layers.push({input:thumbnail,left,top:top+header});
    const label=`${sample.label} · ${time.toFixed(1)}s`;
    layers.push({input:Buffer.from(`<svg width="${width}" height="${header}"><rect width="100%" height="100%" fill="#173d2b"/><text x="10" y="20" fill="white" font-family="Arial" font-size="14">${label}</text></svg>`),left,top});
  });
  const rows=Math.ceil(samples.length/columns),file=path.join(dir,"qa-contact.jpg");
  await sharp({create:{width:width*columns,height:rows*(height+header),channels:3,background:"#152119"}}).composite(layers).jpeg({quality:88}).toFile(file);
  await writeFile(path.join(dir,"qa-samples.json"),JSON.stringify(samples));
  return file;
}

export const reviewSeverityRules = "Return findings: an array of {category,segmentId,evidence,message}, all fields nonempty strings. Advisory categories: layout_variety, illustration_depth. These apply ONLY to accurate, relevant, readable and professionally composed content. Blocking categories: content_error, misleading_visual, unrelated_visual, unreadable_text, critical_overlap, blank_frame, face_distortion, document_like_card, presenter_continuity, weak_visual_hierarchy. A run of plain document-like text boxes, large unused space, missing audience-facing titles, or cards that merely repeat narration without expressing the stated relationship is document_like_card or weak_visual_hierarchy and blocks delivery. In a talking-head video, long consecutive runs with neither a full presenter nor a safe circular presenter PIP are presenter_continuity and block delivery. Missing financial conditions, incorrect rates/cash-flow arrows, expected returns shown as guaranteed, unreadable text and overlap obscuring subtitles/key content remain blocking. Cosmetic style preference alone is advisory. Never classify a real blocker as advisory. Cite labelled segments and visible evidence, not metadata or thumbnail size alone. issues must contain blocking messages only. pass=true exactly when there are no blockers. Give repair actions only for blockers; advisory-only results must pass without aesthetic repair rounds.";

export function parseReview(text){
  const clean=text.trim().replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,"");
  const parsed=JSON.parse(clean);
  if(typeof parsed?.pass!=="boolean"||!Array.isArray(parsed.issues))throw new VideoStageOutputError("Codex 质检报告格式无效");
  const advisory=new Set(["layout_variety","illustration_depth"]);
  const blocking=new Set(["content_error","misleading_visual","unrelated_visual","unreadable_text","critical_overlap","blank_frame","face_distortion","document_like_card","presenter_continuity","weak_visual_hierarchy"]);
  let warnings=[];
  if(parsed.findings!==undefined){
    if(!Array.isArray(parsed.findings)||parsed.findings.some(f=>!f||!["category","segmentId","evidence","message"].every(k=>typeof f[k]==="string"&&f[k].trim())||(!advisory.has(f.category)&&!blocking.has(f.category))))throw new VideoStageOutputError("Codex 质检分级格式无效");
    const blockers=parsed.findings.filter(f=>blocking.has(f.category));
    warnings=parsed.findings.filter(f=>advisory.has(f.category)).map(f=>`${f.segmentId}：${f.message}`).slice(0,8);
    parsed.issues=[...new Set([...parsed.issues.map(String),...blockers.map(f=>`${f.segmentId}：${f.message}`)])];
    // An explicit rejection is never upgraded, including legacy reports.
    parsed.pass=parsed.pass&&blockers.length===0&&parsed.issues.length===0;
  }else if(parsed.issues.length){parsed.pass=false;}
  return {pass:parsed.pass,issues:parsed.issues.map(String).slice(0,8),warnings,layoutFixes:Object.fromEntries(Object.entries(parsed.layoutFixes&&typeof parsed.layoutFixes==="object"?parsed.layoutFixes:{}).filter(([,layout])=>layout==="fullscreen")),searchQueries:parsed.searchQueries&&typeof parsed.searchQueries==="object"?parsed.searchQueries:{},cardFixes:parsed.cardFixes&&typeof parsed.cardFixes==="object"?parsed.cardFixes:{},presenterShare:Number(parsed.presenterShare),subtitleMaxChars:Number(parsed.subtitleMaxChars)};
}

export async function codexReview({dir,contactSheet,title,script,segments,materials,references=[],attempt,presenterShare,shotTimeline=[],reviewScope=null,previousReview=null},runner=run){
  const input=path.join(dir,"qa-input.json"),output=path.join(dir,`qa-review-${attempt}.json`);
  await rm(output,{force:true});
  const semantic=segments.some(segment=>segment.layout||segment.intent);
  await writeFile(input,JSON.stringify({title,script,presenterShare,reviewScope,previousReview,timelineMode:semantic?"semantic":"alternating",contactSheetSampling:shotTimeline.length?"Semantic-beat midpoints plus representative frames immediately before and after cuts; cut-pair labels end in - and +.":semantic?"Every semantic-beat midpoint is sampled when there are at most 24 beats and labelled with its segment id.":"Three full-frame presenter frames and up to six material frames are intentionally sampled; frame counts do not represent screen-time proportions.",shotTimeline:shotTimeline.map(shot=>({start:shot.start,length:shot.length,layout:shot.layout,showMaterial:shot.showMaterial})),segments:segments.map((segment,i)=>({id:segment.id,parentId:segment.parentId,intent:segment.intent,narrativeRole:segment.narrativeRole,visualTreatment:segment.visualTreatment,layout:materials[i].kind==="presenter"?"presenter":shotTimeline[i]?.layout||segment.layout,text:segment.text,visual:segment.visual,query:segment.query,cardPoints:segment.cardPoints,references:(references[i]||[]).slice(0,2).map(source=>({title:source.title,excerpt:source.excerpt,url:source.url})),material:{kind:materials[i].kind,title:materials[i].title,source:materials[i].source,license:materials[i].license,points:materials[i].points,presentation:materials[i].presentation}}))},null,2));
  const prompt=`When reviewScope is present, prioritize those changed segments and their neighbors. Reuse previous judgments for unchanged content, but verify all unresolved prior issues and full-timeline presenter continuity. The complete contact sheet is still supplied; do not drop unresolved issues outside the scope. You are the final quality director for a Chinese talking-head video. Inspect the attached contact sheet and read qa-input.json. For an alternating timeline, frame counts do not indicate screen-time share and presenterShare is the full-frame presenter fraction. For a semantic timeline, labelled segment frames show beat midpoints. Labels such as cut 2 - and cut 2 + show frames immediately before and after one edit; compare each pair for a black frame, jarring composition jump, broken presenter continuity or unrelated visual handoff. Each segment's layout is authoritative: presenter, presenter-pip, fullscreen, presenter-overlay, presenter-data, or presenter-evidence. The three presenter-* composite layouts intentionally keep the full presenter behind a floating scene, short data card, or short evidence excerpt. Flag subtitle overlap, unreadable floating text, hidden faces, or a floating panel that dominates the frame. Judge actual frame composition, subtitle readability, presenter continuity, visual variety, professional information hierarchy, and whether every visual specifically explains its matching spoken text. Reject long runs of document-like narration boxes, unexplained empty space, missing titles, and cards that fail to visualize their declared compare/sequence/timeline/cause/parts relationship. Check whether evidence beats visibly support the claim and explanation beats make the mechanism easier to understand. Base segment-specific criticism on the labelled frame, not metadata alone. Do not invent financial claims. Return ONLY valid JSON with keys pass (boolean), issues (short Chinese strings), cardFixes (object mapping each abstract/data-heavy, document-like or visually weak segment that needs a professional illustrated knowledge card to {style:"brief art direction for a distinct original illustration"}), searchQueries (object mapping only concrete visual scenes worth another licensed-stock search to arrays of up to 3 precise English queries), presenterShare (number 0.3-0.8, used only for alternating timelines), subtitleMaxChars (integer 10-14). Prefer cardFixes for numerical claims and abstract financial concepts; prefer searchQueries for concrete real-world scenes. Give a poor segment either cardFixes or searchQueries, never both. Set pass=true only when ready to deliver. Do not edit files.`;
  const env={...process.env};delete env.HEYGEN_API_KEY;
  const repairRules="Also return layoutFixes: an object mapping segment ids to fullscreen only when presenter PIP actually overlaps subtitles or diagram content. A layout-only defect must use layoutFixes, not cardFixes or searchQueries; preserve its otherwise valid artwork. For document-like or weak cards return cardFixes with a concrete professional diagram direction (comparison, cash-flow arrows, rate formula or timeline) grounded only in that segment's narration, not generic financial ornaments. A safe presenter PIP is preferred on short, low-density cards; fullscreen is reserved for dense diagrams. Never override an actual defect to pass.";
  let runnerError;
  try{await runner(process.env.CODEX_CLI_BIN||"codex",["exec","--model",process.env.CODEX_CLI_MODEL||"gpt-5.6-terra","--skip-git-repo-check","--sandbox","workspace-write","-i",contactSheet,"-o",output,`${reviewScopeRules}\n${prompt}\n${repairRules}\n${reviewSeverityRules}`],{cwd:dir,env,timeout:Math.min(240000,Math.max(30000,Number(process.env.LOCAL_AGENT_VIDEO_REVIEW_TIMEOUT_MS)||120000))});}catch(error){runnerError=error;}
  let result;
  try{result=await readFile(output,"utf8");}catch(error){if(error.code==="ENOENT"){if(runnerError)throw runnerError;throw new VideoStageOutputError("Codex 未写入质检结果");}throw error;}
  return parseReview(result);
}
