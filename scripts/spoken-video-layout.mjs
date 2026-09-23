export function videoSafeLayout(width,height,fontSize=height>width?12:18){
  if(![width,height,fontSize].every(v=>Number.isFinite(v)&&v>0))throw new Error("Invalid video layout");
  // FFmpeg's SRT decoder uses a 288-high ASS canvas, not output pixels.
  const scale=height/288,marginV=height>width?24:22;
  const subtitleTop=Math.floor(height-(marginV+fontSize*2.8+4)*scale);
  const size=height>width?340:300,gap=Math.ceil(6*scale);
  const pip={x:width-size-34,y:subtitleTop-gap-size,size};
  return {marginV,fontSize,subtitleTop,pip,pipFits:pip.x>=0&&pip.y>=Math.ceil(height*.18)};
}

// Stock photo presenters and the legacy circular presenter both occupy the
// right side.  Keep supporting panels in the left safe column by default.
// A future transparent-presenter master may provide an explicit safe column.
export function presenterOverlayFrame(width,height,layout="presenter-overlay"){
  const portrait=height>width;
  const widthRatio=layout==="presenter-evidence"?.40:layout==="presenter-data"?.31:.36;
  const heightRatio=layout==="presenter-evidence"?.28:layout==="presenter-data"?.22:.34;
  const even=value=>Math.floor(value/2)*2;
  const panelWidth=even(width*widthRatio),panelHeight=even(height*heightRatio);
  const x=Math.round(width*.04);
  const y=Math.round(height*(layout==="presenter-data"?.16:portrait?.27:.18));
  return {x,y,width:panelWidth,height:panelHeight,side:"left"};
}

export function safeSemanticLayout(segment,material){
  if(material?.kind==="presenter")return "presenter";
  // Director shot modes own the composition.  Do not let an older material
  // hint silently turn a side visual back into the circular PIP fallback.
  if(segment.visualTreatment==="side-asset"||segment.visualTreatment==="background-replacement")return "presenter-overlay";
  if(segment.visualTreatment==="keyword-motion")return "presenter";
  if(segment.visualTreatment==="data-widget"||segment.visualTreatment==="evidence-snippet")return "fullscreen";
  // Explicit director decisions outrank a legacy card's internal PIP hint.
  if(segment.visualTreatment==="motion-card"||segment.layout==="fullscreen"&&["evidence","explain"].includes(segment.intent))return "fullscreen";
  if(material?.source==="xiaogu-knowledge-card-expression")return material.presentation?.endsWith(":pip-safe")?"presenter-pip":"fullscreen";
  if(["evidence","explain"].includes(segment.intent))return "fullscreen";
  return segment.layout||"presenter-pip";
}

export function expressionSafeTitleDuration(shots,requested=4.5,transition=0){
  const first=shots.find(shot=>shot.showMaterial&&shot.material?.source==="xiaogu-knowledge-card-expression");
  return first?Math.max(0,Math.min(requested,first.start-transition/2)):requested;
}
