import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {mkdir,stat,open,rename,copyFile,rm} from 'node:fs/promises';
import path from 'node:path';
async function digest(file){const h=createHash('sha256');for await(const b of createReadStream(file))h.update(b);return h.digest('hex');}
const sizeOf=async file=>{try{return (await stat(file)).size;}catch(e){if(e.code==='ENOENT')return 0;throw e;}};
export async function downloadPresenterMaster({url,headers,identity,cacheDir,file,fetchImpl=fetch,idleMs=60000,totalMs=1800000,attempts=4,partBytes=4*1024*1024,sleep=ms=>new Promise(r=>setTimeout(r,ms))}){
 if(!identity||!Number.isSafeInteger(identity.size)||identity.size<1||identity.size>500*1024*1024||!/^\w{8}-[\w-]{27}$/.test(identity.id)||!/^[a-f0-9]{64}$/.test(identity.sha256))throw Error('母片校验信息缺失或无效');
 const key=createHash('sha256').update(JSON.stringify([new URL(url).origin,identity.id,identity.size,identity.sha256])).digest('hex');
 await mkdir(cacheDir,{recursive:true,mode:0o700});const complete=path.join(cacheDir,key+'.mp4'),partial=path.join(cacheDir,key+'.part');
 if(await sizeOf(complete)===identity.size&&await digest(complete)===identity.sha256){await copyFile(complete,file);return {cacheHit:true,resumedBytes:identity.size};}
 await rm(complete,{force:true});if(await sizeOf(partial)>identity.size)await rm(partial,{force:true});
 const resumedBytes=await sizeOf(partial),deadline=Date.now()+totalMs;let failures=0;
 while(await sizeOf(partial)<identity.size){
  if(Date.now()>=deadline)throw Error('原口播母片下载超过总时限，可从已下载位置恢复');
  const start=await sizeOf(partial),end=Math.min(start+partBytes,identity.size)-1;
  const controller=new AbortController();let idle;const reset=()=>{clearTimeout(idle);idle=setTimeout(()=>controller.abort(Error('母片下载连续无数据超时')),idleMs);};
  const total=setTimeout(()=>controller.abort(Error('母片下载总时限已到')),deadline-Date.now());let handle,response;
  try{
   reset();response=await fetchImpl(url,{headers:{...headers,range:`bytes=${start}-${end}`},signal:controller.signal,redirect:'error'});
   if([401,403,404].includes(response.status))throw Object.assign(Error(`母片读取被拒绝（${response.status}）`),{permanent:true});
   if(response.status!==206||response.headers.get('content-range')!==`bytes ${start}-${end}/${identity.size}`||Number(response.headers.get('content-length'))!==end-start+1||response.headers.get('content-encoding'))throw Error(`母片续传响应无效（${response.status}），已保留下载进度`);
   if(!response.body)throw Error('母片下载响应为空');
   handle=await open(partial,'a',0o600);let received=0;
   for await(const chunk of response.body){reset();if(received+chunk.length>end-start+1)throw Object.assign(Error('母片分段长度异常'),{permanent:true});let offset=0;while(offset<chunk.length){const result=await handle.write(chunk,offset,chunk.length-offset);if(!result.bytesWritten)throw Error('母片缓存写入失败');offset+=result.bytesWritten;}received+=chunk.length;}
   if(received!==end-start+1)throw Error('母片分段未完整下载');
   failures=0;
  }catch(error){controller.abort();failures++;if(error.permanent||failures>=attempts||Date.now()>=deadline)throw Error(`原口播母片下载失败，已保留 ${await sizeOf(partial)}/${identity.size} 字节：${error.message}`);await sleep(Math.min(failures*1000,3000));}
  finally{controller.abort();clearTimeout(idle);clearTimeout(total);await handle?.close();}
 }
 if(await digest(partial)!==identity.sha256){await rm(partial,{force:true});throw Error('母片 SHA-256 校验失败，已丢弃错误缓存');}
 await rename(partial,complete);await copyFile(complete,file);return {cacheHit:false,resumedBytes};
}
