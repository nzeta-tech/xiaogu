import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile } from "node:fs/promises";
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
  const width=420,height=746,header=32;
  const layers=[];
  for(const [index,time] of times.entries()){
    const file=path.join(dir,`qa-frame-${index}.jpg`);
    await run("ffmpeg",["-v","error","-y","-ss",time.toFixed(2),"-i",video,"-frames:v","1",file],{timeout:30000});
    const thumbnail=await sharp(file).resize(width,height,{fit:"contain",background:"#18221b"}).jpeg({quality:85}).toBuffer();
    const left=index%3*width,top=Math.floor(index/3)*(height+header);
    layers.push({input:thumbnail,left,top:top+header});
    layers.push({input:Buffer.from(`<svg width="${width}" height="${header}"><rect width="100%" height="100%" fill="#173d2b"/><text x="10" y="19" fill="white" font-family="Arial" font-size="15">${time.toFixed(1)}s</text></svg>`),left,top});
  }
  const rows=Math.ceil(times.length/3),file=path.join(dir,"qa-contact.jpg");
  await sharp({create:{width:width*3,height:rows*(height+header),channels:3,background:"#152119"}}).composite(layers).jpeg({quality:88}).toFile(file);
  return file;
}

function parseReview(text){
  const clean=text.trim().replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,"");
  const parsed=JSON.parse(clean);
  if(typeof parsed.pass!=="boolean"||!Array.isArray(parsed.issues))throw new Error("Codex 质检报告格式无效");
  return {pass:parsed.pass,issues:parsed.issues.map(String).slice(0,8),searchQueries:parsed.searchQueries&&typeof parsed.searchQueries==="object"?parsed.searchQueries:{},cardFixes:parsed.cardFixes&&typeof parsed.cardFixes==="object"?parsed.cardFixes:{},presenterShare:Number(parsed.presenterShare),subtitleMaxChars:Number(parsed.subtitleMaxChars)};
}

export async function codexReview({dir,contactSheet,title,script,segments,materials,references=[],attempt,presenterShare}){
  const input=path.join(dir,"qa-input.json"),output=path.join(dir,`qa-review-${attempt}.json`);
  await writeFile(input,JSON.stringify({title,script,presenterShare,contactSheetSampling:"Three full-frame presenter frames and up to six material frames are intentionally sampled; frame counts do not represent screen-time proportions.",segments:segments.map((segment,i)=>({id:segment.id,text:segment.text,visual:segment.visual,query:segment.query,cardPoints:segment.cardPoints,references:(references[i]||[]).slice(0,2).map(source=>({title:source.title,excerpt:source.excerpt,url:source.url})),material:{kind:materials[i].kind,title:materials[i].title,source:materials[i].source,license:materials[i].license,points:materials[i].points}}))},null,2));
  const prompt=`You are the final quality director for a Chinese talking-head video. Inspect the attached contact sheet and read qa-input.json. The sheet deliberately includes presenter and material frames; its frame counts do not indicate screen-time share. Use qa-input.json presenterShare for the actual fraction of each segment spent on the full-frame presenter, and do not call presenter time too low when that fraction is already at least 0.6. Flag subtitle safe-margin or picture-in-picture overlap only when visible in a sampled frame; do not infer it from card layout alone. Judge actual frame composition, subtitle readability, presenter prominence, visual variety, and whether every visual specifically explains its matching spoken segment. Check whether titles and exact knowledge points have a clear explanatory relationship and are readable on a phone; tiny data charts, repeated generic cards, and irrelevant stock footage fail. Do not invent financial claims. Return ONLY valid JSON with keys pass (boolean), issues (short Chinese strings), cardFixes (object mapping each abstract/data-heavy or irrelevant-stock segment that needs an original illustrated knowledge card to {style:"brief art direction for a distinct original illustration"}), searchQueries (object mapping only concrete visual scenes worth another licensed-stock search to arrays of up to 3 precise English queries), presenterShare (number 0.3-0.8; fraction of each segment's time showing the full-frame presenter before the knowledge visual), subtitleMaxChars (integer 10-14). Prefer cardFixes over another stock search for numerical claims and abstract financial concepts. Give a poor segment either cardFixes or searchQueries, never both. Recommend only changes that address observed problems. Set pass=true only when ready to deliver. Do not edit files.`;
  const env={...process.env};delete env.HEYGEN_API_KEY;
  await run(process.env.CODEX_CLI_BIN||"codex",["exec","--model",process.env.CODEX_CLI_MODEL||"gpt-5.6-terra","--skip-git-repo-check","--sandbox","workspace-write","-i",contactSheet,"-o",output,prompt],{cwd:dir,env,timeout:240000});
  return parseReview(await readFile(output,"utf8"));
}
