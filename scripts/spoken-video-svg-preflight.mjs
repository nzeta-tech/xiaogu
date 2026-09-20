// Conservative bounds for deterministic templates (not OCR of external artwork).
// Scale the complete composition when text would leave its canvas, preserving all text.
export function fitCardSvg(svg,width,height){
  let left=0,right=width,bottom=height;
  for(const match of svg.matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)){
    const attrs=match[1],attr=name=>attrs.match(new RegExp(`\\b${name}=["']([^"']+)["']`))?.[1];
    const x=Number(attr('x')),y=Number(attr('y')),size=Number(attr('font-size'));
    if(!Number.isFinite(x)||!Number.isFinite(y)||!size)continue;
    const text=match[2].replace(/&(?:amp|lt|gt|quot|apos);/g,'W');
    const length=Array.from(text).reduce((sum,c)=>sum+(/[\x00-\x7f]/.test(c)?.65:1),0)*size;
    const anchor=attr('text-anchor'),start=x-(anchor==='middle'?length/2:anchor==='end'?length:0);
    left=Math.min(left,start-8);right=Math.max(right,start+length+8);bottom=Math.max(bottom,y+size*.25+12);
  }
  const scale=Math.min(1,width/(right-left),height/bottom);
  if(scale===1)return svg;
  const inner=svg.replace('<svg ','<svg overflow="visible" ');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><g transform="translate(${-left*scale} 0) scale(${scale})">${inner}</g></svg>`;
}

export function cardContentBounds(svg,width,height){
  if(fitCardSvg(svg,width,height)!==svg)return {width,height,left:0,top:0,right:width,bottom:height};
  let left=width,top=height,right=0,bottom=0;
  for(const [,attrs,value] of svg.matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)){
    const attr=name=>attrs.match(new RegExp(`\\b${name}=["']([^"']+)["']`))?.[1];
    const x=Number(attr('x')),y=Number(attr('y')),size=Number(attr('font-size'));if(!size||!Number.isFinite(x)||!Number.isFinite(y))continue;
    const length=Array.from(value.replace(/&[^;]+;/g,'W')).reduce((sum,c)=>sum+(/[\x00-\x7f]/.test(c)?.65:1),0)*size;
    const anchor=attr('text-anchor'),start=x-(anchor==='middle'?length/2:anchor==='end'?length:0);
    left=Math.min(left,start-16);right=Math.max(right,start+length+16);top=Math.min(top,y-size-16);bottom=Math.max(bottom,y+size*.25+24);
  }
  return {width,height,left,top,right,bottom};
}
