import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, rm } from "node:fs/promises";
import { VideoStageOutputError } from "./spoken-video-stage.mjs";
import sharp from "sharp";

const exec = promisify(execFile);
function run(command,args,options={}){
  const pending=exec(command,args,{timeout:options.timeout||120000,maxBuffer:8*1024*1024,cwd:options.cwd,env:options.env});
  pending.child?.stdin?.end();
  return pending;
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

export async function createReviewSheet(video,dir,segments,total,presenterShare){
  const times=reviewFrameTimes(segments,total,presenterShare);
  const semantic=segments.some(segment=>segment.layout||segment.intent);
  const columns=semantic?4:3,width=semantic?270:420,height=semantic?480:746,header=32;
  const layers=[];
  for(const [index,time] of times.entries()){
    const file=path.join(dir,`qa-frame-${index}.jpg`);
    await run("ffmpeg",["-v","error","-y","-ss",time.toFixed(2),"-i",video,"-frames:v","1",file],{timeout:30000});
    const thumbnail=await sharp(file).resize(width,height,{fit:"contain",background:"#18221b"}).jpeg({quality:85}).toBuffer();
    const left=index%columns*width,top=Math.floor(index/columns)*(height+header);
    layers.push({input:thumbnail,left,top:top+header});
    const label=semantic&&times.length===segments.length?`${segments[index].id} · ${time.toFixed(1)}s`:`${time.toFixed(1)}s`;
    layers.push({input:Buffer.from(`<svg width="${width}" height="${header}"><rect width="100%" height="100%" fill="#173d2b"/><text x="10" y="20" fill="white" font-family="Arial" font-size="14">${label}</text></svg>`),left,top});
  }
  const rows=Math.ceil(times.length/columns),file=path.join(dir,"qa-contact.jpg");
  await sharp({create:{width:width*columns,height:rows*(height+header),channels:3,background:"#152119"}}).composite(layers).jpeg({quality:88}).toFile(file);
  return file;
}

function parseReview(text){
  const clean=text.trim().replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,"");
  const parsed=JSON.parse(clean);
  if(typeof parsed?.pass!=="boolean"||!Array.isArray(parsed.issues))throw new VideoStageOutputError("Codex 质检报告格式无效");
  return {pass:parsed.pass,issues:parsed.issues.map(String).slice(0,8),searchQueries:parsed.searchQueries&&typeof parsed.searchQueries==="object"?parsed.searchQueries:{},cardFixes:parsed.cardFixes&&typeof parsed.cardFixes==="object"?parsed.cardFixes:{},presenterShare:Number(parsed.presenterShare),subtitleMaxChars:Number(parsed.subtitleMaxChars)};
}

export async function codexReview({dir,contactSheet,title,script,segments,materials,references=[],attempt,presenterShare}){
  const input=path.join(dir,"qa-input.json"),output=path.join(dir,`qa-review-${attempt}.json`);
  await rm(output,{force:true});
  const semantic=segments.some(segment=>segment.layout||segment.intent);
  await writeFile(input,JSON.stringify({title,script,presenterShare,timelineMode:semantic?"semantic":"alternating",contactSheetSampling:semantic?"Every semantic-beat midpoint is sampled when there are at most 24 beats and labelled with its segment id.":"Three full-frame presenter frames and up to six material frames are intentionally sampled; frame counts do not represent screen-time proportions.",segments:segments.map((segment,i)=>({id:segment.id,parentId:segment.parentId,intent:segment.intent,layout:materials[i].kind==="presenter"?"presenter":segment.layout,text:segment.text,visual:segment.visual,query:segment.query,cardPoints:segment.cardPoints,references:(references[i]||[]).slice(0,2).map(source=>({title:source.title,excerpt:source.excerpt,url:source.url})),material:{kind:materials[i].kind,title:materials[i].title,source:materials[i].source,license:materials[i].license,points:materials[i].points,presentation:materials[i].presentation}}))},null,2));
  const prompt=`You are the final quality director for a Chinese talking-head video. Inspect the attached contact sheet and read qa-input.json. For an alternating timeline, frame counts do not indicate screen-time share and presenterShare is the full-frame presenter fraction. For a semantic timeline, the contact sheet shows every beat when there are at most 24, labelled with its segment id; each segment's layout is authoritative: presenter, presenter-pip, or fullscreen. Flag subtitle safe-margin or picture-in-picture overlap only when visible. Judge actual frame composition, subtitle readability, presenter prominence, visual variety, and whether every visual specifically explains its matching spoken text. In a semantic timeline, fail repeated generic cards, unrelated stock footage, a long run of one layout, or scene/emotion beats that still look like text cards. Check whether evidence beats visibly support the claim and explanation beats make the mechanism easier to understand. Base segment-specific criticism on the labelled frame, not metadata alone. Do not invent financial claims. Return ONLY valid JSON with keys pass (boolean), issues (short Chinese strings), cardFixes (object mapping each abstract/data-heavy or irrelevant-stock segment that needs an original illustrated knowledge card to {style:"brief art direction for a distinct original illustration"}), searchQueries (object mapping only concrete visual scenes worth another licensed-stock search to arrays of up to 3 precise English queries), presenterShare (number 0.3-0.8, used only for alternating timelines), subtitleMaxChars (integer 10-14). Prefer cardFixes for numerical claims and abstract financial concepts; prefer searchQueries for concrete real-world scenes. Give a poor segment either cardFixes or searchQueries, never both. Set pass=true only when ready to deliver. Do not edit files.`;
  const env={...process.env};delete env.HEYGEN_API_KEY;
  await run(process.env.CODEX_CLI_BIN||"codex",["exec","--model",process.env.CODEX_CLI_MODEL||"gpt-5.6-terra","--skip-git-repo-check","--sandbox","workspace-write","-i",contactSheet,"-o",output,prompt],{cwd:dir,env,timeout:240000});
  let result;
  try{result=await readFile(output,"utf8");}catch(error){if(error.code==="ENOENT")throw new VideoStageOutputError("Codex 未写入质检结果");throw error;}
  return parseReview(result);
}
