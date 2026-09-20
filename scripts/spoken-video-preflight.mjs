// Runs on final caption-snapped timings, before any encoding.
export function preflightShots(shots,total,{maxFullscreenSeconds=12}={}){
  let cursor=0,away=0;const changes=[];
  const result=shots.map((input,index)=>{
    const shot={...input};
    if(!Number.isFinite(shot.start)||!Number.isFinite(shot.length)||shot.length<.1||Math.abs(shot.start-cursor)>.12)throw Error('镜头时间轴存在空隙或重叠');
    cursor=shot.start+shot.length;
    if(shot.showMaterial&&shot.layout==='fullscreen'){
      if(away+shot.length>maxFullscreenSeconds){shot.layout='presenter-pip';changes.push({index,reason:'连续全屏时间过长，使用内容安全区与主播画中画'});away=0;}
      else away+=shot.length;
    }else away=0;
    return shot;
  });
  if(Math.abs(cursor-total)>.12)throw Error('镜头时间轴没有完整覆盖口播');
  return {shots:result,changes};
}
export function changedReviewScope(previous,current){
  if(!previous||previous.global!==current.global)return null;
  const indices=new Set();
  for(let i=0;i<current.shots.length;i++)if(current.shots[i]!==previous.shots[i])for(const n of [i-1,i,i+1])if(n>=0&&n<current.shots.length)indices.add(n);
  return [...indices].sort((a,b)=>a-b);
}
