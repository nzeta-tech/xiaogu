import os from 'node:os';
import path from 'node:path';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execute=promisify(execFile);
async function heygen(args){
  const env={...process.env};delete env.HEYGEN_API_KEY;
  const proxy=process.env.HEYGEN_CLI_PROXY_URL;if(proxy)Object.assign(env,{HTTP_PROXY:proxy,HTTPS_PROXY:proxy,ALL_PROXY:proxy});
  try{const {stdout}=await execute(process.env.HEYGEN_CLI_BIN||'heygen',args,{env,timeout:120000,maxBuffer:4*1024*1024});const data=JSON.parse(stdout);return data.data||data;}
  catch{throw new Error('声音服务调用失败，请稍后重试');}
}
export async function executeSpokenVoiceClone(task,leaseToken,ctx,deps={}){
  const cli=deps.cli||heygen;
  const checkpoint=(action,extra={})=>ctx.remote('/api/internal/local-agent/spoken-voice',{taskId:task.id,agentId:ctx.agentId,leaseToken,action,...extra});
  const {voice}=await checkpoint('state');
  let providerVoiceId=voice.providerVoiceId;
  if(!providerVoiceId){
    // No provider idempotency key is available. An ambiguous submission must
    // stop for reconciliation, never silently create another paid clone.
    if(voice.submissionStarted)throw new Error('声音提交结果待核对，请联系管理员后重试');
    const dir=await mkdtemp(path.join(os.tmpdir(),'xiaogu-voice-'));
    try{
      const response=await fetch(ctx.remoteBase+'/api/internal/local-agent/spoken-voice',{method:'POST',headers:{authorization:`Bearer ${ctx.token}`,'content-type':'application/json'},body:JSON.stringify({taskId:task.id,agentId:ctx.agentId,leaseToken,action:'recording'}),signal:AbortSignal.timeout(90000)});
      if(!response.ok)throw new Error('录音读取失败');
      const source=path.join(dir,'recording'),mp3=path.join(dir,'recording.mp3');
      await writeFile(source,Buffer.from(await response.arrayBuffer()));
      await execute('ffmpeg',['-y','-i',source,'-ac','1','-ar','44100','-b:a','192k',mp3],{timeout:90000,maxBuffer:2*1024*1024}).catch(()=>{throw new Error('录音无法解码，请重新录制');});
      const asset=await cli(['asset','create','--file',mp3]);
      if(!asset.asset_id)throw new Error('声音服务未接收录音');
      await checkpoint('reserve');
      const clone=await cli(['voice','clone','create','--voice-name',voice.name,'-d',JSON.stringify({audio:{type:'asset_id',asset_id:asset.asset_id},voice_name:voice.name,language:'zh'})]);
      providerVoiceId=clone.voice_clone_id;
      if(!providerVoiceId)throw new Error('声音服务未返回任务编号');
      await checkpoint('checkpoint',{providerVoiceId});
    }finally{await rm(dir,{recursive:true,force:true});}
  }
  const deadline=Date.now()+(deps.timeoutMs||600000);
  do{
    const current=await cli(['voice','get',providerVoiceId]);
    if(['complete','completed','ready'].includes(current.status))return {status:'completed',providerVoiceId};
    if(current.status==='failed')throw new Error('声音克隆失败，请检查录音后重试');
    await (deps.sleep||((ms)=>new Promise(resolve=>setTimeout(resolve,ms))))(10000);
  }while(Date.now()<deadline);
  throw new Error('声音仍在处理中，任务将自动重试查询');
}
