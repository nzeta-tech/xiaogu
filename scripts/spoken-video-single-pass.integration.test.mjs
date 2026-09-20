import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,stat,readFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {finalize} from './spoken-video-production.mjs';
import {createReviewSheet} from './spoken-video-quality.mjs';
const exec=promisify(execFile);
test('single-pass cuts/PIP remain frame-aligned at 1080p with continuous audio; QA reuses unchanged frames',{timeout:120000},async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'single-pass-'));
  try{
    const master=path.join(dir,'master.mp4'),blue=path.join(dir,'blue.jpg'),green=path.join(dir,'green.jpg'),srt=path.join(dir,'source.srt');
    await exec('ffmpeg',['-v','error','-y','-f','lavfi','-i','color=red:s=360x640:r=30','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','6','-c:v','libx264','-preset','ultrafast','-c:a','aac',master]);
    await sharp({create:{width:1080,height:1920,channels:3,background:'#0022ee'}}).jpeg().toFile(blue);
    await sharp({create:{width:1080,height:1920,channels:3,background:'#00cc22'}}).jpeg().toFile(green);
    await writeFile(srt,'1\n00:00:00,000 --> 00:00:02,000\nONE\n\n2\n00:00:02,000 --> 00:00:04,000\nTWO\n\n3\n00:00:04,000 --> 00:00:06,000\nEND\n');
    const segments=[{id:'one',text:'one',layout:'presenter'},{id:'two',text:'two',layout:'presenter-pip'},{id:'end',text:'end',layout:'fullscreen'}];
    const result=await finalize(master,segments,[{kind:'presenter',source:'fixture'},{kind:'image',file:blue,source:'fixture'},{kind:'image',file:green,source:'fixture'}],'','one two end',dir,'Fixture','9:16',{timelineMode:'semantic',subtitleFile:srt,showTitle:false,transitionSeconds:0});
    assert.equal(result.renderStrategy,'single-pass');assert(Math.abs(result.durationSeconds-6)<.1);
    for(const [time,color] of [[1,0],[3,2],[5,1]]){
      const {stdout}=await exec('ffmpeg',['-v','error','-ss',String(time),'-i',result.output,'-frames:v','1','-f','image2pipe','-vcodec','png','-'],{encoding:'buffer',maxBuffer:10e6});
      const {data,info}=await sharp(stdout).removeAlpha().raw().toBuffer({resolveWithObject:true});assert.equal(info.width,1080);assert.equal(info.height,1920);
      const index=(300*info.width+200)*info.channels;assert(data[index+color]>150,`wrong visual at ${time}s`);
    }
    const audio=await exec('ffmpeg',['-v','info','-i',result.output,'-vn','-af','silencedetect=noise=-50dB:d=0.05','-f','null','-']);assert.doesNotMatch(audio.stderr,/silence_start/);
    await createReviewSheet(result.output,dir,segments,6,.5,result.shotTimeline);
    const first=JSON.parse(await readFile(path.join(dir,'qa-samples.json'),'utf8')).findIndex(s=>s.label==='one');
    const file=path.join(dir,`qa-frame-${first}.jpg`),mtime=(await stat(file)).mtimeMs;
    await createReviewSheet(result.output,dir,segments,6,.5,result.shotTimeline,{changedIds:['end']});
    assert.equal((await stat(file)).mtimeMs,mtime);
    const many=Array.from({length:12},(_,i)=>({id:`b${i}`,text:'x',layout:'presenter'}));
    await createReviewSheet(result.output,dir,many,6,.5,many.map((_,i)=>({start:i*.5,length:.5,layout:'presenter',showMaterial:false})));
    assert((await stat(path.join(dir,'qa-batch-1.jpg'))).size>0);
  }finally{await rm(dir,{recursive:true,force:true});}
});
