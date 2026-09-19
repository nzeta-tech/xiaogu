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
  if(["evidence","explain"].includes(segment.intent))return "fullscreen";
  return segment.layout||"presenter-pip";
}
