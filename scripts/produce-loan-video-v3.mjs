import path from "node:path";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import sharp from "sharp";
import {finalize} from "./spoken-video-production.mjs";

const root=path.resolve("storage/digital-human-revisions/24f9d64b-eed3-44a5-8391-66fe70a30887");
const source=JSON.parse(await readFile(path.join(root,"smooth-timed-transitions-20260919/result.json"),"utf8"));
const dir=path.join(root,"source-grounded-v3-20260919");
await mkdir(dir,{recursive:true});
const W=1080,H=1920;
const esc=s=>String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
const tx=(x,y,value,size=48,color="#17363d",weight=600,other="")=>`<text x="${x}" y="${y}" fill="${color}" font-size="${size}" font-weight="${weight}" ${other}>${esc(value)}</text>`;
const rect=(x,y,w,h,fill,rx=24,other="")=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" ${other}/>`;
const line=(x1,y1,x2,y2,color="#a8c9c5",width=3,dash="")=>`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${width}" ${dash?`stroke-dasharray="${dash}"`:""}/>`;
const circle=(x,y,r,fill)=>`<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`;
const panel=(content)=>`${rect(58,338,964,1090,"#ffffff",36,'opacity=".86"')}${content}`;
const base=(number,title,content,footer="")=>`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f2f6f1"/><stop offset=".55" stop-color="#e8f0eb"/><stop offset="1" stop-color="#e1ebe6"/></linearGradient><linearGradient id="accent" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#0c625f"/><stop offset="1" stop-color="#268b7c"/></linearGradient><filter id="shadow"><feDropShadow dx="0" dy="14" stdDeviation="24" flood-color="#1e4e49" flood-opacity=".12"/></filter></defs>${rect(0,0,W,H,"url(#bg)",0)}${circle(940,130,270,"#d2e6de")}${circle(40,1650,310,"#d3e4e0")}${rect(58,92,196,7,"#bf9b59",3)}${tx(58,151,`${String(number).padStart(2,"0")}/06`,31,"#537978",600)}${tx(58,258,title,64,"#15383a",750)}<g font-family="PingFang SC, Microsoft YaHei, sans-serif">${content}${footer?tx(74,1510,footer,26,"#617a77",500):""}</g>${line(58,1638,1022,1638,"#afc8c2",2)}${tx(58,1692,"把贷款决策，放回家庭现金流里看",30,"#58706d",500)}</svg>`;

