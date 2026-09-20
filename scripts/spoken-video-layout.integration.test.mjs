import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,writeFile,rm,readdir,stat} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import sharp from "sharp";
import {finalize} from "./spoken-video-production.mjs";
import {videoSafeLayout} from "./spoken-video-layout.mjs";
const exec=promisify(execFile);

test("real FFmpeg PIP pixels stay above subtitle pixels and unchanged shots are reused",{timeout:120000},async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),"video-safe-area-"));
  try{
    const master=path.join(dir,"master.mp4"),material=path.join(dir,"material.jpg"),srt=path.join(dir,"original.srt");
    await exec("ffmpeg",["-v","error","-y","-f","lavfi","-i","color=c=red:s=360x640:r=30","-f","lavfi","-i","anullsrc=r=44100:cl=stereo","-t","2","-c:v","libx264","-preset","ultrafast","-c:a","aac",master]);
    await sharp({create:{width:1080,height:1920,channels:3,background:"#0022aa"}}).jpeg().toFile(material);
    await writeFile(srt,"1\n00:00:00,000 --> 00:00:02,000\nSAFE CAPTIONS\n");
    for(const [ratio,width,height,fontSize] of [["9:16",1080,1920,18],["16:9",1920,1080,24]]){
      const args=[master,[{id:"s1",text:"SAFE CAPTIONS",intent:"scene",layout:"presenter-pip"}],[{kind:"image",file:material,source:"fixture"}],"","SAFE CAPTIONS",dir,"Fixture",ratio,{timelineMode:"semantic",subtitleFile:srt,subtitleFontSize:fontSize,showTitle:false,transitionSeconds:0}];
      const final=await finalize(...args);
      const png=await exec("ffmpeg",["-v","error","-ss","1","-i",final.output,"-frames:v","1","-f","image2pipe","-vcodec","png","-"],{encoding:"buffer",maxBuffer:10*1024*1024});
      const {data,info}=await sharp(png.stdout).removeAlpha().raw().toBuffer({resolveWithObject:true});
      let redBottom=-1,whiteTop=height,redCount=0,whiteCount=0;
      for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*info.width+x)*info.channels,r=data[i],g=data[i+1],b=data[i+2];if(r>180&&g<80&&b<80){redBottom=Math.max(redBottom,y);redCount++;}if(r>220&&g>220&&b>220){whiteTop=Math.min(whiteTop,y);whiteCount++;}}
      assert(redCount>10000);assert(whiteCount>100);assert(redBottom<whiteTop,`${ratio}: PIP ${redBottom}, subtitle ${whiteTop}`);
      assert(redBottom<videoSafeLayout(width,height,fontSize).subtitleTop);
      const clips=(await readdir(dir)).filter(f=>/^shot-[a-f0-9]{64}\.mp4$/.test(f));
      const before=await Promise.all(clips.map(async f=>[f,(await stat(path.join(dir,f))).mtimeMs]));
      await finalize(...args);
      assert.deepEqual(await Promise.all(clips.map(async f=>[f,(await stat(path.join(dir,f))).mtimeMs])),before);
    }
    const fallback=await finalize(master,[{id:"s1",text:"SAFE CAPTIONS"}],[{kind:"presenter",source:"xiaogu-presenter-anchor"}],"","SAFE CAPTIONS",dir,"Fixture","9:16",{subtitleFile:srt,showTitle:false,transitionSeconds:0});
    assert.ok((await stat(fallback.output)).size>20000,"basic-mode presenter fallback needs no material file");
  }finally{await rm(dir,{recursive:true,force:true});}
});
