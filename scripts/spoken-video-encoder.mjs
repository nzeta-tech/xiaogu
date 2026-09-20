import os from 'node:os';
import {measureVideoStage} from './spoken-video-performance.mjs';
const probes=new Map();
export const softwareVideoArgs=['-c:v','libx264','-preset','veryfast','-crf','20'];
export async function videoEncoder(run){
  const requested=process.env.LOCAL_AGENT_VIDEO_ENCODER||'auto';
  if(requested==='libx264'||(requested==='auto'&&os.platform()!=='darwin'))return 'libx264';
  if(!['auto','h264_videotoolbox','h264_nvenc'].includes(requested))throw Error('Unsupported video encoder');
  const encoder=requested==='auto'?'h264_videotoolbox':requested;
  if(!probes.has(encoder))probes.set(encoder,run('ffmpeg',['-v','error','-f','lavfi','-i','color=s=128x128:r=30','-t','0.1','-c:v',encoder,'-f','null','-']).then(()=>encoder,()=> 'libx264'));
  return probes.get(encoder);
}
export async function encodeVideo(run,args,options={}){
  const encoder=await videoEncoder(run),index=args.indexOf('-c:v');
  if(index<0||args[index+1]!=='libx264')return run('ffmpeg',args,options);
  if(encoder==='libx264')return measureVideoStage('encode_libx264',()=>run('ffmpeg',args,options));
  const hardware=[...args];hardware.splice(index,6,'-c:v',encoder,'-b:v','8M','-maxrate','12M','-bufsize','16M');
  try{return await measureVideoStage(`encode_${encoder}`,()=>run('ffmpeg',hardware,options));}catch{probes.set(encoder,Promise.resolve('libx264'));return measureVideoStage('encode_software_fallback',()=>run('ffmpeg',args,options));}
}
