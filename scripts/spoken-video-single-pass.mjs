import {presenterOverlayFrame} from './spoken-video-layout.mjs';

export function singlePassArgs({master,shots,maskFile,titleCard,output,width,height,pipSize,safeLayout,total,decorate}){
  const args=['-y','-filter_complex_threads','1','-i',master];
  const filters=[],pipShots=shots.filter(s=>s.showMaterial&&s.layout==='presenter-pip');
  filters.push(`[0:v]fps=30,scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,split=${1+pipShots.length}[base]${pipShots.map((_,i)=>`[p${i}]`).join('')}`);
  let input=1,pip=0,base='base';
  for(const [i,shot] of shots.entries()){
    if(!shot.showMaterial)continue;
    const isVideo=shot.material.kind==='video';
    args.push(...(isVideo?['-stream_loop','-1']:['-framerate','30','-loop','1']),'-t',shot.length.toFixed(3),'-i',shot.material.file);
    const start=shot.start.toFixed(3),end=(shot.start+shot.length).toFixed(3);
    const overlay=presenterOverlayFrame(shot.layout,width,height,safeLayout);
    if(overlay){
      const fadeOut=Math.max(0,shot.length-.22).toFixed(3),target=overlay.x,slideEnd=(shot.start+.28).toFixed(3);
      filters.push(`[${input++}:v]fps=30,scale=${overlay.width}:${overlay.height}:force_original_aspect_ratio=decrease,pad=${overlay.width}:${overlay.height}:(ow-iw)/2:(oh-ih)/2:color=0xf4f1e8,setsar=1,format=rgba,fade=t=in:st=0:d=0.22:alpha=1,fade=t=out:st=${fadeOut}:d=0.22:alpha=1,setpts=PTS-STARTPTS+${start}/TB[m${i}]`);
      filters.push(`[${base}][m${i}]overlay=x='if(lt(t,${slideEnd}),-w+(${target}+w)*(t-${start})/0.28,${target})':y=${overlay.y}:eof_action=pass:repeatlast=0:enable='gte(t,${start})*lt(t,${end})'[b${i}]`);base=`b${i}`;
    }else{
      filters.push(`[${input++}:v]fps=30,scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,setpts=PTS-STARTPTS+${start}/TB[m${i}]`);
      filters.push(`[${base}][m${i}]overlay=eof_action=pass:repeatlast=0:enable='gte(t,${start})*lt(t,${end})'[b${i}]`);base=`b${i}`;
    }
    if(shot.layout==='presenter-pip'){
      args.push('-loop','1','-t',total.toFixed(3),'-i',maskFile);
      filters.push(`[p${pip++}]scale=${pipSize}:${pipSize}:force_original_aspect_ratio=increase,crop=${pipSize}:${pipSize},setsar=1[face${i}];[${input++}:v]format=gray[mask${i}];[face${i}][mask${i}]alphamerge[round${i}];[${base}][round${i}]overlay=${safeLayout.pip.x}:${safeLayout.pip.y}:eof_action=pass:enable='gte(t,${start})*lt(t,${end})'[pip${i}]`);base=`pip${i}`;
    }
  }
  args.push('-i',titleCard);filters.push(decorate(`[${base}]`,`[${input}:v]`));
  args.push('-filter_complex',filters.join(';'),'-map','[v]','-map','0:a:0','-af','dynaudnorm=f=500:g=15:p=.9:m=20,alimiter=limit=.841:level=false','-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p','-r','30','-c:a','aac','-b:a','192k','-t',total.toFixed(3),'-movflags','+faststart',output);
  return args;
}
