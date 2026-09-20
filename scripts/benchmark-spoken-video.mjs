// Offline benchmark: consumes an existing local manifest; no service, model, upload or publication calls.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {finalize} from './spoken-video-production.mjs';
import {createReviewSheet} from './spoken-video-quality.mjs';
import {performanceScope,videoMetrics} from './spoken-video-performance.mjs';
const [manifest,destination]=process.argv.slice(2);
if(!manifest||!destination)throw Error('Usage: node scripts/benchmark-spoken-video.mjs <result.json> <new-output-directory>');
const input=JSON.parse(await readFile(manifest,'utf8')),root=path.resolve(destination);
await mkdir(root,{recursive:true});
const results=[];
for(const strategy of ['single-pass','segments']){
  const dir=path.join(root,strategy);await mkdir(dir,{recursive:true});
  await performanceScope(dir,async()=>{
    const start=performance.now();
    const result=await finalize(input.master,input.segments,input.materials,'',input.segments.map(s=>s.text).join(''),dir,'1080p 性能验证','9:16',{...input.options,subtitleFile:input.subtitleFile,timelineMode:'semantic',transitionSeconds:0,renderStrategy:strategy});
    const renderMs=performance.now()-start;
    const extraction={};
    for(const mode of ['batch','seek']){process.env.LOCAL_AGENT_VIDEO_FRAME_MODE=mode;const start=performance.now();await createReviewSheet(result.output,dir,input.segments,result.durationSeconds,.55,result.shotTimeline);extraction[mode]=Math.round(performance.now()-start);}
    const warmStart=performance.now();await finalize(input.master,input.segments,input.materials,'',input.segments.map(s=>s.text).join(''),dir,'1080p 性能验证','9:16',{...input.options,subtitleFile:input.subtitleFile,timelineMode:'semantic',transitionSeconds:0,renderStrategy:strategy});
    results.push({strategy,renderMs:Math.round(renderMs),warmMs:Math.round(performance.now()-warmStart),extraction,durationSeconds:result.durationSeconds,metrics:videoMetrics()});
    await writeFile(path.join(root,'benchmark.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results.at(-1)));
  });
}
