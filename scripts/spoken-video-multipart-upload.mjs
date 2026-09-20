import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import path from 'node:path';
import {mapVideoWork} from './spoken-video-concurrency.mjs';
export async function uploadVideoParts({base,token,jobId,kind,file,size,name,contentType,cacheDir,fetchImpl=fetch,partBytes=8*1024*1024,concurrency=8}){
  const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);const sha256=hash.digest('hex');
  const count=Math.ceil(size/partBytes);if(count>64||size>500*1024*1024)throw Error('媒体文件不能超过 500 MB');
  const cacheFile=cacheDir?path.join(cacheDir,`upload-${jobId}-${kind}-${sha256}.json`):null;let saved={parts:{}};
  if(cacheFile){await mkdir(cacheDir,{recursive:true});try{saved=JSON.parse(await readFile(cacheFile,'utf8'));}catch{}}
  let saves=Promise.resolve();const persist=()=>{if(!cacheFile)return Promise.resolve();const data=JSON.stringify(saved);saves=saves.then(async()=>{await writeFile(cacheFile+'.tmp',data,{mode:0o600});await rename(cacheFile+'.tmp',cacheFile);});return saves;};
  const call=async(url,options)=>{for(let attempt=0;attempt<3;attempt++){try{const response=await fetchImpl(url,{...options(),signal:AbortSignal.timeout(600000)});if(response.status>=500||response.status===429){await response.body?.cancel();throw Error('upload_temporarily_unavailable');}const result=await response.json();if(!response.ok){const error=new Error(`分片上传失败（${response.status}）`);error.permanent=true;throw error;}return result;}catch(error){if(error.permanent||attempt===2)throw error;await new Promise(r=>setTimeout(r,1000*(attempt+1)));}}};
  const parts=await mapVideoWork(Array.from({length:count},(_,i)=>i),concurrency,async index=>{
    if(saved.parts[index])return saved.parts[index];
    const start=index*partBytes,end=Math.min(size,start+partBytes)-1;
    const result=await call(`${base}/api/internal/local-agent/digital-human/media?${new URLSearchParams({jobId,kind:'material'})}`,()=>({method:'PUT',headers:{authorization:`Bearer ${token}`,'content-type':'video/mp4','content-length':String(end-start+1),'x-xiaogu-upload-part':'1'},body:createReadStream(file,{start,end}),duplex:'half'}));
    if(result.size!==end-start+1||typeof result.id!=='string')throw Error('上传分片不完整');saved.parts[index]=result.id;await persist();return result.id;
  });
  const result=await call(`${base}/api/internal/local-agent/digital-human/media`,()=>({method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({jobId,kind,parts,size,sha256,fileName:name.slice(0,240),contentType})}));
  if(result.size!==size||typeof result.url!=='string')throw Error('成片上传不完整');return result;
}
