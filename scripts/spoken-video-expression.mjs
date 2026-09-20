import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { videoSafeLayout } from "./spoken-video-layout.mjs";

export const expressionPlanningRules = 'For every segment and every beat optionally add expression:{kind,nodes,evidence}. kind is compare|sequence|timeline|cause|parts|keypoints|presenter, independent of industry. nodes are 2-4 nonempty strings that partition the ENTIRE exact segment/beat text in original order, including all conditions, negations, numbers and punctuation; their concatenation must equal text. evidence is a verbatim span establishing the chosen relationship. Use compare only for an explicit comparison, sequence/timeline only for explicit ordering, cause only for stated causation, parts only for stated composition. When the relationship is uncertain use keypoints or presenter, never invent a diagram, rate, date, quantity, arrow or calculation. Prefer meaningful complete clauses over splitting numbers or qualifications. No need to force a diagram for scene/emotion/anchor beats.';
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
  const margin=wide?100:72,top=Math.round(height*.23);
  const bottom=videoSafeLayout(width,height,options.subtitleFontSize||(wide?18:12)).subtitleTop-56;
  const columns=spec.kind==="compare"||spec.kind==="parts"?2:1,rows=Math.ceil(spec.nodes.length/columns),gap=wide?36:44;
  const cellWidth=(width-margin*2-gap*(columns-1))/columns,cellHeight=(bottom-top-gap*(rows-1))/rows;
  const font=wide?38:44,lineHeight=Math.ceil(font*1.45),padding=28;
  const cells=spec.nodes.map((text,i)=>({text,x:margin+(i%columns)*(cellWidth+gap),y:top+Math.floor(i/columns)*(cellHeight+gap),width:cellWidth,height:cellHeight,lines:linesFor(text,cellWidth-padding*2,font)}));
  if(cells.some(c=>!c.lines||c.lines.length*lineHeight+padding*2>c.height))return {spec:{kind:"presenter",nodes:[],grounding:"overflow-fallback"},width,height,cells:[]};
  return {spec,width,height,cells,font,lineHeight,padding,bottom};
}

export async function createExpressionMaterial(segment,dir,index,options={}){
  const layout=expressionLayout(segment,options),{spec,width,height,cells,font,lineHeight,padding}=layout;
  if(spec.kind==="presenter")return {kind:"presenter",source:"xiaogu-presenter-anchor",title:segment.visual||"",query:segment.query||"",presentation:spec.grounding};
  const colors=["#176b66","#aa3653","#3f5f99","#76602e"];
  const blocks=cells.map((c,i)=>`<rect x="${c.x}" y="${c.y}" width="${c.width}" height="${c.height}" rx="6" fill="#fff"/><rect x="${c.x}" y="${c.y}" width="7" height="${c.height}" fill="${colors[i%4]}"/>${c.lines.map((line,j)=>`<text x="${c.x+padding}" y="${c.y+padding+font+j*lineHeight}" font-size="${font}" fill="#172a30">${xml(line)}</text>`).join("")}`).join("");
  const linked=["sequence","timeline","cause"].includes(spec.kind);
  const connectors=linked?cells.slice(0,-1).map(c=>{const x=c.x+c.width/2,y=c.y+c.height+6;return `<path d="M${x} ${y}v22m-7-7 7 7 7-7" fill="none" stroke="#176b66" stroke-width="3"/>`;}).join(""):"";
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#eaf0f2"/><g font-family="PingFang SC,Arial">${blocks}${connectors}</g></svg>`;
  const file=path.join(dir,`expression-${index}-${randomUUID()}.jpg`);
  await sharp(Buffer.from(svg)).jpeg({quality:94}).toFile(file);
  return {kind:"image",file,source:"xiaogu-knowledge-card-expression",license:"project-owned",title:segment.visual||"",query:segment.query||"",points:spec.nodes,presentation:`expression-v1:${spec.kind}:${spec.grounding}`};
}