const cards=[
  base(1,"新增贷款少，钱去哪了？",panel(`${tx(94,428,"三个数字，讲的是不同的事",38,"#54736d",600)}${rect(94,484,430,250,"#e0f0eb",26)}${tx(120,550,"8月新增贷款",32,"#426b68")}${tx(120,655,"600亿元",80,"#0b7068",750)}${rect(548,484,438,250,"#e9e6dc",26)}${tx(574,550,"前8个月住户贷款",32,"#666c59")}${tx(574,655,"减少1.03万亿",62,"#876c32",750)}${line(94,802,986,802,"#a8c8c1",3)}${tx(94,882,"与此同时",36,"#54736d")}${tx(94,979,"M2 仍在增长",68,"#173b3d",750)}${rect(94,1044,892,258,"#153f41",28)}${tx(126,1117,"看懂重点",34,"#b7d9d0",600)}${tx(126,1207,"钱没有消失，家庭在收缩负债",48,"#ffffff",700)}`),"资料线索见作品页 · 数据口径需结合报告核对"),
  base(2,"不是没钱，是少背固定债",panel(`${tx(94,435,"“居民没钱了”只能解释一部分",43,"#3f6964",650)}${rect(94,511,892,288,"#e1eeea",30)}${circle(180,623,52,"#2d8679")}${tx(151,639,"收",39,"#ffffff",700)}${tx(270,598,"收入与储蓄",48,"#194745",700)}${tx(270,671,"仍要留出周转空间",37,"#567571")}${line(540,816,540,910,"#2d8679",8)}${circle(540,920,16,"#2d8679")}${rect(94,953,892,332,"#153f41",30)}${circle(180,1060,52,"#c7a364")}${tx(151,1076,"债",39,"#ffffff",700)}${tx(270,1037,"固定负债",48,"#ffffff",700)}${tx(270,1112,"会锁住未来多年的收入",38,"#cee2dc")}${tx(270,1193,"减少负债，是保留选择权",38,"#e6c98d",650)}`)),
  base(3,"房子有价值，不代表必涨",panel(`${tx(94,435,"把房子的价值拆开看",42,"#4d716b",600)}${rect(94,498,892,257,"#e0efe9",28)}${tx(129,562,"仍然存在",32,"#577b72")}${tx(129,648,"居住价值 · 地段价值",52,"#155c56",750)}${rect(94,793,892,257,"#f3ece0",28)}${tx(129,857,"不再确定",32,"#927b52")}${tx(129,943,"买了就能涨",58,"#8c6938",750)}${line(118,1150,962,1150,"#b0c9c1",3)}${tx(129,1227,"决策提醒",31,"#4c746b")}${tx(129,1310,"不要用未来涨价覆盖今天的债",42,"#173b3d",700)}`)),
  base(4,"回报会波动，月供按月到",panel(`${tx(94,427,"两条曲线，风险不一样",40,"#4e716a",600)}${rect(94,486,892,495,"#e6f1ed",28)}${tx(130,554,"投资回报 / 资产价格",34,"#1c7168")}${line(148,849,930,849,"#a6c7bc",3)}${line(148,640,148,849,"#a6c7bc",3)}<path d="M 166 749 C 250 585 324 855 410 713 S 585 647 654 793 S 828 583 911 667" fill="none" stroke="#13877c" stroke-width="11" stroke-linecap="round"/>${tx(139,1038,"月供和利息",34,"#916f38")}${rect(139,1073,805,80,"#c9a768",16)}${tx(180,1129,"每个月都要支付",43,"#ffffff",700)}${rect(94,1210,892,143,"#153f41",24)}${tx(124,1296,"收入一波动，固定支出就变成压力",39,"#ffffff",650)}`)),
  base(5,"提前还贷前，问三件事",panel(`${tx(94,428,"先做一次家庭现金流压力测试",39,"#4f756e",600)}${[0,1,2].map((i)=>{const y=498+i*273;const values=[["01","如果收入停几个月", "月供扛不扛得住？"],["02","家里有没有", "足够现金？"],["03","做完决定之后", "还剩多少选择权？"]][i];return `${rect(94,y,892,229,i===1?"#e7ede2":"#dceee8",28)}${circle(170,y+77,48,i===1?"#b99b5b":"#217a71")}${tx(133,y+92,values[0],34,"#ffffff",700)}${tx(255,y+83,values[1],38,"#57756e",600)}${tx(255,y+158,values[2],52,"#183f40",750)}`}).join("")}${rect(94,1340,892,6,"#ba985b",3)}`)),
  base(6,"财务重心，正在转向",panel(`${tx(94,426,"从追求资产扩张，到守住现金流",42,"#466c65",650)}${rect(94,520,892,300,"#edf0e8",30)}${tx(137,591,"过去更看重",32,"#768676")}${tx(137,689,"扩大资产 · 押注上涨",54,"#637d72",700)}${line(540,843,540,960,"#1a7d73",10)}${circle(540,969,17,"#1a7d73")}${rect(94,1005,892,300,"#153f41",30)}${tx(137,1076,"现在更看重",32,"#b5d5cd")}${tx(137,1174,"现金流 · 降低确定性压力",50,"#ffffff",750)}${tx(137,1251,"有余钱，也要先留住选择权",34,"#e6c98d",600)}`)),
];

const visuals=["新增贷款少，钱去哪了？","不是没钱，是少背固定债","房子有价值，不代表必涨","回报会波动，月供按月到","提前还贷前，问三件事","财务重心，正在转向"];
const materials=[];
for(let i=0;i<cards.length;i++){
  const file=path.join(dir,`infographic-${i+1}.jpg`);
  await sharp(Buffer.from(cards[i])).jpeg({quality:94}).toFile(file);
  materials.push({kind:"image",file,title:visuals[i],source:"xiaogu-original-infographic",license:"project-owned",points:source.segments[i].cardPoints});
}
const segments=source.segments.map((s,i)=>({...s,visual:visuals[i]}));
const result=await finalize(source.master,segments,materials,"",segments.map(s=>s.text).join(""),dir,"这笔贷款，要不要先还掉？","9:16",{subtitleFile:source.subtitleFile,presenterShare:.54,transitionSeconds:.26,snapCutsToCaptions:true,subtitleMaxChars:12,subtitleFontSize:13,titleDuration:3.2});
await writeFile(path.join(dir,"result.json"),JSON.stringify({...result,master:source.master,segments,materials,options:{presenterShare:.54,transitionSeconds:.26,snapCutsToCaptions:true,subtitleMaxChars:12,subtitleFontSize:13,titleDuration:3.2}},null,2));
console.log(JSON.stringify({dir,output:result.output,cover:result.cover,durationSeconds:result.durationSeconds}));
