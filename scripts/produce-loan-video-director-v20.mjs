import path from "node:path";
import {copyFile,mkdir,readFile,writeFile} from "node:fs/promises";
import sharp from "sharp";
import {finalize} from "./spoken-video-production.mjs";
import {createReviewSheet} from "./spoken-video-quality.mjs";

const sourceDir=path.resolve("storage/digital-human-revisions/9de07a27-5503-4db0-8ead-5f07259d6c60/workdir-snapshot");
const dir=path.join(sourceDir,"director-optimized-v20-20260921");
await mkdir(dir,{recursive:true});
const plan=JSON.parse(await readFile(path.join(sourceDir,"director-plan.json"),"utf8"));
const master=path.join(sourceDir,"presenter-master.mp4");
const subtitleFile=path.join(sourceDir,"original.srt");
const generatedSource="/Users/a2251/.codex/generated_images/01a0bc5c-6385-7551-99f3-cc4330d8001d/exec-4bcbb0d8-e9a8-4349-b1fb-b46f78dc3648.png";
const sceneFile=path.join(dir,"cashflow-pressure-scene.png");
await copyFile(generatedSource,sceneFile);

const W=1080,H=1920;
const esc=value=>String(value??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
const text=(x,y,value,size=46,color="#163c3b",weight=620,anchor="start")=>`<text x="${x}" y="${y}" text-anchor="${anchor}" fill="${color}" font-size="${size}" font-weight="${weight}">${esc(value)}</text>`;
const rect=(x,y,w,h,fill,rx=28,extra="")=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" ${extra}/>`;
const line=(x1,y1,x2,y2,color="#b99759",width=8,dash="")=>`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${width}" stroke-linecap="round" ${dash?`stroke-dasharray="${dash}"`:""}/>`;
const arrow=(x1,y1,x2,y2,color="#b99759",width=10)=>`${line(x1,y1,x2,y2,color,width)}<path d="M${x2-34} ${y2-26}L${x2} ${y2}L${x2-34} ${y2+26}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
const wrap=(value,x,y,size,max=16,lineHeight=size+16,color="#163c3b",weight=650)=>Array.from(String(value)).reduce((rows,char)=>{const last=rows.at(-1);if(!last||Array.from(last).length>=max)rows.push(char);else rows[rows.length-1]+=char;return rows;},[]).map((row,index)=>text(x,y+index*lineHeight,row,size,color,weight)).join("");
const shell=(eyebrow,title,body,{source="",note=""}={})=>`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fbfaf4"/><stop offset="1" stop-color="#e7f0eb"/></linearGradient><filter id="shadow"><feDropShadow dx="0" dy="14" stdDeviation="20" flood-color="#123c39" flood-opacity=".11"/></filter></defs><rect width="100%" height="100%" fill="url(#bg)"/><circle cx="990" cy="80" r="270" fill="#dcebe4"/><circle cx="10" cy="1600" r="330" fill="#e4ece8"/><g font-family="PingFang SC,Microsoft YaHei,Arial"><rect x="64" y="90" width="112" height="8" rx="4" fill="#b99759"/>${text(64,156,eyebrow,27,"#6d827d",640)}${wrap(title,64,250,66,13,80,"#153b3a",760)}${body}${source?`${line(64,1494,1016,1494,"#adc0b8",2)}${text(64,1546,source,25,"#617670",520)}`:""}${note?text(64,1602,note,25,"#7a6b51",540):""}<rect x="64" y="1660" width="952" height="2" fill="#c5d2cd"/></g></svg>`;

const cards={
  "s1-b3":shell("官方数据｜2026年8月","钱还在，贷款投放明显变少",`${rect(64,465,952,285,"#dcece6")}${text(110,545,"当月人民币贷款",31,"#607973",600)}${text(110,665,"600亿元",92,"#0d746a",780)}${line(585,610,820,610,"#0d746a",24)}${text(855,628,"低位",38,"#0d746a",740)}${rect(64,790,952,285,"#f2eadb")}${text(110,870,"广义货币 M2",31,"#796b51",600)}${text(110,980,"仍在增长",67,"#9a6d32",760)}${arrow(720,1000,720,860,"#b48749",18)}${rect(64,1140,952,185,"#153e3d")}${text(540,1255,"货币总量与贷款投放出现背离",44,"#ffffff",730,"middle")}`,{source:"来源：中国人民银行《2026年8月金融统计数据报告》",note:"数据用于解释趋势，不直接构成个人还贷建议"}),
  "s1-b4":shell("家庭资产负债表","钱没有消失，负债在收缩",`${rect(64,500,360,330,"#dcece6")}${text(244,600,"手中资金",41,"#0d746a",720,"middle")}${text(244,705,"仍在家庭账户",35,"#466d68",600,"middle")}${arrow(460,665,650,665,"#b99759",14)}${rect(690,500,326,330,"#e9efe9")}${text(853,600,"住户贷款",41,"#466d68",720,"middle")}${text(853,715,"↓",100,"#0d746a",800,"middle")}${rect(64,900,952,220,"#153e3d")}${text(540,990,"前8个月",32,"#bbd9d1",600,"middle")}${text(540,1080,"住户贷款减少 1.03万亿元",54,"#ffffff",760,"middle")}${text(64,1245,"减少借贷，不等于资金凭空消失",42,"#153e3d",680)}`,{source:"来源：中国人民银行金融统计口径｜2026年1—8月"}),
  "s2-b4":shell("长期承诺","今天借的钱，会锁定未来收入",`${rect(64,500,952,160,"#dcece6")}${text(105,602,"现在的余钱",44,"#0d746a",730)}${arrow(500,580,850,580,"#b99759",14)}${text(940,602,"今天",35,"#796b51",620,"middle")}${[0,1,2,3,4].map((i)=>`${rect(64+i*190,750,160,240,i<1?"#dcece6":"#f2eadb",22)}${text(144+i*190,835,`第${i+1}年`,28,i<1?"#0d746a":"#8e6c39",620,"middle")}${rect(95+i*190,900,98,28,i<1?"#0d746a":"#b99759",14)}${text(144+i*190,1010,"固定月供",27,"#3f5e5a",600,"middle")}`).join("")}${rect(64,1135,952,175,"#153e3d")}${text(540,1245,"债务的代价，是未来现金流的刚性",43,"#ffffff",730,"middle")}`),
  "s3-b2":shell("同一笔债｜两种环境","资产上涨，不再稳定覆盖负债",`${rect(64,475,440,600,"#dcece6")}${text(284,555,"过去",33,"#607973",650,"middle")}${rect(135,880,298,70,"#153e3d",18)}${text(284,929,"固定债务",31,"#ffffff",700,"middle")}<path d="M145 825L260 720L400 570" fill="none" stroke="#0d746a" stroke-width="18" stroke-linecap="round"/><path d="M360 580H405V625" fill="none" stroke="#0d746a" stroke-width="16"/>${text(284,1020,"上涨可能覆盖负债",32,"#0d746a",700,"middle")}${rect(576,475,440,600,"#f2eadb")}${text(796,555,"现在",33,"#796b51",650,"middle")}${rect(647,880,298,70,"#153e3d",18)}${text(796,929,"债务仍固定",31,"#ffffff",700,"middle")}<polyline points="640,750 705,655 775,790 855,660 945,760" fill="none" stroke="#b07b39" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>${text(796,1020,"资产价格波动",32,"#9a6d32",700,"middle")}${rect(64,1150,952,170,"#153e3d")}${text(540,1258,"底层逻辑已经变了",49,"#ffffff",760,"middle")}`),
  "s3-b4":shell("国家统计局｜2026年8月","房子有价值，不代表“买了就涨”",`${rect(64,470,952,235,"#ffffff",26,'filter="url(#shadow)"')}${text(105,545,"官方原文要点",27,"#6d827d",620)}${wrap("一二三线城市新建商品住宅销售价格同比仍下降",105,620,38,21,51,"#153b3a",690)}${rect(64,770,290,255,"#dcece6")}${text(209,845,"一线",29,"#607973",620,"middle")}${text(209,950,"-0.9%",68,"#0d746a",780,"middle")}${rect(395,770,290,255,"#e8eee8")}${text(540,845,"二线",29,"#607973",620,"middle")}${text(540,950,"-2.7%",68,"#4b6e68",780,"middle")}${rect(726,770,290,255,"#f2eadb")}${text(871,845,"三线",29,"#796b51",620,"middle")}${text(871,950,"-4.1%",68,"#9a6d32",780,"middle")}${text(64,1160,"居住价值、地段价值仍在",40,"#0d746a",700)}${text(64,1230,"上涨确定性需要重新评估",40,"#9a6d32",700)}`,{source:"来源：国家统计局《2026年8月份70个大中城市商品住宅销售价格变动情况》"}),
  "s4-b4":shell("安全感的旧定义","过去：有房、有资产",`<path d="M100 830L300 630L500 830V1080H100Z" fill="#dcece6" stroke="#0d746a" stroke-width="10"/><rect x="245" y="900" width="110" height="180" fill="#ffffff"/>${text(300,1180,"房屋",37,"#0d746a",720,"middle")}${rect(660,635,270,320,"#f2eadb")}${text(795,760,"＋",105,"#b08748",700,"middle")}${text(795,1020,"其他资产",37,"#9a6d32",720,"middle")}${arrow(520,1190,780,1320,"#b99759",12)}<path d="M815 1220L945 1270V1400Q880 1480 815 1400Z" fill="#153e3d"/>${text(880,1365,"安全感",31,"#ffffff",700,"middle")}`),
  "s5-b1":shell("现金流压力测试","如果收入暂停，月供能扛多久？",`${rect(64,480,952,170,"#dcece6")}${text(105,585,"收入",36,"#607973",620)}${[0,1,2,3,4,5].map((i)=>rect(270+i*110,535,78,58,i<2?"#0d746a":"#cad7d2",12)).join("")}${rect(64,720,952,170,"#f2eadb")}${text(105,825,"月供",36,"#796b51",620)}${[0,1,2,3,4,5].map((i)=>rect(270+i*110,775,78,58,"#b48749",12)).join("")}${line(489,450,489,980,"#b55f52",7,"16 16")}${text(489,1040,"收入暂停",31,"#9c5148",700,"middle")}${rect(64,1130,952,180,"#153e3d")}${text(540,1240,"先看现金储备能覆盖几个月",44,"#ffffff",730,"middle")}`),
  "s5-b2":shell("做决定前｜两道问题","现金和选择权，缺一不可",`${rect(64,500,440,500,"#dcece6")}${text(284,610,"01",72,"#0d746a",780,"middle")}${wrap("家里有没有足够现金？",130,745,44,8,61,"#153b3a",720)}${rect(576,500,440,500,"#f2eadb")}${text(796,610,"02",72,"#9a6d32",780,"middle")}${wrap("决定之后还有没有选择权？",640,745,44,8,61,"#153b3a",720)}${rect(64,1110,952,190,"#153e3d")}${text(540,1225,"安全感 = 缓冲空间 + 可调整空间",43,"#ffffff",730,"middle")}`),
  "s5-b4":shell("家庭资产负债表","财务重心正在转向",`${rect(64,505,390,350,"#f2eadb")}${text(259,600,"过去",31,"#796b51",620,"middle")}${text(259,735,"扩大资产",58,"#9a6d32",760,"middle")}${arrow(490,680,650,680,"#b99759",13)}${rect(690,505,326,350,"#dcece6")}${text(853,600,"现在",31,"#607973",620,"middle")}${wrap("守住现金流",745,715,53,5,67,"#0d746a",760)}${rect(64,960,952,195,"#153e3d")}${text(540,1080,"先降低固定压力，再保留选择权",44,"#ffffff",730,"middle")}${text(64,1260,"这不是消极，而是风险偏好改变",38,"#466d68",650)}`),
  "s6-b1":shell("最后的判断","不拿确定的负担，去赌不确定的上涨",`${rect(64,500,952,245,"#f2eadb")}${text(120,580,"确定的负担",34,"#796b51",620)}${text(120,690,"月供｜利息｜长期承诺",51,"#9a6d32",760)}${text(540,850,"VS",54,"#b99759",760,"middle")}${rect(64,950,952,245,"#dcece6")}${text(120,1030,"不确定的上涨",34,"#607973",620)}${text(120,1140,"资产价格｜投资回报",51,"#0d746a",760)}${rect(64,1280,952,150,"#153e3d")}${text(540,1375,"先把家庭现金流守住",48,"#ffffff",760,"middle")}`),
};

const presenterIds=new Set(["s1-b1","s1-b2","s2-b1","s2-b2","s2-b3","s3-b1","s3-b3","s4-b1","s4-b3","s5-b2","s5-b3","s6-b1","s6-b2"]);
const layoutOverrides={"s1-b3":"fullscreen","s1-b4":"fullscreen","s2-b4":"fullscreen","s3-b2":"fullscreen","s3-b4":"fullscreen","s4-b2":"fullscreen","s4-b4":"fullscreen","s5-b1":"fullscreen","s5-b2":"fullscreen","s5-b4":"fullscreen","s6-b1":"fullscreen"};
const materials=[];
const segments=[];
for(const [index,shot] of plan.shots.entries()){
  const segment={...shot,intent:shot.narrativeRole,layout:presenterIds.has(shot.id)?"presenter":layoutOverrides[shot.id]||shot.layout};
  segments.push(segment);
  if(presenterIds.has(shot.id)){materials.push({kind:"presenter",source:"xiaogu-presenter-anchor",license:"project-owned",title:shot.text});continue;}
  if(shot.id==="s4-b2"){
    materials.push({kind:"image",file:sceneFile,source:"openai-imagegen",license:"project-owned",title:"收入波动下的家庭现金流压力",points:[shot.text]});continue;
  }
  const svg=cards[shot.id];
  if(!svg)throw new Error(`Missing card for ${shot.id}`);
  const file=path.join(dir,`card-${String(index+1).padStart(2,"0")}-${shot.id}.jpg`);
  await sharp(Buffer.from(svg)).jpeg({quality:95}).toFile(file);
  materials.push({kind:"image",file,source:/^s1-b[34]$|^s3-b4$/.test(shot.id)?"xiaogu-official-evidence-card":"xiaogu-director-card",license:"project-owned",title:shot.text,points:[shot.text]});
}

const result=await finalize(master,segments,materials,"",segments.map(s=>s.text).join(""),dir,"这笔贷款，要不要先还掉？","9:16",{
  subtitleFile,subtitleMaxChars:13,subtitleFontSize:13,showTitle:true,titleDuration:2.2,
  titleText:"有余钱，贷款要不要先还？",timelineMode:"semantic",snapCutsToCaptions:true,transitionSeconds:.18,
});
const reviewSheet=await createReviewSheet(result.output,dir,segments,result.durationSeconds,.55,result.shotTimeline);
const sources=[
  {title:"中国人民银行金融统计数据",url:"https://www.pbc.gov.cn/diaochatongjisi/116219/116225/index.html"},
  {title:"2026年8月份70个大中城市商品住宅销售价格变动情况",url:"https://www.stats.gov.cn/sj/zxfb/202609/t20260915_1965304.html"},
  {title:"国家统计局对2026年8月份商品住宅销售价格数据的解读",url:"https://www.stats.gov.cn/zwfwck/sjfb/202609/t20260915_1965303.html"},
];
await writeFile(path.join(dir,"result.json"),JSON.stringify({...result,reviewSheet,master,segments,materials,options:{subtitleMaxChars:13,subtitleFontSize:13,titleDuration:2.2,transitionSeconds:.18,audioSource:"continuous-presenter-master",audioNormalization:"dynaudnorm+limiter"},sources},null,2));
console.log(JSON.stringify({dir,output:result.output,cover:result.cover,reviewSheet,durationSeconds:result.durationSeconds}));
