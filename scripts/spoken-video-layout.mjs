export function videoSafeLayout(width,height,fontSize=height>width?12:18){
  if(![width,height,fontSize].every(v=>Number.isFinite(v)&&v>0))throw new Error("Invalid video layout");
  // FFmpeg's SRT decoder uses a 288-high ASS canvas, not output pixels.
  const scale=height/288,marginV=height>width?24:22;
  const subtitleTop=Math.floor(height-(marginV+fontSize*2.8+4)*scale);
  const size=height>width?340:300,gap=Math.ceil(6*scale);
  const pip={x:width-size-34,y:subtitleTop-gap-size,size};
  return {marginV,fontSize,subtitleTop,pip,pipFits:pip.x>=0&&pip.y>=Math.ceil(height*.18)};
}

export function safeSemanticLayout(segment,material){
  if(material?.kind==="presenter")return "presenter";
  if(["presenter-overlay","presenter-data","presenter-evidence"].includes(segment.layout))return segment.layout;
  if(material?.source==="xiaogu-knowledge-card-expression")return material.presentation?.endsWith(":pip-safe")?"presenter-pip":"fullscreen";
  if(["evidence","explain"].includes(segment.intent))return "fullscreen";
  return segment.layout||"presenter-pip";
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
