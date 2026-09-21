import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import sharp from 'sharp';
import {finalize} from './spoken-video-production.mjs';
import {videoSafeLayout} from './spoken-video-layout.mjs';
const exec=promisify(execFile);
test('rollback: real 13-second full-screen card remains full-screen after final composition',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'spoken-rollback-'));
 try{
 const master=path.join(dir,'master.mp4'),card=path.join(dir,'card.jpg'),srt=path.join(dir,'original.srt');
 await exec('ffmpeg',['-v','error','-y','-f','lavfi','-i','color=green:s=320x568:r=30:d=13','-f','lavfi','-i','anullsrc=r=48000:cl=stereo','-t','13','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac',master]);
 await sharp({create:{width:1080,height:1920,channels:3,background:'#ffffff'}}).jpeg().toFile(card);
 await writeFile(srt,'1\n00:00:00,000 --> 00:00:13,000\nSAFE CAPTIONS\n');
 const final=await finalize(master,[{id:'s1',text:'SAFE CAPTIONS',intent:'explain',layout:'fullscreen'}],[{kind:'image',file:card,source:'xiaogu-knowledge-card'}],'','SAFE CAPTIONS',dir,'Fixture','9:16',{subtitleFile:srt,showTitle:false,timelineMode:'semantic',transitionSeconds:0});
 const pip=videoSafeLayout(1080,1920).pip;
 const {stdout}=await exec('ffmpeg',['-v','error','-ss','6','-i',final.output,'-frames:v','1','-vf',`crop=2:2:${pip.x+170}:${pip.y+170}`,'-f','rawvideo','-pix_fmt','rgb24','-'],{encoding:'buffer'});
 assert(stdout.length>=12);assert([...stdout].every(v=>v>235),'A full-screen card must not be replaced by green presenter PIP');
 }finally{await rm(dir,{recursive:true,force:true});}
});
