import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { videoSafeLayout } from "./spoken-video-layout.mjs";

export const expressionPlanningRules = 'For every segment and every beat always add expression:{kind,nodes,evidence}. kind is compare|sequence|timeline|cause|parts|keypoints|presenter, independent of industry. For presenter use nodes:[] and evidence:"". For every other kind, nodes are 2-4 nonempty strings that partition the ENTIRE exact segment/beat text in original order, including all conditions, negations, numbers and punctuation; their concatenation must equal text. evidence is a verbatim span establishing the chosen relationship. Use compare only for an explicit comparison, sequence/timeline only for explicit ordering, cause only for stated causation, parts only for stated composition. When the relationship is uncertain use keypoints; use presenter for scene, emotion, transitions, or content that does not benefit from a card. Never invent a diagram, rate, date, quantity, arrow or calculation. Prefer meaningful complete clauses over splitting numbers or qualifications.';
const kinds=new Set(["compare","sequence","timeline","cause","parts","keypoints","presenter"]);
const xml=value=>String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[c]));

export function expressionSpec(segment){
  const source=typeof segment.text==="string"?segment.text.trim():"";
  const e=segment.expression;
  if(e&&kinds.has(e.kind)&&e.kind!=="presenter"&&Array.isArray(e.nodes)&&e.nodes.length>=2&&e.nodes.length<=4&&e.nodes.every(n=>typeof n==="string"&&n.trim())&&e.nodes.join("")===source&&(e.kind==="keypoints"||typeof e.evidence==="string"&&e.evidence.trim()&&source.includes(e.evidence))){
    return {kind:e.kind,nodes:e.nodes,evidence:e.evidence||"",grounding:"verbatim-partition"};
  }
  if(!source||e?.kind==="presenter")return {kind:"presenter",nodes:[],grounding:"master"};
  // A complete quotation is safer than selecting excerpts that can lose conditions.
  const clauses=source.match(/[^。！？!?；;]+[。！？!?；;]?/gu)||[source];
  return {kind:"keypoints",nodes:clauses.length<=4?clauses:[source],grounding:"verbatim-fallback"};
}

function linesFor(text,width,font){
  const tokens=text.match(/[A-Za-z0-9]+(?:[.,%/:+\-][A-Za-z0-9]+)*|\s+|./gu)||[];
  const measure=t=>Array.from(t).reduce((sum,c)=>sum+(/[\x00-\x7f]/.test(c)?.64:1),0)*font;
  const lines=[];let line="";
  for(const token of tokens){
    if(measure(token)>width)return null;
    if(line&&measure(line+token)>width){lines.push(line);line="";}
    line+=token;
  }
  if(line)lines.push(line);
  return lines;
}

export function expressionLayout(segment,options={}){
  const wide=options.aspectRatio==="16:9",width=wide?1920:1080,height=wide?1080:1920;
  const spec=expressionSpec(segment);
  if(spec.kind==="presenter")return {spec,width,height,cells:[]};
  const safeLayout=videoSafeLayout(width,height,options.subtitleFontSize||(wide?18:12));
  const pipSafe=!wide&&spec.nodes.length>=1&&spec.nodes.length<=2&&spec.nodes.reduce((sum,node)=>sum+Array.from(node).length,0)<=120;
  const margin=wide?100:72,top=Math.round(height*.23);
  const bottom=pipSafe?safeLayout.pip.y-56:safeLayout.subtitleTop-56;
  const columns=wide?Math.min(spec.nodes.length,3):spec.kind==="compare"||spec.kind==="parts"?2:1,rows=Math.ceil(spec.nodes.length/columns),gap=wide?36:44;
  const cellWidth=(width-margin*2-gap*(columns-1))/columns,cellHeight=(bottom-top-gap*(rows-1))/rows;
  const padding=pipSafe?32:28,initialFont=wide?38:pipSafe?40:44;
  let font,lineHeight,cells;
  for(const candidate of [initialFont,initialFont-4,initialFont-8,32]){
    font=candidate;lineHeight=Math.ceil(font*1.45);
    cells=spec.nodes.map((text,i)=>({text,x:margin+(i%columns)*(cellWidth+gap),y:top+Math.floor(i/columns)*(cellHeight+gap),width:cellWidth,height:cellHeight,lines:linesFor(text,cellWidth-padding*2,font)}));
    if(cells.every(c=>c.lines&&112+font+Math.max(0,c.lines.length-1)*lineHeight+padding<=c.height))break;
    cells=null;
  }
  if(!cells)return {spec:{kind:"presenter",nodes:[],grounding:"overflow-fallback"},width,height,cells:[]};
  return {spec,width,height,cells,font,lineHeight,padding,bottom,pipSafe};
}

