import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile,rename,copyFile,rm,readdir,stat} from 'node:fs/promises';
import path from 'node:path';
import {mediaFingerprint} from './spoken-video-render-cache.mjs';
import {measureVideoStage} from './spoken-video-performance.mjs';
const pending=new Map(),lastPruned=new Map();
// Scoped directories, atomic publication and content verification; bounded retention.
export async function pruneVideoCache(dir,{maxBytes=4*1024**3,maxAgeMs=7*86400000}={}){
  if(Date.now()-(lastPruned.get(dir)||0)<3600000)return;
  lastPruned.set(dir,Date.now());
  const entries=await readdir(dir,{withFileTypes:true}).catch(()=>[]);
  const rows=await Promise.all(entries.filter(e=>e.isFile()).map(async e=>{const file=path.join(dir,e.name);return {file,...await stat(file).catch(()=>({size:0,mtimeMs:Date.now()}))};}));
  rows.sort((a,b)=>b.mtimeMs-a.mtimeMs);let bytes=0;
  for(const row of rows){bytes+=row.size;if(Date.now()-row.mtimeMs>maxAgeMs||bytes>maxBytes)await rm(row.file,{force:true});}
}
export async function cachedMaterial(dir,identity,produce){
  await mkdir(dir,{recursive:true,mode:0o700});await pruneVideoCache(dir);
  const key=createHash('sha256').update(JSON.stringify(identity)).digest('hex'),file=path.join(dir,key+'.json');
  try{
    const data=JSON.parse(await readFile(file,'utf8'));
    if(Date.now()-data.savedAt<86400000&&(!data.material.file||await mediaFingerprint(data.material.file)===data.hash))return measureVideoStage('material_cache_hit',async()=>data.material);
  }catch{}
  if(pending.has(file))return pending.get(file);
  const work=(async()=>{
    const material=await measureVideoStage('material_generate',produce);
    const saved={...material};let hash=null;
    if(material.file){hash=await mediaFingerprint(material.file);const target=path.join(dir,hash+path.extname(material.file));const temporary=target+'.'+randomUUID()+'.tmp';try{await copyFile(material.file,temporary);await rename(temporary,target);}finally{await rm(temporary,{force:true});}saved.file=target;}
    const temporary=file+'.'+randomUUID()+'.tmp';try{await writeFile(temporary,JSON.stringify({savedAt:Date.now(),material:saved,hash}),{mode:0o600});await rename(temporary,file);}finally{await rm(temporary,{force:true});}
    return saved;
  })();pending.set(file,work);try{return await work;}finally{pending.delete(file);}
}
