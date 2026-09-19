import path from 'node:path';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';

const xml=value=>String(value??'').replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[c]));
const chars=value=>Array.from(String(value??''));
const lines=(value,limit)=>{const result=[];for(const glyph of chars(value)){if(!result.length||(result.at(-1).length>=limit&&!/^[，。！？；：、,.!?;:]$/.test(glyph)))result.push('');result[result.length-1]+=glyph;}return result.length?result:[''];};
const text=(value,x,y,size=48,limit=20,lineHeight=size+14,weight=500,color='#173d40')=>lines(value,limit).map((line,i)=>`<text x="${x}" y="${y+i*lineHeight}" fill="${color}" font-size="${size}" font-weight="${weight}">${xml(line)}</text>`).join('');
const small=(value,x,y)=>text(value,x,y,33,24,45,550,'#526c6c');
const divider=(x1,y,x2)=>`<path d="M${x1} ${y}H${x2}" stroke="#b59b68" stroke-width="2" opacity=".78"/>`;

function content(spec){
  if(spec.kind==='explain'){
    const focus=String(spec.focus||''),font=focus.length>42?49:focus.length>25?57:66;
    const wrapLimit=font===49?18:font===57?15:13;
    const focusLines=lines(focus,wrapLimit);
    let y=Math.max(700,465+focusLines.length*(font+13)+55);
    const supports=(spec.supports||[]).slice(0,2).map((point,i)=>{
      const row=`${divider(76,y-52,1004)}<text x="76" y="${y+15}" fill="#b59b68" font-size="45" font-weight="750">0${i+1}</text>${text(point,165,y+10,42,21,56,550)}`;
      y+=Math.max(175,lines(point,21).length*56+58);return row;
    }).join('');
    return `${small('关键要点',76,400)}${text(focus,76,485,font,wrapLimit,font+13,750,'#10685e')}${supports}`;
  }
  if(spec.kind==='numbered')return `${small('先记住这三点',76,400)}${spec.points.slice(0,3).map((point,i)=>{const y=500+i*250;const font=i===0?52:43;return `<text x="76" y="${y+30}" fill="${i===0?'#10685e':'#b59b68'}" font-size="${i===0?74:55}" font-weight="750">0${i+1}</text>${text(point,195,y+15,font,i===0?15:19,font+12,i===0?750:560,i===0?'#10685e':'#173d40')}${divider(195,y+185,1004)}`;}).join('')}`;
  if(spec.kind==='spotlight')return `${small('核心判断',76,400)}${divider(76,435,1004)}${text(spec.focus,76,540,spec.focus.length>36?51:64,spec.focus.length>36?18:15,spec.focus.length>36?64:78,750,'#10685e')}${divider(76,950,1004)}${(spec.supports||[]).slice(0,2).map((point,i)=>`${small(i===0?'为什么':'还要看到',76,1040+i*265)}${text(point,76,1120+i*265,43,21,57,570)}`).join('')}`;
  if(spec.kind==='metrics')return `${small('关键数据',76,395)}${divider(76,435,1004)}${small(spec.metrics[0].label,76,540)}${text(spec.metrics[0].value,76,680,116,8,126,750,'#10685e')}${divider(76,760,1004)}${small(spec.metrics[1].label,76,845)}${text(spec.metrics[1].value,76,970,96,10,108,750,'#10685e')}${spec.note?`${divider(76,1040,1004)}${small(spec.note,76,1130)}`:''}`;
  if(spec.kind==='clarify')return `${small('别急着下结论',76,402)}${text(spec.focus,76,520,76,12,91,750)}${divider(76,675,1004)}${small('还可以这样理解',76,750)}${text(spec.explanation,76,850,55,17,70,600)}${divider(76,1070,1004)}`;
  if(spec.kind==='contrast')return `${small(spec.eyebrow||'把两件事分开看',76,400)}${divider(76,435,1004)}<path d="M540 485V950" stroke="#b59b68" stroke-width="2" opacity=".7"/>${small(spec.leftLabel,76,515)}${text(spec.left,76,625,63,7,78,720,'#10685e')}${small(spec.rightLabel,585,515)}${text(spec.right,585,625,63,7,78,720,'#a57438')}${divider(76,955,1004)}${text(spec.outcome,76,1055,47,19,61,620)}`;
  if(spec.kind==='cashflow')return `${small('两种节奏',76,400)}${small('投资回报、资产价格',76,500)}${small('月供、利息',570,500)}<polyline points="84,700 180,610 285,725 390,625 492,690" fill="none" stroke="#a57438" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/><path d="M585 680H982" fill="none" stroke="#10685e" stroke-width="11" stroke-linecap="round"/>${text('会波动',76,790,58,8,68,700,'#a57438')}${text('固定支出',570,790,58,8,68,700,'#10685e')}${divider(76,875,1004)}${text(spec.outcome,76,1000,52,17,67,700)}`;
  if(spec.kind==='checklist')return `${small('还贷前，先看自己的现金流',76,402)}${divider(76,440,1004)}${spec.questions.map((q,i)=>`<text x="76" y="${565+i*230}" fill="#b59b68" font-size="76" font-weight="750">0${i+1}</text>${text(q,225,555+i*230,53,14,66,650)}${divider(225,610+i*230,1004)}`).join('')}`;
  if(spec.kind==='shift')return `${small('关注点的变化',76,400)}${divider(76,445,1004)}${small('过去',76,535)}${text(spec.before,76,635,70,12,84,750,'#a57438')}<path d="M420 705H660" stroke="#b59b68" stroke-width="7" stroke-linecap="round"/><path d="M650 684L690 705 650 726" fill="none" stroke="#b59b68" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>${small('现在',76,805)}${text(spec.after,76,910,70,12,84,750,'#10685e')}${divider(76,990,1004)}${text(spec.note,76,1080,43,21,57,550)}`;
  throw new Error('Unsupported knowledge-card presentation');
}

export async function createProfessionalKnowledgeCard(segment,spec,backgroundFile,dir,index){
  const width=1080,height=1920;
  const title=segment.visual;
  const header=text(title,76,240,67,13,83,750);
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><linearGradient id="wash" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#fffdf6" stop-opacity=".96"/><stop offset="48%" stop-color="#fffdf6" stop-opacity=".87"/><stop offset="75%" stop-color="#fffdf6" stop-opacity=".10"/><stop offset="100%" stop-color="#fffdf6" stop-opacity="0"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#wash)"/><g font-family="PingFang SC,Arial"><rect x="76" y="126" width="90" height="9" rx="4" fill="#b59b68"/>${header}${content(spec)}</g></svg>`;
  const file=path.join(dir,`professional-card-${index}-${randomUUID()}.jpg`);
  const background=backgroundFile?sharp(backgroundFile).resize(width,height,{fit:'cover'}):sharp({create:{width,height,channels:3,background:'#e9f0ec'}});
  await background.composite([{input:Buffer.from(svg)}]).jpeg({quality:94}).toFile(file);
  return {kind:'image',file,source:backgroundFile?'xiaogu-ai-knowledge-card':'xiaogu-knowledge-card',license:backgroundFile?'generated':'project-owned',title,query:segment.query,points:segment.cardPoints||[]};
}