export async function createExpressionMaterial(segment,dir,index,options={}){
  const layout=expressionLayout(segment,options),{spec,width,height,cells,font,lineHeight,padding,pipSafe}=layout;
  if(spec.kind==="presenter")return {kind:"presenter",source:"xiaogu-presenter-anchor",title:segment.visual||"",query:segment.query||"",presentation:spec.grounding};
  const colors=["#138278","#c2604e","#416ca6","#b28a3f"],fills=["#f2faf7","#fff5f0","#f2f6fc","#fbf7eb"];
  const relationLabels={compare:["对照 A","对照 B"],sequence:["步骤 1","步骤 2","步骤 3","步骤 4"],timeline:["节点 1","节点 2","节点 3","节点 4"],cause:["原因","结果","延伸","结论"],parts:["组成 1","组成 2","组成 3","组成 4"],keypoints:["要点 1","要点 2","要点 3","要点 4"]};
  const labels=relationLabels[spec.kind]||relationLabels.keypoints;
  const blocks=cells.map((c,i)=>`<g filter="url(#shadow)"><rect x="${c.x}" y="${c.y}" width="${c.width}" height="${c.height}" rx="22" fill="${fills[i%4]}" stroke="${colors[i%4]}" stroke-width="2"/><rect x="${c.x}" y="${c.y}" width="${c.width}" height="12" rx="6" fill="${colors[i%4]}"/></g><rect x="${c.x+padding}" y="${c.y+30}" width="${Math.max(116,labels[i].length*29)}" height="48" rx="24" fill="${colors[i%4]}"/><text x="${c.x+padding+18}" y="${c.y+64}" font-size="25" font-weight="700" fill="#fff">${labels[i]}</text>${c.lines.map((line,j)=>`<text x="${c.x+padding}" y="${c.y+112+font+j*lineHeight}" font-size="${font}" font-weight="600" fill="#172f38">${xml(line)}</text>`).join("")}`).join("");
  const linked=["sequence","timeline","cause"].includes(spec.kind);
  const connectors=linked?cells.slice(0,-1).map((c,i)=>{const next=cells[i+1];if(next.y===c.y){const x=c.x+c.width+8,y=c.y+c.height/2,end=next.x-8;return `<path d="M${x} ${y}H${end-14}m-10-9 10 9-10 9" fill="none" stroke="#138278" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`;}const x=c.x+c.width/2,y=c.y+c.height+8,end=Math.max(y+20,next.y-8);return `<path d="M${x} ${y}V${end-12}m-9-10 9 10 9-10" fill="none" stroke="#138278" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`;}).join(""):spec.kind==="compare"?`<circle cx="${width/2}" cy="${cells[0].y+cells[0].height/2}" r="42" fill="#122f39"/><text x="${width/2}" y="${cells[0].y+cells[0].height/2+11}" text-anchor="middle" font-size="28" font-weight="800" fill="#fff">VS</text>`:"";
  const title=xml(segment.visual||({compare:"关键对比",sequence:"执行路径",timeline:"时间轴",cause:"因果关系",parts:"结构拆解",keypoints:"核心要点"}[spec.kind]||"核心要点"));
  const eyebrow={compare:"关系图解 · COMPARE",sequence:"路径图解 · SEQUENCE",timeline:"进程图解 · TIMELINE",cause:"机制图解 · CAUSE",parts:"结构图解 · PARTS",keypoints:"信息图解 · KEY POINTS"}[spec.kind];
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><filter id="shadow" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="0" dy="12" stdDeviation="14" flood-color="#17313a" flood-opacity=".12"/></filter></defs><rect width="100%" height="100%" fill="#e9eff0"/><rect width="100%" height="350" fill="#112f39"/><rect x="72" y="92" width="92" height="8" rx="4" fill="#d6ad63"/><text x="72" y="154" font-family="PingFang SC,Arial" font-size="25" font-weight="650" fill="#9ed6cc">${eyebrow}</text><text x="72" y="254" font-family="PingFang SC,Arial" font-size="64" font-weight="800" fill="#fffaf0">${title}</text><g font-family="PingFang SC,Arial">${blocks}${connectors}</g></svg>`;
  const file=path.join(dir,`expression-${index}-${randomUUID()}.jpg`);
  await sharp(Buffer.from(svg)).jpeg({quality:94}).toFile(file);
  return {kind:"image",file,source:"xiaogu-knowledge-card-expression",license:"project-owned",title:segment.visual||"",query:segment.query||"",points:spec.nodes,presentation:`expression-v2:${spec.kind}:${spec.grounding}:${pipSafe?"pip-safe":"fullscreen"}`};
}
