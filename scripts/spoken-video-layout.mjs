export function videoSafeLayout(width,height,fontSize=height>width?12:18){
  if(![width,height,fontSize].every(v=>Number.isFinite(v)&&v>0))throw new Error("Invalid video layout");
  // FFmpeg's SRT decoder uses a 288-high ASS canvas, not output pixels.
  // Portrait social-video controls and captions occupy the lower edge. Keep
  // our two-line subtitle block above that interaction zone instead of merely
  // clearing the physical frame boundary.
  const scale=height/288,marginV=height>width?36:22;
  const subtitleTop=Math.floor(height-(marginV+fontSize*2.8+4)*scale);
  const size=height>width?340:300,gap=Math.ceil(6*scale);
  const pip={x:width-size-34,y:subtitleTop-gap-size,size};
  return {marginV,fontSize,subtitleTop,pip,pipFits:pip.x>=0&&pip.y>=Math.ceil(height*.18)};
}

export function safeSemanticLayout(segment,material){
  if(material?.kind==="presenter")return "presenter";
  // An explicit recut instruction is a delivery constraint. It must win over a
  // compact card's otherwise-safe PIP preference.
  if(segment.forceFullscreen===true)return "fullscreen";
  if(["presenter-overlay","presenter-data","presenter-evidence"].includes(segment.layout))return segment.layout;
  if(material?.source==="xiaogu-knowledge-card-expression")return material.presentation?.endsWith(":pip-safe")?"presenter-pip":"fullscreen";
  if(["evidence","explain"].includes(segment.intent))return "fullscreen";
  return segment.layout||"presenter-pip";
}

function relationKind(segment){
  return String(segment?.expression?.kind||"").trim();
}

// Keep the presenter's visual continuity while giving whole AI-generated cards
// several editorial roles. This is deterministic so basic and smart editions
// share one composition grammar even when only smart mode runs the AI director.
export function diversifySemanticLayouts(segments=[]){
  let fullscreenRun=0,cardIndex=0;
  return segments.map(segment=>{
    if(segment?.forceFullscreen===true){fullscreenRun++;return {...segment,layout:"fullscreen"};}
    if(segment?.layout==="presenter"||segment?.intent==="anchor"){
      fullscreenRun=0;return {...segment,layout:"presenter"};
    }
    const text=String(segment?.text||""),relation=relationKind(segment);
    const dense=Array.from(text).length>88||["sequence","timeline","parts"].includes(relation)&&Array.from(text).length>44;
    const hasNumber=/\d+(?:\.\d+)?\s*(?:%|％|万|亿|元|年|个月|港币|美元)?/.test(text);
    let layout;
    if(segment?.intent==="evidence")layout=dense?"fullscreen":"presenter-evidence";
    else if(["scene","emotion"].includes(segment?.intent))layout="presenter-overlay";
    else if(dense)layout="fullscreen";
    else {
      const cycle=hasNumber
        ? ["presenter-data","presenter-pip","fullscreen","presenter-data"]
        : ["presenter-overlay","presenter-pip","presenter-data","fullscreen"];
      layout=cycle[cardIndex%cycle.length];
      cardIndex++;
    }
    // Do not let a long explanation collapse back into a slideshow. A compact
    // data/evidence overlay is the safe breaker after two full-screen cards.
    if(layout==="fullscreen"&&fullscreenRun>=2)layout=segment?.intent==="evidence"?"presenter-evidence":"presenter-data";
    fullscreenRun=layout==="fullscreen"?fullscreenRun+1:0;
    return {...segment,layout};
  });
}

export function aiCardLayoutDirection(layout){
  if(layout==="presenter-data")return "用于人物主画面上的数据浮层：整张卡只保留一个大数字、一个短标题和一句结论，文字必须超大且高对比，禁止表格与小字。";
  if(layout==="presenter-evidence")return "用于人物主画面上的证据浮层：突出一个准确事实或引文与来源标签，最多三行正文，禁止装饰性数字和细小脚注。";
  if(layout==="presenter-overlay")return "用于人物主画面上的场景浮层：以一个强视觉隐喻和极短标题为主，不超过一句辅助说明，禁止密集信息。";
  if(layout==="presenter-pip")return "用于全屏知识卡并叠加圆形人物：右下区域不得放标题、数字或关键图形，核心内容集中在顶部和左侧。";
  return "用于全屏知识卡：建立清楚的标题、主视觉与核心结论层级，底部字幕安全区保持低细节。";
}

export function presenterOverlayFrame(layout,width,height,safeLayout=videoSafeLayout(width,height)){
  const portrait=height>width;
  const specs=portrait?{
    "presenter-overlay":{width:Math.round(width*.43),height:Math.round(height*.31),x:42,y:Math.round(height*.2)},
    "presenter-data":{width:Math.round(width*.48),height:Math.round(height*.34),x:42,y:Math.round(height*.18)},
    "presenter-evidence":{width:Math.round(width*.54),height:Math.round(height*.39),x:42,y:Math.round(height*.17)},
  }:{
    "presenter-overlay":{width:Math.round(width*.36),height:Math.round(height*.52),x:64,y:Math.round(height*.18)},
    "presenter-data":{width:Math.round(width*.39),height:Math.round(height*.55),x:64,y:Math.round(height*.16)},
    "presenter-evidence":{width:Math.round(width*.43),height:Math.round(height*.59),x:64,y:Math.round(height*.14)},
  };
  const frame=specs[layout];if(!frame)return null;
  frame.height=Math.min(frame.height,safeLayout.subtitleTop-frame.y-28);
  return frame.width>100&&frame.height>100?frame:null;
}

export function expressionSafeTitleDuration(shots,requested=4.5,transition=0){
  const first=shots.find(shot=>shot.showMaterial&&shot.material?.source==="xiaogu-knowledge-card-expression");
  return first?Math.max(0,Math.min(requested,first.start-transition/2)):requested;
}
